# Development and delivery

The code has a shared internal library in `src/core` and runnable agents under `src/agents/<name>`. The first agent is a one-shot pi-durable example: it sends the prompt `Reply with exactly: Hello world!` to LiteLLM using hardcoded model ID `qwen3.8-27b`, prints the model response, and closes the harness. It uses in-memory storage, so conversations do not survive process exit. A2A communication remains a future capability.

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
node --env-file=.env dist/agents/hello-world/index.js
```
| Command                | Purpose                                                                |
| ---------------------- | ---------------------------------------------------------------------- |
| `pnpm dev`             | Run the application and watch for source changes                       |
| `pnpm build`           | Compile application JavaScript into `dist/`                            |
| `pnpm start`           | Execute the compiled application                                       |
| `pnpm lint`            | Check formatting, imports, and lint rules with Biome                   |
| `pnpm format`          | Apply formatting and safe fixes                                        |
| `pnpm typecheck`       | Check application, test, and configuration types                       |
| `pnpm test`            | Build and smoke-test the compiled entrypoint                           |
| `pnpm check`           | Run linting, type checking, and tests                                  |
| `pnpm check:infra`     | Validate workflows and agent Dockerfiles with pinned linter containers |
| `pnpm check:container` | Build and smoke-test the local container                               |

The smoke tests launch the compiled application against a local mock of LiteLLM, including streamed text, `.env` loading, invalid configuration, and provider rejection. They use synthetic credentials and never call the configured live provider. The container check runs the same mock and agent inside the image with external networking disabled.

To run the container against LiteLLM, supply credentials at runtime:

```sh
docker build --file src/agents/hello-world/Dockerfile --tag cloud-colony-hello-world-agent:local .
docker run --rm --name cloud-colony-hello-world-agent-1 --env-file .env cloud-colony-hello-world-agent:local
```

Each container starts one agent process. Use a different container name for each concurrent instance. Set `LITELLM_BASE_URL` to an endpoint reachable from that container. If LiteLLM runs on the Mac host, use `host.docker.internal` in place of `localhost`.

The image runs as a non-root user and includes compiled code and production dependencies owned by root. Supply the LiteLLM key when starting the container. `.env` is excluded from the build context.

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

Run hello-world as a Kubernetes Job because it exits after one request. Use a Deployment for agents designed to run continuously. Put non-secret settings in a ConfigMap:

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

CI discovers agents under `src/agents/`. Each agent has its own job that builds, smoke-tests, and vulnerability scans the `linux/amd64` and `linux/arm64` images. On `main`, the same job pushes both tested images and creates a multi-architecture tag. The hello-world image uses:

```text
ghcr.io/noxels/cloud-colony:sha-<full-commit-sha>
```

Coordinated release tags such as `v0.1.0` promote every agent's existing commit digest to its version tag and create one GitHub release after all promotions succeed. The hello-world image keeps the repository `ghcr.io/noxels/cloud-colony`. The release workflow checks that the tag belongs to `main` and that the commit's main CI run succeeded; it reuses image digests instead of rebuilding.

After merging a release commit, wait for its `main` pipeline to finish successfully before creating a version tag. See [CONTRIBUTING.md](../CONTRIBUTING.md) for the release procedure and required repository setup.
