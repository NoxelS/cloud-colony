import { execFileSync } from "node:child_process";

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trimEnd();
}

const commits = git("rev-list", "--first-parent", "HEAD").split("\n");
const distances = new Map(commits.map((commit, distance) => [commit, distance]));
const stableVersion = /^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u;
const tags = new Map();
for (const line of git(
  "for-each-ref",
  "--sort=-version:refname",
  "--format=%(refname:lstrip=2) %(objectname) %(*objectname)",
  "refs/tags",
).split("\n")) {
  const [tag, object, peeled] = line.split(" ");
  if (stableVersion.test(tag)) tags.set(tag, peeled || object);
}

// First-parent distance keeps the version tied to main history when CI runs finish out of order.
let version = `v0.0.${commits.length}`;
let nearest = commits.length;
for (const [tag, commit] of tags) {
  const distance = distances.get(commit);
  if (distance === undefined || distance >= nearest) continue;

  const patchStart = tag.lastIndexOf(".") + 1;
  version = `${tag.slice(0, patchStart)}${BigInt(tag.slice(patchStart)) + BigInt(distance)}`;
  nearest = distance;
}

if (tags.has(version) && tags.get(version) !== commits[0]) {
  throw new Error(`${version} already points to a different commit`);
}
console.log(version);
