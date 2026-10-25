# Development Rules

## Conversational Style

- Keep answers short and concise
- No emojis in commits, issues, PR comments, or code
- No fluff or cheerful filler text (e.g., "Thanks @user" not "Thanks so much @user!")
- Technical prose only, be direct
- Use concise, clear, simple language. Define unavoidable jargon before using it.
- Explain non-trivial designs and problems as: problem, concrete example or short trace, then solution. State why the solution is necessary and distinguish it from optional complexity.
- Prefer concrete behavior and small illustrations over abstract summaries, dense terminology, or unexplained lists of changes.
- When the user asks a question, answer it first before making edits or running implementation commands.
- When responding to user feedback or an analysis, explicitly say whether you agree or disagree before saying what you changed.

## Repository Scope

- Read `README.md`, `CONTRIBUTING.md`, and the relevant configuration before making changes. Inspect complete files before editing them.
- The application currently consists of a TypeScript hello world. Keep this phase focused on development tooling, checks, containers, and delivery.
- Pi-durable execution, A2A communication, LiteLLM inference, OpenShell governance, and Kubernetes deployment are planned capabilities. Implement them when requested, rather than assuming they already exist.
- Keep one private package until a concrete shared library justifies workspace packages. Avoid speculative frameworks, empty package trees, and unused dependencies. Update this scope and the README as capabilities are introduced.

## Implementation

- Use the Node version in `.node-version` and pnpm version in `package.json`. Keep the Dockerfile and package engine constraints consistent with those pins.
- Application code is strict TypeScript with ESM and `NodeNext` resolution. `tsx` runs development code; `tsc` emits production JavaScript into `dist/`.
- Follow Biome and the existing compiler configuration. Prefer small functions and explicit types; avoid `any`, unchecked assertions, and abstractions without a concrete use.
- Resolve dependency API questions from the installed types and owning documentation. Use top-level imports and explicit `node:` imports for Node built-ins.
- Fix the underlying cause of failures. Preserve intentional behavior and validation instead of weakening them to make a check pass.
- Keep generated output, local reports, credentials, and `.env` files out of commits. Use temporary files for ad-hoc scripts and CLI message bodies.

## Commands and Validation

Run commands from the repository root. Docker must be available for infrastructure and container checks.

| Command                          | When to use it                                                |
| -------------------------------- | ------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | Reproduce the committed dependency graph                      |
| `pnpm dev`                       | Run the application with source watching                      |
| `pnpm build`                     | Compile application JavaScript                                |
| `pnpm start`                     | Run the existing production build                             |
| `pnpm lint`                      | Check Biome formatting, imports, and lint rules               |
| `pnpm format`                    | Apply formatting and safe fixes; review the resulting diff    |
| `pnpm typecheck`                 | Check application, test, and configuration types              |
| `pnpm test`                      | Build, then run Vitest; this is a local executable smoke test |
| `pnpm check`                     | Run linting, type checking, and tests, including the build    |
| `pnpm check:infra`               | Validate workflow YAML and the Dockerfile with pinned linters |
| `pnpm check:container`           | Build and verify the local container                          |
- For code, test, or TypeScript/tooling configuration changes, run `pnpm check`. For workflow, Dockerfile, or infrastructure-helper changes, also run `pnpm check:infra`; exercise affected container paths and architectures.
- Documentation-only edits need formatting, command/link verification, and `git diff --check`; they do not require rebuilding the application locally. GitHub CI still runs according to its workflow triggers.
- Run tests you change. Prefer tests of observable behavior, including the compiled executable, over assertions that merely repeat implementation details.
- Keep default tests deterministic and independent of external credentials. Future live-model tests need explicit opt-in and bounded cost; the presence of a key in the environment must not activate them.
- Inspect complete failure output, fix the cause, and report any check that could not run. Do not add retries, exclusions, or suppressions merely to obtain a green result.

## Development Workflow

