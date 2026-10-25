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
pnpm check:container
```

The last two commands need a running Docker daemon. `pnpm format` applies formatting and safe fixes. Commit intentional changes to `pnpm-lock.yaml` when updating dependencies.

Use a Conventional Commit PR title, for example `chore: bootstrap Node tooling` or `fix: preserve task identity after restart`. Prefer squash merging so the PR title becomes the commit message.

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
