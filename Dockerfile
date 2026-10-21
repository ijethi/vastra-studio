# syntax=docker/dockerfile:1
#
# Vastra Studio worker image (BullMQ consumer). Not the web tier: the Next.js
# app deploys to Vercel (see vercel.json). Built and run by Fly.io via fly.toml.
#
#   docker build -t vastra-worker .
#   docker run --rm -e DATABASE_URL=... -e REDIS_URL=... -e AUTH_SECRET=... vastra-worker
#
# Debian slim rather than Alpine so sharp's prebuilt glibc binaries are used.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true
# Pin pnpm to the version in package.json#packageManager.
RUN npm install -g pnpm@10.17.1 && pnpm --version
WORKDIR /app

# ---- dependencies ----------------------------------------------------------
# tsx (a devDependency) runs the worker, so install the full tree.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---- runtime ---------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production \
    WORKER_CONCURRENCY=4
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json tsconfig.json ./
COPY --chown=node:node drizzle ./drizzle
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node src ./src
# The pipeline caches placeholder renders under ./.data when the library
# image is missing from object storage; keep that writable for the app user.
RUN mkdir -p /app/.data && chown -R node:node /app/.data
USER node

STOPSIGNAL SIGTERM
# `--conditions=react-server` makes the `server-only` guard a no-op outside
# Next.js, exactly as scripts/test.mjs does for the unit tests.
CMD ["node", "--import", "tsx", "--conditions=react-server", "scripts/worker.ts"]