Agents must run formatting and the applicable checks as part of an authorized change, without waiting for a separate request to lint or test.
1. Confirm the pinned Node and pnpm versions and inspect `git status`. Run `pnpm install --frozen-lockfile` when setting up a checkout or when dependencies change.
2. Make a small change. Use `pnpm dev` when source watching helps; it does not replace type checking or tests.
3. Apply Biome's formatting, import organization, and safe lint fixes to edited files. For example:

   ```sh
   pnpm exec biome check --write src/index.ts
   ```

   Pass the actual files you edited. For a repository-wide change, `pnpm format` applies the same fixes across the repository. Inspect the resulting diff and keep unrelated changes out of the task. Do not use `--unsafe` to clear diagnostics; resolve remaining issues deliberately.
4. Run affected tests while iterating. The current smoke test executes compiled JavaScript, so build before a focused run:

   ```sh
   pnpm build
   pnpm exec vitest run tests/smoke.test.ts
   ```

   Rebuild after source changes so a passing smoke test cannot come from stale `dist/` output.
5. Before committing code, tests, or tooling configuration, run `pnpm check`. It checks Biome without modifying files, checks types, builds, and runs the full local test suite. A successful run already covers `pnpm build` and `pnpm test`; do not repeat them unnecessarily. Fix failures and rerun affected checks until they pass.
6. For infrastructure changes, also run `pnpm check:infra` and the affected container checks. Docker/runtime changes should exercise both supported platforms:

   ```sh
   pnpm check:container --platform linux/amd64
   pnpm check:container --platform linux/arm64
   ```

7. Review `git diff`, run `git diff --check`, and inspect `git status` before staging explicit paths. For documentation-only edits, use Biome on the edited documentation, verify its commands and links, and check the diff; application builds and tests are unnecessary locally.

VS Code's recommended Biome extension applies formatting and safe fixes on save for the configured languages. Agents must still run the command-line checks; editor automation and a running `pnpm dev` process do not prove validation passed.

## Dependencies

- Use pnpm and commit intentional `pnpm-lock.yaml` changes. To update dependencies, change the relevant metadata, regenerate with `pnpm install`, and verify a frozen-lockfile installation.
- Direct dependencies stay exact. Review release notes and compatibility when changing toolchain or runtime versions.
- pnpm settings live in `pnpm-workspace.yaml`; it currently configures only the root package. Review lifecycle scripts before adding `allowBuilds` entries. Preserve the explicit allowlist rather than enabling every dependency's scripts.
- Check Renovate coverage when adding pins, including Docker digests, Action SHAs, and tool versions embedded in configuration.

## Containers and CI/CD

- Keep the runtime image non-root and limited to compiled application files and required runtime dependencies. Build tools belong in the build stage.
- Preserve AMD64 and ARM64 smoke tests, the fixable high/critical vulnerability gate, and the aggregate `ci` check.
- PR jobs validate changes with read-only repository permissions. Registry writes and attestations belong to trusted main-branch publishing jobs.
- Publish the tested image artifacts. Semantic release tags promote the existing commit image digest; they must not silently rebuild it or overwrite a different released digest.
- Follow `CONTRIBUTING.md` for releases. Creating a release tag, merging, publishing, or deploying requires authorization for that action; a request to update a PR already authorizes its necessary commit and push.

## Git and Pull Requests

- Other agents may share the worktree. Preserve their changes and limit commits to the files owned by the current task.
- Stage explicit paths, inspect `git status` and the staged diff, and use Conventional Commits. Never bypass hooks or overwrite unrelated changes through resets, cleanup, stashing, or force pushes.
- Prefer updating the task's existing branch and PR. Review other PRs through diffs and refs without switching the user's checkout.
- Describe the final behavior and relevant checks in the PR. Use structured API arguments or a temporary body file for multiline descriptions.
- Container publication, repository settings, and hosted-service activation need separate verification; a configuration file or successful local test does not prove they ran.

## AGENTS.md File

- Do not change the AGENTS.md file unsless specifically asked for.
