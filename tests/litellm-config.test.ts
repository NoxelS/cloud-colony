import { expect, it } from "vitest";
import { readLiteLlmConfig } from "../src/core/litellm-config.js";

it("trims the LiteLLM URL and key", () => {
  expect(
    readLiteLlmConfig({
      LITELLM_BASE_URL: " https://litellm.example/v1 ",
      LITELLM_API_KEY: " key ",
    }),
  ).toEqual({ baseUrl: "https://litellm.example/v1", apiKey: "key" });
});

it("rejects non-HTTP LiteLLM URLs", () => {
  expect(() =>
    readLiteLlmConfig({ LITELLM_BASE_URL: "file:///tmp/model", LITELLM_API_KEY: "key" }),
  ).toThrow("LITELLM_BASE_URL must be an HTTP or HTTPS URL.");
});
