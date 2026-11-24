# Contributing

Use the Node version in `.node-version` and the pnpm version in `package.json`. Install dependencies from the committed lockfile:

```sh
pnpm install --frozen-lockfile
```

Keep application changes small and include checks that exercise observable behavior. The hello world smoke test verifies the compiled executable; meaningful library tests and coverage requirements can grow with the implementation.

## Before opening a pull request

```sh
pnpm check
pnpm check:infra
pnpm check:container --platform linux/amd64
pnpm check:container --platform linux/arm64
```

The last two commands need a running Docker daemon. `pnpm format` applies formatting and safe fixes. Commit intentional changes to `pnpm-lock.yaml` when updating dependencies.

Use a Conventional Commit PR title, for example `chore: bootstrap Node tooling` or `fix: preserve task identity after restart`. Prefer squash merging so the PR title becomes the commit message.

## Adding an agent

Add `src/agents/<name>/index.ts`, `src/agents/<name>/Dockerfile`, and `tests/fixtures/<name>.mjs`. Use lowercase letters, digits, and hyphens in the name. The smoke fixture should execute the compiled agent against a deterministic mock and exit nonzero on failure.

Use the hello-world Dockerfile as the reference. Build from the repository root, package the agent's compiled entrypoint, required shared code from `src/core`, and production dependencies. Run the agent directly as a non-root user with root-owned application files.

CI, infrastructure linting, and releases discover agents from that layout. Adding an agent needs no workflow edits. Images use `ghcr.io/noxels/cloud-colony-<name>`, with hello-world retaining `ghcr.io/noxels/cloud-colony`. All agents share the repository's version tag and GitHub Release.

## Releases

Each merge to `main` gets the next patch version. After CI succeeds, the workflow applies the version to every tested image digest and creates the Git tag and GitHub Release. Rerun the same main workflow if a build or publication fails. A rerun uses the same version.

The version is based on the number of main commits since the last stable version tag. Before the first tag, the patch number counts main's history from the root commit. This keeps versions ordered by commit history when runs finish out of order, and a failed commit can leave a gap in the published versions.

## Repository setup

These are GitHub settings and service configuration, separate from files committed to this repository:
- Require the aggregate `ci` check on `main` and use pull requests for changes.
- Enable squash merging and use Conventional Commit PR titles.
- Allow the publishing workflow to write packages through `GITHUB_TOKEN`; keep default workflow permissions read-only.
- Allow the release job to create `v*` Git tags and GitHub Releases through `GITHUB_TOKEN`.
- Enable GitHub Actions and grant Renovate access to this repository if it is not already installed.
- Choose the GHCR package visibility appropriate for the deployment environment. The workflow does not change package visibility.

Renovate tracks dependency versions, Node pins, Docker references, and GitHub Actions. Maintenance updates are grouped, major updates remain separate, automatic merging is disabled, and updates wait three days after release where timestamps are available. Review CI results and compatibility before merging an update.

Keep Node runtime pins aligned between `.node-version`, `package.json`, and the Dockerfile. When changing Node majors, update `@types/node` to the matching major and run all checks.
