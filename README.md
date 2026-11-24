# cloud-colony

A foundation for self-hosted cloud agents. Shared internal code lives in `src/core`; each runnable agent has its own entrypoint under `src/agents/`. The first example uses pi-durable and LiteLLM to submit one hello-world prompt, print the model response, and exit. It uses in-memory storage; conversations do not survive process exit.

## Installation

Use the Node.js version in [`.node-version`](.node-version) and the pnpm version in [`package.json`](package.json).

```sh
pnpm install --frozen-lockfile
cp -n .env.example .env
chmod 600 .env
# Set LITELLM_BASE_URL and LITELLM_API_KEY in .env.
pnpm dev
```

The model is hardcoded to `qwen3.8-27b`, the ID registered with LiteLLM. Each run prints the model response and exits. The harness uses in-memory storage.

`pnpm start` runs the compiled agent at `dist/agents/hello-world/index.js`; it reads injected environment variables and never loads `.env`. The image is `ghcr.io/noxels/cloud-colony`, built specifically for the `hello-world` agent.

[Documentation](docs/README.md)
