import { randomUUID } from "node:crypto";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline";
import { type Part, Role, type SendMessageResult, TaskState } from "@a2a-js/sdk";
import { ClientFactory } from "@a2a-js/sdk/client";

function responseText(result: SendMessageResult): string {
  const parts: Part[] =
    "messageId" in result
      ? result.parts
      : [
          ...(result.status?.message?.parts ?? []),
          ...result.artifacts.flatMap(({ parts }) => parts),
        ];
  const text = parts
    .flatMap(({ content }) => (content?.$case === "text" ? [content.value] : []))
    .join("\n");
  if (text) return text;
  if ("messageId" in result) return "(No text in the response.)";
  const state = result.status?.state ?? TaskState.TASK_STATE_UNSPECIFIED;
  return `Task ${result.id}: ${TaskState[state]}`;
}

async function main(): Promise<void> {
  const [origin] = process.argv.slice(2);
  if (!origin) throw new Error("Usage: pnpm a2a:client <agent-base-url>");

  const client = await new ClientFactory().createFromUrl(origin);
  const terminal = Boolean(stdin.isTTY && stdout.isTTY);
  const lines = createInterface({ input: stdin, output: stdout, terminal, prompt: "you> " });
  const interrupted = new AbortController();
  lines.on("SIGINT", () => {
    interrupted.abort();
    lines.close();
  });

  let contextId = "";
  let taskId = "";
  try {
    if (terminal) lines.prompt();
    for await (const line of lines) {
      const text = line.trim();
      if (text === "/quit" || interrupted.signal.aborted) break;
      if (text) {
        try {
          const result = await client.sendMessage(
            {
              tenant: "",
              message: {
                messageId: randomUUID(),
                contextId,
                taskId,
                role: Role.ROLE_USER,
                parts: [
                  {
                    content: { $case: "text", value: text },
                    mediaType: "text/plain",
                    filename: "",
                    metadata: undefined,
                  },
                ],
                referenceTaskIds: [],
                extensions: [],
                metadata: undefined,
              },
              configuration: undefined,
              metadata: undefined,
            },
            { signal: AbortSignal.any([interrupted.signal, AbortSignal.timeout(45_000)]) },
          );
          contextId = result.contextId;
          taskId =
            "id" in result && result.status?.state === TaskState.TASK_STATE_INPUT_REQUIRED
              ? result.id
              : "";
          stdout.write(`${responseText(result)}\n`);
        } catch (error) {
          if (interrupted.signal.aborted) break;
          console.error(error instanceof Error ? error.message : "A2A request failed.");
          if (!terminal) process.exitCode = 1;
        }
      }
      if (terminal) lines.prompt();
    }
  } finally {
    lines.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Could not start the A2A client.");
  process.exitCode = 1;
});
