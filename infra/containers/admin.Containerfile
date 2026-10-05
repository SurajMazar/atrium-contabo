# Atrium admin dashboard + visual builder (Next.js)
#
#   podman build --format docker -f infra/containers/admin.Containerfile -t atrium-admin .
#   podman build ... --build-arg ATRIUM_API_INTERNAL_URL=http://api:4000
#
# Next.js builds are memory hungry: give the podman machine >= 6 GiB
# (podman machine set --memory 6144) or the build is OOM-killed (exit 137).
# ATRIUM_API_INTERNAL_URL is baked into the /api/* rewrite at build time (next.config.ts),
# so build one image per environment or keep it pointing at an internal service name.
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
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g pnpm@${PNPM_VERSION} --no-fund --no-audit --loglevel=error
WORKDIR /repo

FROM base AS pruner
ARG TURBO_VERSION
RUN npm install -g turbo@${TURBO_VERSION} --no-fund --no-audit --loglevel=error
COPY . .
RUN turbo prune @atrium/admin --docker --out-dir /out

FROM base AS deps
ARG PNPM_INSTALL_FLAGS
COPY --from=pruner /out/json/ ./
# The pnpm store stays inside the image layer (same filesystem as node_modules): cache mounts
# break pnpm file copying across filesystems (EXDEV) on some builders. Layer caching still skips this step when
# no package.json/lockfile changed.
RUN pnpm config set store-dir /pnpm/store \
 && pnpm install --frozen-lockfile ${PNPM_INSTALL_FLAGS} --ignore-scripts

FROM deps AS builder
ARG TURBO_CONCURRENCY
ARG PNPM_INSTALL_FLAGS
ARG ATRIUM_API_INTERNAL_URL=http://api:4000
ARG NODE_OPTIONS=--max-old-space-size=3072
ENV ATRIUM_API_INTERNAL_URL=${ATRIUM_API_INTERNAL_URL} \
    NODE_OPTIONS=${NODE_OPTIONS} \
    NODE_ENV=production
COPY --from=pruner /out/full/ ./
RUN pnpm exec turbo run build --filter=@atrium/admin --output-logs=errors-only --concurrency=${TURBO_CONCURRENCY}
# Production-only node_modules for the pruned workspace (offline, from the in-layer store).
RUN rm -rf node_modules apps/*/node_modules packages/*/node_modules apps/admin/.next/cache \
 && pnpm install --prod --frozen-lockfile --offline --ignore-scripts ${PNPM_INSTALL_FLAGS} \
 && rm -rf .turbo apps/*/.turbo packages/*/.turbo

FROM docker.io/library/node:${NODE_VERSION}-slim AS runtime
ARG VERSION=dev
ARG GIT_SHA=unknown
LABEL org.opencontainers.image.title="atrium-admin" \
      org.opencontainers.image.description="Atrium admin dashboard + visual builder (Next.js)" \
      org.opencontainers.image.source="https://github.com/your-org/atrium" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.licenses="UNLICENSED"
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    ATRIUM_VERSION=${VERSION}
WORKDIR /app
COPY --from=builder --chown=node:node /repo ./
WORKDIR /app/apps/admin

RUN mkdir -p .next/cache && chown -R node:node .next/cache
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/',{redirect:'manual'}).then(r=>process.exit(r.status<500?0:1),()=>process.exit(1))"]
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sh", "-c", "exec node node_modules/next/dist/bin/next start --port ${PORT} --hostname ${HOSTNAME}"]
