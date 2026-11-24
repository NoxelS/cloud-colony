import { execFile, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));

it.each(["success", "dotenv", "reject"])(
  "serves A2A requests with a mock LiteLLM endpoint: %s",
  async (mode) => {
    const result = await promisify(execFile)(
      process.execPath,
      ["tests/fixtures/hello-world.mjs", mode],
      {
        cwd: root,
        encoding: "utf8",
        timeout: 10_000,
      },
    );
    expect(result.stderr).toBe("");
  },
);

it.each([
  { baseUrl: "", apiKey: "test-key", message: "Set LITELLM_BASE_URL and LITELLM_API_KEY" },
  {
    baseUrl: "http://127.0.0.1:1/v1",
    apiKey: "",
    message: "Set LITELLM_BASE_URL and LITELLM_API_KEY",
  },
  {
    baseUrl: "invalid",
    apiKey: "test-key",
    message: "LITELLM_BASE_URL must be an HTTP or HTTPS URL",
  },
])(
  "fails before making a request with invalid configuration: $message",
  ({ baseUrl, apiKey, message }) => {
    const result = spawnSync(process.execPath, ["dist/agents/hello-world/index.js"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, LITELLM_BASE_URL: baseUrl, LITELLM_API_KEY: apiKey },
      timeout: 5_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      `${message}${message.startsWith("Set") ? " in .env for development or the process environment." : "."}\n`,
    );
  },
);
