export function readLiteLlmConfig(env: NodeJS.ProcessEnv): { baseUrl: string; apiKey: string } {
  const baseUrl = env.LITELLM_BASE_URL?.trim();
  const apiKey = env.LITELLM_API_KEY?.trim();
  if (!baseUrl || !apiKey) {
    throw new Error(
      "Set LITELLM_BASE_URL and LITELLM_API_KEY in .env for development or the process environment.",
    );
  }
  if (!URL.canParse(baseUrl) || !["http:", "https:"].includes(new URL(baseUrl).protocol)) {
    throw new Error("LITELLM_BASE_URL must be an HTTP or HTTPS URL.");
  }
  return { baseUrl, apiKey };
}
