import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const mode = process.argv[2] ?? "success";
const entrypoint = resolve("dist/agents/hello-world/index.js");
const apiKey = "smoke-test-key";
let requests = 0;
const server = createServer(async (request, response) => {
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

  if (mode === "reject") {
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
  LITELLM_BASE_URL: baseUrl,
  LITELLM_API_KEY: apiKey,
  LITELLM_MODEL: "must-not-override-the-hardcoded-model",
};
let directory;
try {
  if (mode === "dotenv") {
    directory = await mkdtemp(join(tmpdir(), "cloud-colony-smoke-"));
    await writeFile(
      join(directory, ".env"),
      `LITELLM_BASE_URL=${baseUrl}\nLITELLM_API_KEY=${apiKey}\n`,
    );
    delete env.LITELLM_BASE_URL;
    delete env.LITELLM_API_KEY;
  }
  try {
    const result = await promisify(execFile)(
      process.execPath,
      [...(mode === "dotenv" ? ["--env-file=.env"] : []), entrypoint],
      {
        cwd: directory ?? process.cwd(),
        env,
        timeout: 5_000,
      },
    );
    assert.notEqual(mode, "reject", "The agent must fail when LiteLLM rejects the request");
    assert.equal(result.stderr, "");
    assert.equal(result.stdout, "Hello world!\n");
    process.stdout.write(result.stdout);
  } catch (error) {
    if (mode !== "reject") throw error;
    assert.equal(error.code, 1);
    assert.equal(error.stdout, "");
    assert.match(error.stderr, /LiteLLM did not answer/);
    assert.ok(!error.stderr.includes(apiKey), "Errors must not print credentials");
  }
  assert.equal(requests, 1, "The agent must make exactly one request");
} finally {
  server.closeAllConnections();
  await new Promise((resolveClose, reject) =>
    server.close((error) => (error ? reject(error) : resolveClose())),
  );
  if (directory) await rm(directory, { recursive: true, force: true });
}
