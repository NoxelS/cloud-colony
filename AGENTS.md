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

## Implementation

- Use the Node version in `.node-version` and pnpm version in `package.json`. Keep the Dockerfile and package engine constraints consistent with those pins.
- Application code is strict TypeScript with ESM and `NodeNext` resolution. `tsx` runs development code; `tsc` emits production JavaScript into `dist/`.
- Follow Biome and the existing compiler configuration. Prefer small functions and explicit types; avoid `any`, unchecked assertions, and abstractions without a concrete use.
- Resolve dependency API questions from the installed types and owning documentation. Use top-level imports and explicit `node:` imports for Node built-ins.
- Fix the underlying cause of failures. Preserve intentional behavior and validation instead of weakening them to make a check pass.
- Keep generated output, local reports, credentials, and `.env` files out of commits. Use temporary files for ad-hoc scripts and CLI message bodies.

## Commands and Validation

Run commands from the repository root. Docker must be available for infrastructure and container checks.

| Command                          | When to use it                                                   |
| -------------------------------- | ---------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | Reproduce the committed dependency graph                         |
| `pnpm dev`                       | Run the application with source watching                         |
| `pnpm build`                     | Compile application JavaScript                                   |
| `pnpm start`                     | Run the existing production build                                |
| `pnpm lint`                      | Check Biome formatting, imports, and lint rules                  |
| `pnpm format`                    | Apply formatting and safe fixes; review the resulting diff       |
| `pnpm typecheck`                 | Check application, test, and configuration types                 |
| `pnpm test`                      | Build, then run Vitest; this is a local executable smoke test    |
| `pnpm check`                     | Run linting, type checking, and tests, including the build       |
| `pnpm check:infra`               | Validate workflows and all agent Dockerfiles with pinned linters |
| `pnpm check:container`           | Build and verify the hello-world container                       |
- Documentation-only edits need formatting, command/link verification, and `git diff --check`; they do not require rebuilding the application locally. GitHub CI still runs according to its workflow triggers.
- Run tests you change. Prefer tests of observable behavior, including the compiled executable, over assertions that merely repeat implementation details.
- Keep default tests deterministic and independent of external credentials. Future live-model tests need explicit opt-in and bounded cost; the presence of a key in the environment must not activate them.
- Inspect complete failure output, fix the cause, and report any check that could not run. Do not add retries, exclusions, or suppressions merely to obtain a green result.

## Development Workflow

- Use test-driven development for behavior changes: identify the consumer-visible contract, write a focused test that fails because the behavior is missing, and run it to confirm the expected failure before implementation.
- Implement the smallest change that makes the test pass, then rerun that test and any directly relevant checks.
- Cover representative success, boundary, and failure cases when they matter to the contract; keep tests deterministic and independent of external credentials.
- Follow existing test conventions and assert observable outcomes, not implementation details. Do not add tests for trivial changes or require tests where no meaningful behavior changes.

## Tests

- Make tests readable to humans: use clear names, focused setup, and assertions that show expected consumer-visible behavior.
- Follow existing test conventions; cover meaningful success, boundary, and failure cases based on contract and risk, not implementation details.
- Keep tests isolated and deterministic. Avoid fixed sleeps and production services; mock only external or unsafe boundaries when needed.

## Dependencies

- Use pnpm and commit intentional `pnpm-lock.yaml` changes. To update dependencies, change the relevant metadata, regenerate with `pnpm install`, and verify a frozen-lockfile installation.
- Direct dependencies stay exact. Review release notes and compatibility when changing toolchain or runtime versions.
- pnpm settings live in `pnpm-workspace.yaml`; it currently configures only the root package. Review lifecycle scripts before adding `allowBuilds` entries. Preserve the explicit allowlist rather than enabling every dependency's scripts.
- Check Renovate coverage when adding pins, including Docker digests, Action SHAs, and tool versions embedded in configuration.

## Git and Pull Requests

- Other agents may share the worktree. Preserve their changes and limit commits to the files owned by the current task.
- Stage explicit paths, inspect `git status` and the staged diff, and use Conventional Commits. Never bypass hooks or overwrite unrelated changes through resets, cleanup, stashing, or force pushes.
- Prefer updating the task's existing branch and PR. Review other PRs through diffs and refs without switching the user's checkout.
- Describe the final behavior and relevant checks in the PR. Use structured API arguments or a temporary body file for multiline descriptions.
- Container publication, repository settings, and hosted-service activation need separate verification; a configuration file or successful local test does not prove they ran.
- Use conventional commit messages.

## AGENTS.md File

- Do not change the AGENTS.md file unsless specifically asked for.
