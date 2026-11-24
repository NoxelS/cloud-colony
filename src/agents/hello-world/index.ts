import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels, createProvider, type Model } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { AssistantEntry, createRegistry, Harness, MemoryStorage } from "@earendil-works/pi-durable";
import { startA2aServer } from "../../core/a2a/server.js";
import { createTextMessageHandler } from "../../core/a2a/text-message.js";
import { readLiteLlmConfig } from "../../core/litellm-config.js";

async function main(): Promise<void> {
  const { baseUrl, apiKey } = readLiteLlmConfig(process.env);

  const model = {
    id: "qwen3.8-27b",
    name: "Qwen 3.8 27B",
    api: "openai-completions",
    provider: "litellm",
    baseUrl,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 32_768,
    maxTokens: 128,
    compat: { maxTokensField: "max_tokens" },
  } satisfies Model<"openai-completions">;

  const models = createModels();
  models.setProvider(
    createProvider({
      id: "litellm",
      name: "LiteLLM",
      baseUrl,
      auth: { apiKey: { name: "LiteLLM API key", resolve: async () => ({ auth: { apiKey } }) } },
      models: [model],
      api: openAICompletionsApi(),
    }),
  );

  await startA2aServer(
    {
      name: "Hello World",
      description: "Returns a model-generated hello-world greeting.",
      version: "1.0.0",
      provider: undefined,
      capabilities: {
        streaming: false,
        pushNotifications: false,
        extendedAgentCard: false,
        extensions: [],
      },
      securitySchemes: {},
      securityRequirements: [],
      defaultInputModes: ["text/plain"],
      defaultOutputModes: ["text/plain"],
      signatures: [],
      skills: [
        {
          id: "greet",
          name: "Greet",
          description: "Send a text message to receive a greeting.",
          tags: ["greeting"],
          examples: ["Hello"],
          inputModes: ["text/plain"],
          outputModes: ["text/plain"],
          securityRequirements: [],
        },
      ],
    },
    (card) =>
      createTextMessageHandler(card, async () => {
        try {
          return await greet(models, model);
        } catch {
          throw new Error("The greeting model did not answer.");
        }
      }),
    process.env,
  );
}

async function greet(
  models: ReturnType<typeof createModels>,
  model: Model<"openai-completions">,
): Promise<string> {
  const context = BACKGROUND_CONTEXT;
  const harness = await Harness.open(
    new MemoryStorage(),
    {
      models,
      registry: createRegistry(),
      settings: { retry: { enabled: false }, stream: { timeoutMs: 30_000, maxRetries: 0 } },
    },
    context,
  );
  try {
    const conversation = await harness.root(context, {
      agent: { model: { provider: model.provider, modelId: model.id }, thinkingLevel: "off" },
    });
    const submission = await conversation.submit(
      { type: "input", content: "Reply with exactly: Hello world!" },
      context,
    );
    const settled = await submission.wait(context);
    if (settled.status !== "done" || settled.type !== "input") {
      throw new Error("LiteLLM did not answer. Check the base URL, API key, and model access.");
    }
    const entry = await conversation.commit(
      (tx) => tx.entry(AssistantEntry, settled.answer),
      context,
    );
    const message = entry?.model?.[0];
    const text =
      message?.role === "assistant"
        ? message.content
            .filter((block) => block.type === "text")
            .map((block) => block.text)
            .join("")
            .trim()
        : "";
    if (!text) throw new Error("The agent returned no text.");
    return text;
  } finally {
    await harness.close(context);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "The agent failed.");
  process.exitCode = 1;
});
