FROM node:24.22.1-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS base
WORKDIR /app

FROM base AS build
# renovate: datasource=npm depName=pnpm
ARG PNPM_VERSION=12.15.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install --global "pnpm@${PNPM_VERSION}" \
    && pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build && pnpm prune --prod

FROM base AS agent-base
# Package managers are build tools; the runtime executes compiled JavaScript.
RUN rm -rf /usr/local/lib/node_modules /opt/yarn-* \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    /usr/local/bin/pnpm /usr/local/bin/pnpx /usr/local/bin/yarn /usr/local/bin/yarnpkg
ENV NODE_ENV=production
WORKDIR /app
USER 1000:1000

FROM agent-base AS runtime
ARG VCS_REF=unknown
LABEL org.opencontainers.image.title="cloud-colony hello-world agent" \
    org.opencontainers.image.description="Hello-world agent using pi-durable and LiteLLM" \
    org.opencontainers.image.source="https://github.com/NoxelS/cloud-colony" \
    org.opencontainers.image.revision="${VCS_REF}"
COPY --from=build --chown=node:node /app/dist/core ./dist/core
COPY --from=build --chown=node:node /app/dist/agents/hello-world ./dist/agents/hello-world
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./package.json
USER 1000:1000
CMD ["node", "dist/agents/hello-world/index.js"]
