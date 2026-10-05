#!/usr/bin/env bash
# Atrium backup without Node.js — for cron, systemd timers (infra/systemd/atrium-backup.timer)
# and servers that only run containers. `atrium backup` is the richer equivalent (manifest
# with migration list, restore command); both write the same layout:
#
#   $BACKUP_DIR/<YYYYmmdd-HHMMSS>/database.sql.gz   pg_dump --clean --if-exists (plain SQL, gzip)
#   $BACKUP_DIR/<YYYYmmdd-HHMMSS>/files.tar.gz      object storage / local uploads (--with-files)
#   $BACKUP_DIR/<YYYYmmdd-HHMMSS>/SHA256SUMS
#
# Usage: infra/scripts/backup.sh [--with-files] [--env-file .env] [--keep 14]
# Env:   DATABASE_URL (required), BACKUP_DIR (default ./backups), KEEP (default 14),
#        PG_CONTAINER (use `podman/docker exec` into this container instead of local pg_dump),
#        BACKUP_S3_URI (optional, e.g. s3://my-backups/atrium — uploaded with the aws CLI),
#        STORAGE_DRIVER/S3_* or LOCAL_STORAGE_DIR (for --with-files).
# Restore: gunzip -c database.sql.gz | psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction
set -euo pipefail

WITH_FILES=0
ENV_FILE="${ATRIUM_ENV_FILE:-}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-files) WITH_FILES=1 ;;
    --env-file) ENV_FILE="$2"; shift ;;
    --keep) KEEP="$2"; shift ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

if [[ -n "$ENV_FILE" ]]; then
  set -a; # shellcheck disable=SC1090
  source "$ENV_FILE"; set +a
fi

: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP="${KEEP:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$BACKUP_DIR/$STAMP"
umask 077
mkdir -p "$DEST"
log() { printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*"; }

engine() { command -v podman >/dev/null 2>&1 && echo podman || echo docker; }

# Auto-detect the compose postgres container when DATABASE_URL points at localhost.
if [[ -z "${PG_CONTAINER:-}" && "$DATABASE_URL" =~ @(localhost|127\.0\.0\.1)[:/] ]] && ! command -v pg_dump >/dev/null 2>&1; then
  PG_CONTAINER="$($(engine) ps --filter label=com.docker.compose.service=postgres --format '{{.Names}}' 2>/dev/null | head -n1 || true)"
fi

log "dumping database → $DEST/database.sql.gz"
DUMP_FLAGS=(--clean --if-exists --no-owner --no-privileges --quote-all-identifiers)
if [[ -n "${PG_CONTAINER:-}" ]]; then
  # Parse user/db from the URL; the container's local socket needs no password.
  PG_USER="$(sed -E 's#^[a-z]+://([^:@/]+).*#\1#' <<<"$DATABASE_URL")"
  PG_DB="$(sed -E 's#^.*/([^/?]+)(\?.*)?$#\1#' <<<"$DATABASE_URL")"
  $(engine) exec -i "$PG_CONTAINER" pg_dump -U "$PG_USER" -d "$PG_DB" "${DUMP_FLAGS[@]}" | gzip -6 > "$DEST/database.sql.gz"
else
  pg_dump "$DATABASE_URL" "${DUMP_FLAGS[@]}" | gzip -6 > "$DEST/database.sql.gz"
fi

if [[ "$WITH_FILES" == 1 ]]; then
  TMP="$(mktemp -d "$DEST/.files.XXXXXX")"
  trap 'rm -rf "$TMP"' EXIT
  if [[ "${STORAGE_DRIVER:-local}" == "local" ]]; then
    SRC="${LOCAL_STORAGE_DIR:-./storage}"
    log "archiving local uploads from $SRC"
    [[ -d "$SRC" ]] && tar -cf "$TMP/local.tar" -C "$SRC" .
  else
    command -v aws >/dev/null 2>&1 || { echo "aws CLI is required for --with-files with S3 storage (or use \`atrium backup --with-files\`)" >&2; exit 1; }
    log "syncing s3://${S3_BUCKET} (${S3_ENDPOINT:-aws})"
    AWS_ACCESS_KEY_ID="${S3_ACCESS_KEY_ID:-}" AWS_SECRET_ACCESS_KEY="${S3_SECRET_ACCESS_KEY:-}" AWS_DEFAULT_REGION="${S3_REGION:-us-east-1}" \
      aws ${S3_ENDPOINT:+--endpoint-url "$S3_ENDPOINT"} s3 sync "s3://${S3_BUCKET}" "$TMP/objects" --only-show-errors
  fi
  tar -czf "$DEST/files.tar.gz" -C "$TMP" .
fi

( cd "$DEST" && sha256sum ./*.gz > SHA256SUMS 2>/dev/null || shasum -a 256 ./*.gz > SHA256SUMS )
log "backup complete: $(du -sh "$DEST" | cut -f1) in $DEST"

if [[ -n "${BACKUP_S3_URI:-}" ]]; then
  log "uploading to $BACKUP_S3_URI/$STAMP"
  aws s3 cp --recursive --only-show-errors "$DEST" "$BACKUP_S3_URI/$STAMP"
fi

# Rotation: keep the newest $KEEP timestamped directories.
if [[ "$KEEP" =~ ^[0-9]+$ && "$KEEP" -gt 0 ]]; then
  find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '20[0-9][0-9][0-1][0-9][0-3][0-9]-*' | sort \
    | awk -v keep="$KEEP" '{ d[NR] = $0 } END { for (i = 1; i <= NR - keep; i++) print d[i] }' \
    | while IFS= read -r d; do log "rotating out $d"; rm -rf -- "$d"; done
fi
