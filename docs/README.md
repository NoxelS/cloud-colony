# Development and delivery

Shared A2A server code lives in `src/core/a2a/`. Each agent provides its card metadata and request handler under `src/agents/<name>/`. The hello-world agent generates a greeting in a fresh pi-durable conversation for each request.

## Development

Use the exact Node 24 LTS version in [`.node-version`](../.node-version) and the pnpm version in the `packageManager` field of [`package.json`](../package.json). Docker is required for infrastructure linting and container checks. Run commands from the repository root.

```sh
pnpm install --frozen-lockfile
cp -n .env.example .env
chmod 600 .env
# Set LITELLM_BASE_URL and LITELLM_API_KEY in .env.
pnpm dev
```

`pnpm dev` loads the optional `.env` from the repository root. Existing environment variables take precedence. `pnpm start` reads injected environment variables; it does not load `.env`. Set `LITELLM_BASE_URL` to the OpenAI-compatible API base URL (for example `https://litellm.example.com/v1`) and `LITELLM_API_KEY` to a LiteLLM key. The model ID is hardcoded to `qwen3.8-27b`; there is no model environment variable. A greeting allows up to 128 output tokens and a 30-second request timeout, with retries disabled.

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

The smoke tests launch the compiled application, discover its card, and invoke it over A2A against a local mock of LiteLLM. They cover concurrent greetings, invalid requests and configuration, provider rejection and recovery, `.env` loading, and shutdown. The container check runs the same fixture inside the image with external networking disabled.

To run the container against LiteLLM, supply credentials at runtime:

```sh
docker build --file src/agents/hello-world/Dockerfile --tag cloud-colony-hello-world-agent:local .
docker run --rm -p 127.0.0.1:8080:8080 --env-file .env cloud-colony-hello-world-agent:local
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

## A2A service

`PORT` defaults to `8080`. The card advertises `http://127.0.0.1:<port>/` by default. Set `A2A_BASE_URL` to the HTTP or HTTPS origin reachable by callers when the agent runs behind a Service or a port mapping. The HTTP listener binds to all container interfaces.

```sh
curl -fsS http://127.0.0.1:8080/.well-known/agent-card.json
curl -fsS http://127.0.0.1:8080/ \
  -H 'Content-Type: application/json' \
  -H 'A2A-Version: 1.0' \
  -d '{"jsonrpc":"2.0","id":1,"method":"SendMessage","params":{"message":{"messageId":"greeting-1","role":"ROLE_USER","parts":[{"text":"Hello"}]}}}'
```

The response contains a greeting in `result.message.parts`. A model failure returns a JSON-RPC error. Greeting requests leave no task history. Both `/healthz` and `/readyz` report HTTP availability without calling the model. SIGTERM and SIGINT stop the listener and drain active HTTP requests.

## Local A2A chat

With Docker running and the repository dependencies installed, configure `.env` with the LiteLLM endpoint and key. Use `host.docker.internal` for a LiteLLM server running on the Docker Desktop host.

```sh
make hello-world-agent
```

The target builds the hello-world image, starts it on loopback, waits for readiness, and launches the interactive client. Enter a message to see the reply. Type `/quit`, press Ctrl+D, or press Ctrl+C to exit and stop the container.

Use `make chat-<agent>` for any agent with a Dockerfile in `src/agents/<agent>/`. Override the local port or env file with `A2A_PORT=8081` or `ENV_FILE=path/to/file`. To chat with an agent that is already running, use `pnpm a2a:client http://127.0.0.1:8080`.

## Sisyphus rollout

When deploying, run the published image by digest in a one-replica Deployment behind a private ClusterIP Service on port 8080. Set `A2A_BASE_URL` to that Service's origin, use the two HTTP probes, and allow at least 40 seconds for termination. Set `LITELLM_BASE_URL` to `http://litellm.litellm.svc.cluster.local:4000/v1` and inject a dedicated model-scoped `LITELLM_API_KEY` from a SOPS-managed Secret.

Allow LiteLLM egress to the agent and agent ingress from LiteLLM on TCP 8080. Allow agent egress to LiteLLM and LiteLLM ingress from the agent on TCP 4000, as well as agent egress to cluster DNS. Keep the agent Service private because the local A2A listener relies on the network boundary. Clients authenticate at LiteLLM.

In the LiteLLM HelmRelease, add the following under `values.proxy_config`. This example assumes a Service named `hello-world` in the `cloud-colony` namespace.

```yaml
agents:
  - agent_name: hello-world
    agent_card_params:
      name: Hello World
      description: Returns a model-generated hello-world greeting.
      url: http://hello-world.cloud-colony.svc.cluster.local:8080/
      protocolVersion: "1.0"
      version: "1.0.0"
      capabilities:
        streaming: false
      defaultInputModes: [text/plain]
      defaultOutputModes: [text/plain]
      skills:
        - id: greet
          name: Greet
          description: Send a text message to receive a greeting.
          tags: [greeting]
          examples: [Hello]
```

Verify the agent through `GET /v1/agents` and `GET /a2a/hello-world/.well-known/agent-card.json` on `https://ai.noel.fyi`. Check that the card advertises the public HTTPS gateway URL, that a permitted virtual key receives a greeting there, and that a restricted key without the agent grant is denied. Review existing unrestricted keys before onboarding the agent.

## Containers and releases

CI discovers agents under `src/agents/`. Each agent has its own job that builds, smoke-tests, and vulnerability scans the `linux/amd64` and `linux/arm64` images. On `main`, the same job pushes both tested images and creates a multi-architecture tag. The hello-world image uses:

```text
ghcr.io/noxels/cloud-colony:sha-<full-commit-sha>
```

After a successful merge to `main`, CI automatically applies the next patch version to all agent images. For example, the hello-world image may be published as `ghcr.io/noxels/cloud-colony:v0.0.7` and `ghcr.io/noxels/cloud-colony:sha-<full-commit-sha>` with the same digest. CI then creates the Git tag and GitHub Release for that commit. See [CONTRIBUTING.md](../CONTRIBUTING.md) for version rules and retry behavior.
