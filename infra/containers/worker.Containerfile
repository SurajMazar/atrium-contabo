# Atrium worker (BullMQ consumers: email, SMS, webhooks, form workflows, media/sharp,
# deployments, AI generation, analytics rollups). Long-running — run it on a container
# platform or VM, never on serverless functions.
#
#   podman build --format docker -f infra/containers/worker.Containerfile -t atrium-worker .
#
# Uses Debian slim (glibc): sharp's prebuilt libvips binaries target glibc and musl,
# but glibc avoids musl allocator/perf pitfalls for image processing.

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
    TURBO_TELEMETRY_DISABLED=1
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g pnpm@${PNPM_VERSION} --no-fund --no-audit --loglevel=error
WORKDIR /repo

FROM base AS pruner
ARG TURBO_VERSION
RUN npm install -g turbo@${TURBO_VERSION} --no-fund --no-audit --loglevel=error
COPY . .
RUN turbo prune @atrium/worker --docker --out-dir /out

FROM base AS deps
ARG PNPM_INSTALL_FLAGS
COPY --from=pruner /out/json/ ./
COPY --from=pruner /out/full/packages/db/prisma ./packages/db/prisma
COPY --from=pruner /out/full/packages/db/prisma.config.ts ./packages/db/prisma.config.ts
# The pnpm store stays inside the image layer (same filesystem as node_modules): cache mounts
# break pnpm file copying across filesystems (EXDEV) on some builders. Layer caching still skips this step when
# no package.json/lockfile changed.
RUN pnpm config set store-dir /pnpm/store \
 && pnpm install --frozen-lockfile ${PNPM_INSTALL_FLAGS}

FROM deps AS builder
ARG TURBO_CONCURRENCY
ARG PNPM_INSTALL_FLAGS
COPY --from=pruner /out/full/ ./
RUN pnpm exec turbo run build --filter=@atrium/worker --output-logs=errors-only --concurrency=${TURBO_CONCURRENCY}
# Production-only node_modules for the pruned workspace (offline, from the in-layer store).
RUN rm -rf node_modules apps/*/node_modules packages/*/node_modules \
 && pnpm install --prod --frozen-lockfile --offline --ignore-scripts ${PNPM_INSTALL_FLAGS} \
 && rm -rf apps/worker/src .turbo apps/*/.turbo packages/*/.turbo

FROM docker.io/library/node:${NODE_VERSION}-slim AS runtime
ARG VERSION=dev
ARG GIT_SHA=unknown
LABEL org.opencontainers.image.title="atrium-worker" \
      org.opencontainers.image.description="Atrium background workers (BullMQ)" \
      org.opencontainers.image.source="https://github.com/your-org/atrium" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.licenses="UNLICENSED"
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*
# VIPS_CONCURRENCY/MALLOC_ARENA_MAX keep sharp/libvips memory in check on small containers.
ENV NODE_ENV=production \
    ATRIUM_VERSION=${VERSION} \
    ATRIUM_REPO_ROOT=/app \
    VIPS_CONCURRENCY=2 \
    MALLOC_ARENA_MAX=2
WORKDIR /app
# App code is owned by root and not writable by the runtime `node` user; only the dirs below are.
# The worker writes only to os.tmpdir() (mount a tmpfs at /tmp).
COPY --from=builder /repo ./
# Independent deployments: the exporter (packages/exporter) builds a standalone Next.js project
# from the renderer app + the source of its workspace packages, so ship those sources too
# (source only — no node_modules; they are read, not executed, by the worker).
COPY --from=pruner /repo/apps/renderer ./apps/renderer
COPY --from=pruner /repo/packages ./packages
WORKDIR /app/apps/worker
USER node
# No HTTP port: liveness is the process itself. The worker exits on unrecoverable errors
# (e.g. Redis gone for good) and the orchestrator restarts it; queue depth/failures are
# visible via `atrium status`, the admin Jobs page, or BullMQ metrics.
HEALTHCHECK NONE
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--enable-source-maps", "dist/main.js"]
