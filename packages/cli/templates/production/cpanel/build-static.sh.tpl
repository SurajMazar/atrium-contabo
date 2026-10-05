#!/usr/bin/env bash
# Build a static export of ONE Atrium website for shared hosting (no Node.js needed on the server).
# Usage: ./build-static.sh <site-slug>   (run from the Atrium checkout, logged in with `atrium login`)
set -euo pipefail
SITE="${1:?usage: build-static.sh <site-slug>}"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
OUT="$(pwd)/public_html"

# 1. Export the published snapshot (site.json) — or `--format nextjs` for a standalone project.
pnpm --dir "$ROOT" atrium export-site "$SITE" --format json -o "$ROOT/apps/renderer/site-snapshot.json"

# 2. Static export of the renderer in single-site file mode.
( cd "$ROOT" && ATRIUM_SNAPSHOT_SOURCE=file ATRIUM_SNAPSHOT_FILE="$ROOT/apps/renderer/site-snapshot.json" \
    ATRIUM_STATIC_EXPORT=1 pnpm --filter @atrium/renderer build )

# 3. Collect the output + .htaccess.
rm -rf "$OUT" && mkdir -p "$OUT"
cp -R "$ROOT/apps/renderer/out/." "$OUT/"
cp "$(dirname "$0")/.htaccess" "$OUT/.htaccess"
echo "Upload $OUT/ to public_html via File Manager, FTP or: rsync -avz --delete public_html/ user@host:public_html/"
echo "Forms still POST to https://{{apiHost}}/v1/public/forms/... — keep the API reachable."
