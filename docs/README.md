# Development and delivery

Self-hosted cloud agents with pi-durable, A2A communication, LiteLLM inference, and OpenShell governance are the intended direction. The current application is a TypeScript hello world; this bootstrap establishes the development and container delivery pipeline.

## Development

Use the exact Node 24 LTS version in [`.node-version`](../.node-version) and the pnpm version in the `packageManager` field of [`package.json`](../package.json). Docker is required for infrastructure linting and container checks. Run commands from the repository root.

```sh
pnpm install --frozen-lockfile
cp -n .env.example .env
chmod 600 .env
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

## Environment configuration

Development loads the optional root `.env` through Node's built-in `--env-file-if-exists` support in `pnpm dev`. Fill in `LITELLM_BASE_URL` (including `/v1`) and `LITELLM_API_KEY` in your local file. Existing shell/environment values take precedence. Restart `pnpm dev` after changing `.env`.

`.env` is ignored by Git and excluded from Docker builds. `.env.example` contains the variable names and a local endpoint placeholder; it must never contain real credentials. CI tests use temporary fixtures and dummy keys.

Application code reads the same environment interface in either mode:

```ts
const baseUrl = process.env.LITELLM_BASE_URL;
const apiKey = process.env.LITELLM_API_KEY;
```

The application is still hello world; it does not invoke LiteLLM or require a key yet. The first provider integration should validate the required values before making requests and keep credentials out of logs.

`pnpm start` and the production container read only the environment provided at startup. They do not load `.env`. For a local container test, Docker can supply the file explicitly with `docker run --env-file .env <image>`.

In Kubernetes, put non-secret settings in a ConfigMap:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: cloud-colony-config
data:
  LITELLM_BASE_URL: https://litellm.example.com/v1
```

Use these entries in the future workload's container specification:

```yaml
envFrom:
  - configMapRef:
      name: cloud-colony-config
env:
  - name: LITELLM_API_KEY
    valueFrom:
      secretKeyRef:
        name: cloud-colony-litellm
        key: api-key
```

Create `cloud-colony-litellm` through your secret-management workflow. The API key belongs in a Secret, while the endpoint belongs in the ConfigMap. Kubernetes injects both into the process environment; the application does not call the Kubernetes API or read YAML. Restart or roll out the workload when those environment-backed values change. These are configuration examples, not a deployed workload.

## Containers and releases

Pull requests run the application checks, infrastructure linting, and container builds, smoke tests, and vulnerability scans for `linux/amd64` and `linux/arm64`. Successful `main` runs publish the tested images as a multi-architecture image:

```text
ghcr.io/noxels/cloud-colony:sha-<full-commit-sha>
```

Release tags such as `v0.1.0` promote the existing commit image to a version tag and create a GitHub release. The release workflow checks that the tag belongs to `main` and that the commit's main CI run succeeded. It reuses the image digest instead of rebuilding it.

After merging a release commit, wait for its `main` pipeline to finish successfully before creating a version tag. See [CONTRIBUTING.md](../CONTRIBUTING.md) for the release procedure and required repository setup.

## Next phase

Add the first pi-durable agent, shared tools, durable A2A task handling, and OpenShell policies after the toolchain is established. Split code into workspace packages when there is a concrete shared library. Kubernetes deployment belongs with the first long-running agent service.
