import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels, createProvider, type Model } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { AssistantEntry, createRegistry, Harness, MemoryStorage } from "@earendil-works/pi-durable";

async function main(): Promise<void> {
  const baseUrl = process.env.LITELLM_BASE_URL?.trim();
  const apiKey = process.env.LITELLM_API_KEY?.trim();
  if (!baseUrl || !apiKey) {
    throw new Error(
      "Set LITELLM_BASE_URL and LITELLM_API_KEY in .env for development or the process environment.",
    );
  }
  if (!URL.canParse(baseUrl) || !["http:", "https:"].includes(new URL(baseUrl).protocol)) {
    throw new Error("LITELLM_BASE_URL must be an HTTP or HTTPS URL.");
  }

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
    console.log(text);
  } finally {
    await harness.close(context);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "The agent failed.");
  process.exitCode = 1;
});
