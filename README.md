# cloud-colony

A foundation for self-hosted cloud agents. Shared internal code lives in `src/core`; each runnable agent has its own entrypoint under `src/agents/`. The hello-world agent serves an Agent2Agent (A2A) 1.0 endpoint and generates greetings through pi-durable and LiteLLM.

## Installation

Use the Node.js version in [`.node-version`](.node-version) and the pnpm version in [`package.json`](package.json).

```sh
pnpm install --frozen-lockfile
cp -n .env.example .env
chmod 600 .env
# Set LITELLM_BASE_URL and LITELLM_API_KEY in .env.
pnpm dev
```

The server listens on port 8080 by default. Discover it at `GET /.well-known/agent-card.json` and send an A2A `SendMessage` to the JSON-RPC URL advertised by the card. Each greeting uses a fresh in-memory conversation with the LiteLLM model `qwen3.8-27b`.

`pnpm start` runs the compiled agent at `dist/agents/hello-world/index.js`; it reads injected environment variables and never loads `.env`. The image is `ghcr.io/noxels/cloud-colony-hello-world`, built specifically for the `hello-world` agent.

Run `make hello-world-agent` to build and start the container and chat with it from your terminal. Type `/quit` or press Ctrl+C to exit. Set `LITELLM_BASE_URL` in `.env` to an endpoint reachable from Docker.

[Documentation](docs/README.md)
