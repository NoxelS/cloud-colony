# Development and delivery

The application is a minimal pi-durable agent using LiteLLM inference. Each run submits one hello world prompt, prints the model response, and closes the harness. Conversations use in-memory storage; they do not survive process exit. A2A communication and OpenShell governance remain planned.

## Development

Use the exact Node 24 LTS version in [`.node-version`](../.node-version) and the pnpm version in the `packageManager` field of [`package.json`](../package.json). Docker is required for infrastructure linting and container checks. Run commands from the repository root.

```sh
pnpm install --frozen-lockfile
cp -n .env.example .env
chmod 600 .env
# Set LITELLM_BASE_URL and LITELLM_API_KEY in .env.
pnpm dev
```

`pnpm dev` loads the optional `.env` from the repository root. Existing environment variables take precedence. `pnpm start` reads injected environment variables; it does not load `.env`. Set `LITELLM_BASE_URL` to the OpenAI-compatible API base URL (for example `https://litellm.example.com/v1`) and `LITELLM_API_KEY` to a LiteLLM key. The model ID is hardcoded to `qwen3.8-27b`; there is no model environment variable. A run allows up to 128 output tokens and a 30-second request timeout, with retries disabled.

To run the production build:

```sh
pnpm build
node --env-file=.env dist/index.js
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

The smoke tests launch the compiled application against a local mock of LiteLLM, including streamed text, `.env` loading, invalid configuration, and provider rejection. They use synthetic credentials and never call the configured live provider. The container check runs the same mock and agent inside the image with external networking disabled.

To run the container against LiteLLM, supply credentials at runtime:

```sh
docker build --tag cloud-colony:local .
docker run --rm --env-file .env cloud-colony:local
```

The image runs as a non-root user and includes compiled code and production dependencies. `.env` is excluded from the build context.

VS Code extension recommendations and formatter settings are included. Biome handles JavaScript, TypeScript, and JSON.

## Environment configuration

Development loads the optional root `.env` through Node's built-in `--env-file-if-exists` support in `pnpm dev`. Fill in `LITELLM_BASE_URL` (including `/v1`) and `LITELLM_API_KEY` in your local file. Existing shell/environment values take precedence. Restart `pnpm dev` after changing `.env`.

`.env` is ignored by Git and excluded from Docker builds. `.env.example` contains the variable names and a local endpoint placeholder; it must never contain real credentials. CI tests use temporary fixtures and dummy keys.

Application code reads the same environment interface in either mode:

```ts
const baseUrl = process.env.LITELLM_BASE_URL;
const apiKey = process.env.LITELLM_API_KEY;
```

The agent validates both values before making requests to LiteLLM. It reports provider failures without logging credentials.

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

Add persistent storage, shared tools, durable A2A task handling, and OpenShell policies when requested. Split code into workspace packages when there is a concrete shared library. Kubernetes deployment belongs with the first long-running agent service.
