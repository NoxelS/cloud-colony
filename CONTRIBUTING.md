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

Keep shared implementation in `src/core` only when it is concrete and reusable. Each additional agent belongs under `src/agents/<name>` and needs its own entrypoint, `src/agents/<name>/Dockerfile`, and deterministic mock fixture. The root `Dockerfile` and `tests/fixtures/run-agent.mjs` build and test hello-world. Use its `agent-base` runtime stage as the reference for new images. Package the agent's compiled entrypoint, required core code, and production dependencies. Run the agent directly as a non-root user with root-owned application files. Keep new Dockerfiles covered by `scripts/lint-infra.mjs` and the Dockerfile matcher in `renovate.json`.

Add one static agent/image/Dockerfile entry to each of these four workflow matrix lists:
1. `.github/workflows/ci.yml` → `containers` build, scan, and tested-image artifact matrix (one row per agent and architecture).
2. `.github/workflows/ci.yml` → `publish-platforms` matrix (one row per agent and architecture).
3. `.github/workflows/ci.yml` → `publish` manifest matrix (one row per agent).
4. `.github/workflows/release.yml` → `promote` matrix (one row per agent).

The image needs its own GHCR repository except that hello-world retains `ghcr.io/noxels/cloud-colony`. Preserve the explicit architecture rows (`amd64`, `arm64`) for build and platform publication. Use agent-and-architecture-qualified tags, artifact names, and digest files so artifacts cannot collide. The manifest job must download only that agent's two digests. A new agent shares the coordinated semantic version tag and GitHub release; it does not get an independently versioned release.

## Releases

The package is private; releases publish container images and GitHub release notes.
1. Merge the intended changes to `main`.
2. Fetch `origin/main` and wait for that exact commit's main CI run to succeed and publish its SHA image.
3. Create an unused semantic version tag on the verified commit:

   ```sh
   git tag v0.1.0 origin/main
   git push origin v0.1.0
   ```

4. Check the release workflow and confirm the version image digest matches the corresponding SHA image digest.

Use the next intended version in place of `v0.1.0`. The release workflow verifies main ancestry and successful CI, promotes the existing multi-architecture image, and creates release notes. If main CI has not published the image yet, finish that run before retrying the release workflow.

## Repository setup

These are GitHub settings and service configuration, separate from files committed to this repository:
- Require the aggregate `ci` check on `main` and use pull requests for changes.
- Enable squash merging and use Conventional Commit PR titles.
- Allow the publishing workflow to write packages through `GITHUB_TOKEN`; keep default workflow permissions read-only.
- Enable GitHub Actions and grant Renovate access to this repository if it is not already installed.
- Choose the GHCR package visibility appropriate for the deployment environment. The workflow does not change package visibility.

Renovate tracks dependency versions, Node pins, Docker references, and GitHub Actions. Maintenance updates are grouped, major updates remain separate, automatic merging is disabled, and updates wait three days after release where timestamps are available. Review CI results and compatibility before merging an update.

Keep Node runtime pins aligned between `.node-version`, `package.json`, and the Dockerfile. When changing Node majors, update `@types/node` to the matching major and run all checks.
