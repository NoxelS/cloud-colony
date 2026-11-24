import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";

const mode = process.argv[2] ?? "success";
const entrypoint = resolve("dist/agents/hello-world/index.js");
const apiKey = "smoke-test-key";
let requests = 0;
const traceSpans = [];
const { promise: exported, resolve: finishExport } = Promise.withResolvers();
const server = createServer(async (request, response) => {
  if (mode === "trace" && request.url === "/v1/traces") {
    assert.equal(request.method, "POST");
    assert.equal(request.headers.authorization, "Bearer smoke-test-tracing-key");
    let body = "";
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    const spans = payload.resourceSpans.flatMap(({ scopeSpans }) =>
      scopeSpans.flatMap(({ spans }) => spans),
    );
    traceSpans.push(...spans);
    if (
      traceSpans.filter(({ name }) => name === "hello-world").length === 2 &&
      traceSpans.filter(({ name }) => name === "pi.ai.request").length === 2
    ) {
      finishExport();
    }
    response.end("{}");
    return;
  }
  requests += 1;
  assert.equal(request.method, "POST");
  assert.equal(request.url, "/v1/chat/completions");
  assert.equal(request.headers.authorization, `Bearer ${apiKey}`);
  let body = "";
  for await (const chunk of request) body += chunk;
  const payload = JSON.parse(body);
  assert.equal(payload.model, "qwen3.8-27b");
  assert.equal(payload.stream, true);
  assert.equal(payload.max_tokens, 128);
  assert.ok(
    payload.messages.some(
      (message) =>
        message.role === "user" && message.content === "Reply with exactly: Hello world!",
    ),
  );

  if (mode === "reject" && requests === 1) {
    response.writeHead(401, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: { message: `Invalid key: ${apiKey}` } }));
    return;
  }
  response.writeHead(200, { "Content-Type": "text/event-stream" });
  for (const delta of [{ role: "assistant", content: "Hello " }, { content: "world!" }]) {
    response.write(
      `data: ${JSON.stringify({
        id: "smoke-test",
        object: "chat.completion.chunk",
        created: 0,
        model: payload.model,
        choices: [{ index: 0, delta, finish_reason: null }],
      })}\n\n`,
    );
  }
  response.end(
    `data: ${JSON.stringify({
      id: "smoke-test",
      object: "chat.completion.chunk",
      created: 0,
      model: payload.model,
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 },
    })}\n\ndata: [DONE]\n\n`,
  );
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
assert.ok(address && typeof address !== "string");
const baseUrl = `http://127.0.0.1:${address.port}/v1`;
const env = {
  ...process.env,
  PORT: "0",
  A2A_BASE_URL: "",
  LITELLM_BASE_URL: baseUrl,
  LITELLM_API_KEY: apiKey,
  LITELLM_MODEL: "must-not-override-the-hardcoded-model",
  ...(mode === "trace" && {
    LENS_OTLP_ENDPOINT: `${baseUrl}/traces`,
    LITELLM_TRACING_KEY: "smoke-test-tracing-key",
  }),
};
const advertisedUrl = "http://hello-world.example.test:8080/";
let directory;
try {
  if (mode === "dotenv") {
    directory = await mkdtemp(join(tmpdir(), "cloud-colony-smoke-"));
    await writeFile(
      join(directory, ".env"),
      `LITELLM_BASE_URL=${baseUrl}\nLITELLM_API_KEY=${apiKey}\nA2A_BASE_URL=${advertisedUrl}\n`,
    );
    delete env.A2A_BASE_URL;
    delete env.LITELLM_BASE_URL;
    delete env.LITELLM_API_KEY;
  }
  const child = spawn(
    process.execPath,
    [...(mode === "dotenv" ? ["--env-file=.env"] : []), entrypoint],
    {
      cwd: directory ?? process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const exited = once(child, "exit");
  const lines = createInterface({ input: child.stdout });
  const deadline = setTimeout(() => child.kill("SIGKILL"), 8_000);
  let stderr = "";
  child.stderr.setEncoding("utf8").on("data", (chunk) => {
    stderr += chunk;
  });
  try {
    const { value: line } = await lines[Symbol.asyncIterator]().next();
    assert.match(line ?? "", /^A2A listening on port [0-9]+$/);
    const origin = `http://127.0.0.1:${line.split(" ").at(-1)}`;
    for (const path of ["/healthz", "/readyz"]) {
      assert.equal((await fetch(`${origin}${path}`)).status, 200);
    }
    const discovery = await fetch(`${origin}/.well-known/agent-card.json`);
    assert.equal(discovery.status, 200);
    const card = await discovery.json();
    assert.equal(card.name, "Hello World");
    assert.equal(card.supportedInterfaces.length, 1);
    const [agentInterface] = card.supportedInterfaces;
    assert.equal(agentInterface.url, mode === "dotenv" ? advertisedUrl : `${origin}/`);
    assert.equal(agentInterface.protocolBinding, "JSONRPC");
    assert.equal(agentInterface.protocolVersion, "1.0");
    assert.equal(card.skills[0].id, "greet");
    assert.equal(card.capabilities.streaming ?? false, false);
    assert.equal(requests, 0);

    const rpc = async (id, method, params) => {
      const response = await fetch(new URL(new URL(agentInterface.url).pathname, origin), {
        method: "POST",
        headers: { "Content-Type": "application/json", "A2A-Version": "1.0" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id,
          method,
          params,
        }),
      });
      const result = await response.json();
      assert.equal(result.id, id);
      return result;
    };

    const send = (id, parts, messageId = id) =>
      rpc(id, "SendMessage", { message: { messageId, role: "ROLE_USER", parts } });

    if (mode === "client") {
      const client = spawn(process.execPath, ["dist/cli/a2a-client.js", origin], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      const clientClosed = once(client, "close");
      const clientDeadline = setTimeout(() => client.kill("SIGKILL"), 4_000);
      let output = "";
      let errors = "";
      client.stdout.setEncoding("utf8").on("data", (chunk) => {
        output += chunk;
      });
      client.stderr.setEncoding("utf8").on("data", (chunk) => {
        errors += chunk;
      });
      client.stdin.end("Hello\n\nHello again\n/quit\nIgnored\n");
      try {
        assert.deepEqual(await clientClosed, [0, null], errors);
        assert.equal(output, "Hello world!\nHello world!\n");
        assert.equal(requests, 2);
      } finally {
        clearTimeout(clientDeadline);
      }
    } else {
      assert.ok((await send("invalid", [{ text: "Hello" }], "")).error);
      assert.equal(requests, 0);
      if (mode === "reject") {
        const failure = await send("reject", [{ text: "Hello" }]);
        assert.equal(failure.error.code, -32603);
        const { result: taskList } = await rpc("list", "ListTasks", {});
        assert.deepEqual(taskList.tasks ?? [], []);
        assert.ok(!JSON.stringify(failure).includes(apiKey));
      }
      const replies = await Promise.all(
        ["first-greeting", "second-greeting"].map((id) => send(id, [{ text: "Hello" }])),
      );
      for (const reply of replies) {
        assert.equal(reply.result.message.role, "ROLE_AGENT");
        assert.deepEqual(reply.result.message.parts, [{ text: "Hello world!" }]);
      }
      assert.notEqual(replies[0].result.message.messageId, replies[1].result.message.messageId);
      assert.equal(requests, mode === "reject" ? 3 : 2);
    }
    if (mode === "trace") {
      await Promise.race([
        exported,
        exited.then(() => assert.fail("Agent exited before exporting both greeting traces")),
      ]);
      const roots = traceSpans.filter(({ name }) => name === "hello-world");
      const modelSpans = traceSpans.filter(({ name }) => name === "pi.ai.request");
      assert.notEqual(roots[0].traceId, roots[1].traceId);
      for (const root of roots) {
        const spans = traceSpans.filter(({ traceId }) => traceId === root.traceId);
        assert.deepEqual(spans.map(({ name }) => name).sort(), ["hello-world", "pi.ai.request"]);
        const models = modelSpans.filter(({ traceId }) => traceId === root.traceId);
        assert.equal(models.length, 1, "Each greeting trace includes its model request");
        assert.equal(models[0].parentSpanId, root.spanId);
        const output = root.attributes.find(({ key }) => key === "gen_ai.output.messages");
        assert.deepEqual(JSON.parse(output.value.stringValue), [
          { role: "assistant", parts: [{ type: "text", content: "Hello world!" }] },
        ]);
        assert.ok(
          models[0].attributes.some(
            ({ key, value }) => key === "gen_ai.operation.name" && value.stringValue === "chat",
          ),
        );
      }
    }
    child.kill("SIGTERM");
    assert.deepEqual(await exited, [0, null]);
    assert.ok(!stderr.includes(apiKey), "Errors must not print credentials");
  } finally {
    clearTimeout(deadline);
    child.kill("SIGKILL");
    await exited;
    lines.close();
  }
} finally {
  server.closeAllConnections();
  await new Promise((resolveClose, reject) =>
    server.close((error) => (error ? reject(error) : resolveClose())),
  );
  if (directory) await rm(directory, { recursive: true, force: true });
}
