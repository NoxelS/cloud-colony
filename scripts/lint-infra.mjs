import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const images = JSON.parse(readFileSync(new URL("./tool-images.json", import.meta.url), "utf8"));
const workflows = readdirSync(new URL("../.github/workflows/", import.meta.url))
  .filter((file) => /\.ya?ml$/.test(file))
  .sort()
  .map((file) => `.github/workflows/${file}`);
if (workflows.length === 0) {
  throw new Error("No GitHub Actions workflows found");
}

for (const [name, files] of [
  ["actionlint", workflows],
  ["hadolint", ["Dockerfile"]],
]) {
  console.log(`Running ${name}`);
  const result = spawnSync(
    "docker",
    [
      "run",
      "--rm",
      "--read-only",
      "--network",
      "none",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--entrypoint",
      name,
      "--mount",
      `type=bind,src=${root},dst=/workspace,readonly`,
      "--workdir",
      "/workspace",
      images[name],
      ...files,
    ],
    { cwd: root, stdio: "inherit", timeout: 120_000 },
  );
  if (result.error) {
    throw new Error(`Could not run ${name}: ${result.error.message}. Docker must be running.`);
  }
  if (result.status !== 0) {
    throw new Error(`${name} failed with ${result.signal ?? result.status}`);
  }
}
