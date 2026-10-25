import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";

const directories: string[] = [];
const probe = `console.log("COLONY_ENV=" + JSON.stringify({
  baseUrl: process.env.LITELLM_BASE_URL ?? null,
  apiKey: process.env.LITELLM_API_KEY ?? null,
}));`;
const dotenv = "LITELLM_BASE_URL=http://local.test/v1\nLITELLM_API_KEY=local-test-key\n";

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

async function run(
  mode: "dev" | "start",
  options: { dotenv?: string; environment?: NodeJS.ProcessEnv } = {},
): Promise<unknown> {
  const directory = mkdtempSync(join(tmpdir(), "cloud-colony-env-"));
  directories.push(directory);
  mkdirSync(join(directory, "src"));
  mkdirSync(join(directory, "dist"));
  writeFileSync(join(directory, "package.json"), '{"type":"module"}');
  writeFileSync(join(directory, "src/index.ts"), probe);
  writeFileSync(join(directory, "dist/index.js"), probe);
  if (options.dotenv !== undefined) {
    writeFileSync(join(directory, ".env"), options.dotenv);
  }

  // Exercise the actual startup commands, with isolated entrypoints and fake credentials.
  const { scripts } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const script: unknown = scripts[mode];
  assert.ok(typeof script === "string");
  const [command, ...args] = script.split(" ");
  if (command === "tsx") {
    args.unshift(fileURLToPath(import.meta.resolve("tsx/cli")));
  } else {
    assert.equal(command, "node", "Update the fixture runner if the startup executable changes");
  }

  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: mode === "dev" ? "development" : "production",
  };
  delete environment.LITELLM_BASE_URL;
  delete environment.LITELLM_API_KEY;
  Object.assign(environment, options.environment);

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: directory,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Startup timed out: ${stderr}`));
    }, 5_000);
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
      if (mode === "dev" && stdout.includes("\n")) child.kill("SIGTERM");
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      const line = stdout.split("\n").find((value) => value.startsWith("COLONY_ENV="));
      if (!line || (mode === "start" && code !== 0)) {
        reject(new Error(`Startup failed (${code}): ${stderr}`));
        return;
      }
      try {
        resolve(JSON.parse(line.slice("COLONY_ENV=".length)));
      } catch (error) {
        reject(error);
      }
    });
  });
}

it("loads the local .env in development", async () => {
  expect(await run("dev", { dotenv })).toEqual({
    baseUrl: "http://local.test/v1",
    apiKey: "local-test-key",
  });
});

it("preserves injected environment values over local .env values", async () => {
  expect(await run("dev", { dotenv, environment: { LITELLM_API_KEY: "shell-test-key" } })).toEqual({
    baseUrl: "http://local.test/v1",
    apiKey: "shell-test-key",
  });
});

it("allows development to start without a .env file", async () => {
  expect(await run("dev")).toEqual({ baseUrl: null, apiKey: null });
});

it("does not read a local .env in production", async () => {
  expect(await run("start", { dotenv })).toEqual({ baseUrl: null, apiKey: null });
});

it("reads injected production configuration", async () => {
  expect(
    await run("start", {
      environment: {
        LITELLM_BASE_URL: "https://gateway.test/v1",
        LITELLM_API_KEY: "secret-test-key",
      },
    }),
  ).toEqual({ baseUrl: "https://gateway.test/v1", apiKey: "secret-test-key" });
});
