# cloud-colony

Self-hosted cloud agents with pi-durable, A2A communication, LiteLLM inference, and OpenShell governance are the intended direction. The current application is a TypeScript hello world; this bootstrap establishes the development and container delivery pipeline.

## Development

Use the exact Node 24 LTS version in `.node-version` and the pnpm version in the `packageManager` field of `package.json`. Docker is required for infrastructure linting and container checks.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

The application prints `Hello from cloud-colony`. To run the production build:

```sh
pnpm build
pnpm start
```

| Command                | Purpose                                                              |
| ---------------------- | -------------------------------------------------------------------- |
| `pnpm dev`             | Run the application and watch for source changes                     |
| `pnpm build`           | Compile application JavaScript into `dist/`                          |
| `pnpm start`           | Execute the compiled application                                     |
| `pnpm lint`            | Check formatting, imports, and lint rules with Biome                 |
| `pnpm format`          | Apply formatting and safe fixes                                      |
| `pnpm typecheck`       | Check application, test, and configuration types                     |
| `pnpm test`            | Build and smoke-test the compiled entrypoint                         |
| `pnpm check`           | Run linting, type checking, and tests                                |
| `pnpm check:infra`     | Validate workflows and the Dockerfile using pinned linter containers |
| `pnpm check:container` | Build and smoke-test the local container                             |

The smoke test launches the compiled application and verifies its output and exit status. The container check verifies the packaged application separately. The container is a one-shot process and exits after printing its message.

VS Code extension recommendations and formatter settings are included. Biome handles JavaScript, TypeScript, and JSON.

## Containers and releases

Pull requests run the application checks, infrastructure linting, and container builds, smoke tests, and vulnerability scans for `linux/amd64` and `linux/arm64`. Successful `main` runs publish the tested images as a multi-architecture image:

```text
ghcr.io/noxels/cloud-colony:sha-<full-commit-sha>
```

Release tags such as `v0.1.0` promote the existing commit image to a version tag and create a GitHub release. The release workflow checks that the tag belongs to `main` and that the commit's main CI run succeeded. It reuses the image digest instead of rebuilding it.

After merging a release commit, wait for its `main` pipeline to finish successfully before creating a version tag. See [CONTRIBUTING.md](CONTRIBUTING.md) for the release procedure and required repository setup.

## Next phase

Add the first pi-durable agent, shared tools, durable A2A task handling, and OpenShell policies after the toolchain is established. Split code into workspace packages when there is a concrete shared library. Kubernetes deployment belongs with the first long-running agent service.
