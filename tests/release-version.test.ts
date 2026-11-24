import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, it } from "vitest";

const script = fileURLToPath(new URL("../scripts/release-version.mjs", import.meta.url));
let root: string;

function git(...args: string[]): string {
  return execFileSync(
    "git",
    [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "-c",
      "commit.gpgSign=false",
      ...args,
    ],
    { cwd: root, encoding: "utf8", stdio: "pipe" },
  ).trim();
}

function commit(message: string): void {
  git("commit", "--allow-empty", "-m", message);
}

function releaseVersion(): string {
  return execFileSync(process.execPath, [script], {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
  }).trim();
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cloud-colony-version-"));
  git("init", "--initial-branch=main");
  commit("Initial commit");
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

it("gives successive main commits distinct versions before either run creates a tag", () => {
  expect(releaseVersion()).toBe("v0.0.1");
  commit("First change");
  const first = git("rev-parse", "HEAD");
  expect(releaseVersion()).toBe("v0.0.2");
  commit("Second change");
  expect(releaseVersion()).toBe("v0.0.3");

  git("tag", "v0.0.3");
  git("checkout", first);
  expect(releaseVersion()).toBe("v0.0.2");
});

it("increments an existing stable tag by one for a merge and reuses the tag on reruns", () => {
  git("tag", "-a", "v1.4.8", "-m", "Previous release");
  git("checkout", "-b", "feature");
  commit("First feature commit");
  commit("Second feature commit");
  git("tag", "v9.0.0");
  git("checkout", "main");
  git("merge", "--no-ff", "feature", "-m", "Merge feature");
  git("tag", "v1.4.9-rc.1");
  expect(releaseVersion()).toBe("v1.4.9");
  git("tag", "v1.4.9");
  expect(releaseVersion()).toBe("v1.4.9");
  commit("Next change");
  expect(releaseVersion()).toBe("v1.4.10");
});

it("fails when the calculated version is already tagged on a different commit", () => {
  git("checkout", "-b", "feature");
  commit("Feature change");
  git("tag", "v0.0.2");
  git("checkout", "main");
  commit("Main change");

  expect(releaseVersion).toThrow("v0.0.2 already points to a different commit");
});
