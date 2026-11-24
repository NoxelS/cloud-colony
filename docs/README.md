# Development and delivery

The code has a shared internal library in `src/core` and runnable agents under `src/agents/<name>`. The first agent is a one-shot pi-durable example: it sends the prompt `Reply with exactly: Hello world!` to LiteLLM using hardcoded model ID `qwen3.8-27b`, prints the model response, and closes the harness. It uses in-memory storage, so conversations do not survive process exit. A2A communication and OpenShell governance remain future capabilities.

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

Coordinated release tags such as `v0.1.0` promote every agent's existing commit digest to its version tag and create one GitHub release after all promotions succeed. The hello-world image keeps the repository `ghcr.io/noxels/cloud-colony`. The release workflow checks that the tag belongs to `main` and that the commit's main CI run succeeded; it reuses image digests instead of rebuilding.

After merging a release commit, wait for its `main` pipeline to finish successfully before creating a version tag. See [CONTRIBUTING.md](../CONTRIBUTING.md) for the release procedure and required repository setup.

## OpenShell sandboxes

The image is a workload, not an OpenShell installation. OpenShell runs it inside a separate sandbox controlled by a gateway and supervisor. Build the reusable runtime stage and the hello-world image locally. Future agent Dockerfiles can use the built base image as `FROM cloud-colony-agent-base:local`:

```sh
docker build --target agent-base -t cloud-colony-agent-base:local .
docker build -t cloud-colony:local .
```

Install [OpenShell v0.1.10](https://docs.nvidia.com/openshell/v0.1.10/about/installation) and use a local Docker driver with Docker Engine 28 or later. Check `openshell status` and `openshell gateway info` before creating sandboxes. For the first sandbox, create a fresh local gateway or confirm that any existing gateway and its policy are safe to use; do not change a shared gateway's global policy.

In one terminal, start a retained sandbox with its default interactive shell:

```sh
openshell sandbox create --name cloud-colony-check --from cloud-colony:local
```

In a second terminal, inspect the effective policy. The default policy is restrictive, but global policy and attached providers can add permissions; verify both payloads before interpreting a network test:

```sh
openshell policy get cloud-colony-check --base
openshell policy get cloud-colony-check --full
```

Upload and run the existing deterministic fixture. It uses a local mock and synthetic API key; it does not call LiteLLM:

```sh
openshell sandbox upload cloud-colony-check tests/fixtures/run-agent.mjs /tmp/run-agent.mjs
openshell sandbox exec -n cloud-colony-check --no-login-shell --workdir /app -- node /tmp/run-agent.mjs
```

With no broader network rule or provider override, test denied outbound access and inspect the supervisor event:

```sh
openshell sandbox exec -n cloud-colony-check --no-login-shell -- node -e 'fetch("https://example.com").then(() => process.exit(1)).catch(() => process.exit(0))'
openshell logs cloud-colony-check --source sandbox
openshell term
```

Require a `DENIED` network event; an unsuccessful request alone does not prove policy enforcement. OpenShell's TUI (`openshell term`) and logs expose sandbox activity, including allowed and denied connection events. Application stdout/stderr is separate container output. Gateway logs are an in-memory, limited buffer that can drop events and is lost on gateway restart or sandbox deletion, so this is not a durable audit trail. See NVIDIA's [architecture](https://docs.nvidia.com/openshell/v0.1.10/about/architecture), [log access](https://docs.nvidia.com/openshell/v0.1.10/observability/accessing-logs), [providers](https://docs.nvidia.com/openshell/v0.1.10/how-it-works/providers/overview), and [network rules](https://docs.nvidia.com/openshell/v0.1.10/how-it-works/policies/network-rules).

For real LiteLLM access, configure a provider in the gateway for the exact LiteLLM hostname and port and bind `LITELLM_API_KEY` as a bearer credential for the Node executable. Attach that provider to each sandbox and pass only the non-secret `LITELLM_BASE_URL` with `--env-from`. A provider supplies a placeholder inside the sandbox and also contributes network access. Inspected-request rules need `enforcement: enforce`; audit is the default. Review the effective policy after attaching a provider. Never bake credentials into an image or pass them as ordinary `--env` values. Remote inference does not require a GPU in the agent container.

Create one sandbox per agent, supply its actual main command after `--`, and set per-agent policy and resource limits when creating it. Do not install OpenShell or bake credentials and policy into the shared base image. Delete the test sandbox when finished:

```sh
openshell sandbox delete cloud-colony-check
```

For another agent, first add its `src/agents/<name>` entrypoint, agent-specific Dockerfile and mock fixture, then update all four explicit workflow lists (CI build/scan, platform publish, manifest publish, and release promotion), plus lint and Renovate coverage. See [CONTRIBUTING.md](../CONTRIBUTING.md).
