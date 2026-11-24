import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, it } from "vitest";

const script = fileURLToPath(new URL("../scripts/list-agents.mjs", import.meta.url));
let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cloud-colony-agents-"));
  mkdirSync(join(root, "tests/fixtures"), { recursive: true });
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

function addAgent(name: string): void {
  mkdirSync(join(root, "src/agents", name), { recursive: true });
  writeFileSync(join(root, "src/agents", name, "index.ts"), "");
  writeFileSync(join(root, "src/agents", name, "Dockerfile"), "");
  writeFileSync(join(root, "tests/fixtures", `${name}.mjs`), "");
}

function listAgents(): string {
  return execFileSync(process.execPath, [script], { cwd: root, encoding: "utf8", stdio: "pipe" });
}

it("lists each agent with its own Dockerfile, smoke fixture and registry image", () => {
  addAgent("worker");
  addAgent("hello-world");

  expect(JSON.parse(listAgents())).toEqual([
    {
      name: "hello-world",
      image: "ghcr.io/noxels/cloud-colony",
      dockerfile: "src/agents/hello-world/Dockerfile",
      fixture: "tests/fixtures/hello-world.mjs",
    },
    {
      name: "worker",
      image: "ghcr.io/noxels/cloud-colony-worker",
      dockerfile: "src/agents/worker/Dockerfile",
      fixture: "tests/fixtures/worker.mjs",
    },
  ]);
});

it.each(["src/agents/worker/Dockerfile", "tests/fixtures/worker.mjs"])(
  "fails discovery when %s is missing",
  (path) => {
    addAgent("worker");
    rmSync(join(root, path));

    expect(listAgents).toThrow(`worker requires ${path}`);
  },
);
