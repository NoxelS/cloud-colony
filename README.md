# cloud-colony

A foundation for self-hosted cloud agents. The first agent uses pi-durable and LiteLLM to answer a hello world prompt.

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

[Documentation](docs/README.md)
