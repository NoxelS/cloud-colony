import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export function listAgents(root) {
  const names = readdirSync(join(root, "src/agents"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (names.length === 0) throw new Error("No agent directories found in src/agents");

  return names.map((name) => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(name)) {
      throw new Error(`Invalid agent directory name: ${name}`);
    }
    const directory = `src/agents/${name}`;
    const dockerfile = `${directory}/Dockerfile`;
    const fixture = `tests/fixtures/${name}.mjs`;
    for (const file of [`${directory}/index.ts`, dockerfile, fixture]) {
      if (!statSync(join(root, file), { throwIfNoEntry: false })?.isFile()) {
        throw new Error(`${name} requires ${file}`);
      }
    }
    const image =
      name === "hello-world"
        ? "ghcr.io/noxels/cloud-colony"
        : `ghcr.io/noxels/cloud-colony-${name}`;
    return { name, image, dockerfile, fixture };
  });
}

if (import.meta.main) {
  console.log(JSON.stringify(listAgents(process.cwd())));
}
