import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const root = fileURLToPath(new URL("../", import.meta.url));
const { values } = parseArgs({
  options: {
    platform: { type: "string" },
    tag: { type: "string", default: "cloud-colony:check" },
    "skip-build": { type: "boolean", default: false },
  },
});

if (values.platform && !["linux/amd64", "linux/arm64"].includes(values.platform)) {
  throw new Error("--platform must be linux/amd64 or linux/arm64");
}
if (!values.tag || values.tag.startsWith("-")) {
  throw new Error("--tag must be a Docker image name");
}

const nodeVersion = readFileSync(new URL("../.node-version", import.meta.url), "utf8").trim();
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const dockerfile = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
assert.equal(
  dockerfile.match(/^FROM node:(\d+\.\d+\.\d+)-bookworm-slim@sha256:[a-f0-9]{64} AS base$/m)?.[1],
  nodeVersion,
  "Dockerfile and .node-version must use the same pinned Node version",
);
assert.equal(
  dockerfile.match(/^ARG PNPM_VERSION=(.+)$/m)?.[1],
  packageJson.packageManager.replace("pnpm@", ""),
  "Dockerfile and packageManager must use the same pinned pnpm version",
);

function docker(args, { capture = false, timeout = 120_000 } = {}) {
  const result = spawnSync("docker", args, {
    cwd: root,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
    timeout,
  });
  if (result.error) {
    throw new Error(`Could not run docker ${args[0]}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    if (capture) {
      process.stderr.write(result.stderr ?? "");
      process.stderr.write(result.stdout ?? "");
    }
    throw new Error(`docker ${args[0]} failed with ${result.signal ?? result.status}`);
  }
  return result.stdout ?? "";
}

const platform = values.platform ? ["--platform", values.platform] : [];
if (!values["skip-build"]) {
  docker(["build", ...platform, "--tag", values.tag, "."], { timeout: 600_000 });
}
const user = docker(["image", "inspect", "--format", "{{.Config.User}}", values.tag], {
  capture: true,
}).trim();
assert.ok(user && !/^(?:root|0)(?::|$)/.test(user), "Container must declare a non-root user");
const runArgs = [
  "run",
  "--rm",
  ...platform,
  "--read-only",
  "--network",
  "none",
  "--cap-drop",
  "ALL",
  "--security-opt",
  "no-new-privileges",
  values.tag,
];
const version = docker([...runArgs, "node", "--version"], { capture: true, timeout: 30_000 });
assert.equal(version, `v${nodeVersion}\n`, "Container must run the pinned Node version");
const stdout = docker(runArgs, { capture: true, timeout: 30_000 });
assert.equal(stdout, "Hello from cloud-colony\n", "Container must print the expected greeting");
console.log(
  `Container smoke test passed: ${values.tag}${values.platform ? ` (${values.platform})` : ""}`,
);
