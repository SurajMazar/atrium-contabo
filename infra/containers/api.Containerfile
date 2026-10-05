# Atrium API (NestJS) — multi-stage image.
#
#   podman build --format docker -f infra/containers/api.Containerfile -t atrium-api .
#   podman build --format docker -f infra/containers/api.Containerfile --target migrate -t atrium-migrate .
#   docker build -f infra/containers/api.Containerfile -t atrium-api .
#
# `--format docker` keeps the HEALTHCHECK (the OCI image format has no healthcheck field).
# Build context is the repository root. Stages:
#   pruner  → `turbo prune @atrium/api --docker` (only the packages the API depends on)
#   deps    → pnpm install from the pruned lockfile (cached layer: only changes with package.json/lockfile)
#   builder → turbo build of @atrium/api and its workspace deps, then a production-only (offline) reinstall
#   migrate → small image with the Prisma CLI + migrations (`prisma migrate deploy`), used as a release job
#   runtime → node:24-slim, non-root, production node_modules only (default target)

ARG NODE_VERSION=24
ARG PNPM_VERSION=10.21.0
ARG TURBO_VERSION=2.11.7
# Parallel turbo tasks; use 1 on small builders (e.g. a 2 GiB podman machine) to avoid OOM (exit 137).
ARG TURBO_CONCURRENCY=2
# Extra pnpm install flags, e.g. "--network-concurrency=4 --child-concurrency=1" on low-memory builders.
ARG PNPM_INSTALL_FLAGS=""

FROM docker.io/library/node:${NODE_VERSION}-slim AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true \
    TURBO_TELEMETRY_DISABLED=1 \
    NEXT_TELEMETRY_DISABLED=1
# openssl lets Prisma detect the right engine; ca-certificates for TLS to managed services.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g pnpm@${PNPM_VERSION} --no-fund --no-audit --loglevel=error
WORKDIR /repo

# ── prune the monorepo down to @atrium/api and its workspace dependencies ──
FROM base AS pruner
ARG TURBO_VERSION
RUN npm install -g turbo@${TURBO_VERSION} --no-fund --no-audit --loglevel=error
COPY . .
RUN turbo prune @atrium/api --docker --out-dir /out

# ── install dependencies (layer cached until a package.json or the lockfile changes) ──
FROM base AS deps
ARG PNPM_INSTALL_FLAGS
COPY --from=pruner /out/json/ ./
# @atrium/db runs `prisma generate` on postinstall and needs its schema.
COPY --from=pruner /out/full/packages/db/prisma ./packages/db/prisma
COPY --from=pruner /out/full/packages/db/prisma.config.ts ./packages/db/prisma.config.ts
# The pnpm store stays inside the image layer (same filesystem as node_modules): cache mounts
# break pnpm file copying across filesystems (EXDEV) on some builders. Layer caching still skips this step when
# no package.json/lockfile changed.
RUN pnpm config set store-dir /pnpm/store \
 && pnpm install --frozen-lockfile ${PNPM_INSTALL_FLAGS}

# ── build ──
FROM deps AS builder
ARG TURBO_CONCURRENCY
ARG PNPM_INSTALL_FLAGS
COPY --from=pruner /out/full/ ./
RUN pnpm exec turbo run build --filter=@atrium/api --output-logs=errors-only --concurrency=${TURBO_CONCURRENCY}
# Production-only node_modules for the pruned workspace, installed offline from the in-layer
# store (lighter than `pnpm deploy`, which OOMs on 2 GiB builders).
RUN rm -rf node_modules apps/*/node_modules packages/*/node_modules \
 && pnpm install --prod --frozen-lockfile --offline --ignore-scripts ${PNPM_INSTALL_FLAGS} \
 && rm -rf apps/api/src apps/api/test .turbo apps/*/.turbo packages/*/.turbo

# ── migration bundle: Prisma CLI pinned to the workspace's exact version + schema/migrations ──
# (a plain npm install of 6 packages; `pnpm deploy` needs far more memory)
FROM deps AS migrate-build
COPY --from=pruner /out/full/packages/db/prisma ./packages/db/prisma
RUN set -eu; \
    V="$(node -p "require('./packages/db/node_modules/prisma/package.json').version")"; \
    mkdir -p /prod/db && cp -R packages/db/prisma packages/db/prisma.config.ts /prod/db/; \
    cd /prod/db && printf '{"name":"atrium-migrate","private":true,"type":"commonjs"}\n' > package.json; \
    npm install --no-fund --no-audit --loglevel=error "prisma@$V" "@prisma/client@$V" "@prisma/adapter-pg@$V" pg dotenv

# ── migration image: `podman run --rm --env-file .env atrium-migrate` ──
FROM docker.io/library/node:${NODE_VERSION}-slim AS migrate
ARG VERSION=dev
ARG GIT_SHA=unknown
LABEL org.opencontainers.image.title="atrium-migrate" \
      org.opencontainers.image.description="Atrium database migrations (prisma migrate deploy)" \
      org.opencontainers.image.source="https://github.com/your-org/atrium" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.licenses="UNLICENSED"
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=migrate-build --chown=node:node /prod/db ./
USER node
CMD ["node_modules/.bin/prisma", "migrate", "deploy"]

# ── runtime (default target) ──
FROM docker.io/library/node:${NODE_VERSION}-slim AS runtime
ARG VERSION=dev
ARG GIT_SHA=unknown
LABEL org.opencontainers.image.title="atrium-api" \
      org.opencontainers.image.description="Atrium platform REST API (NestJS)" \
      org.opencontainers.image.source="https://github.com/your-org/atrium" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.licenses="UNLICENSED"
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=4000 \
    API_PORT=4000 \
    ATRIUM_VERSION=${VERSION}
WORKDIR /app
COPY --from=builder --chown=node:node /repo ./
WORKDIR /app/apps/api
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/v1/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--enable-source-maps", "dist/main.js"]
