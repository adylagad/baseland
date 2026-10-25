# Build context is the repo root (see render.yaml).
FROM node:22-slim AS base
RUN npm install -g pnpm@10.33.0
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/engine/package.json apps/engine/
COPY packages/play-schema/package.json packages/play-schema/

FROM base AS build
RUN pnpm install --frozen-lockfile --filter @baseland/engine
COPY tsconfig.base.json ./
COPY apps/engine apps/engine
COPY packages packages
RUN pnpm --filter @baseland/engine build

FROM base AS runtime
ENV NODE_ENV=production
# Production deps only, including @coinbase/coinbase-cli, which the engine spawns.
RUN pnpm install --frozen-lockfile --prod --filter @baseland/engine
COPY --from=build /repo/apps/engine/dist apps/engine/dist
WORKDIR /repo/apps/engine
USER node
CMD ["node", "dist/index.js"]
