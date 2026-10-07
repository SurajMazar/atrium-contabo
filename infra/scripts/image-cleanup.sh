#!/bin/sh
# Remove old Atrium images from a deploy host, keeping the newest $KEEP per image (default 3) so a
# rollback to a recent tag needs no pull. Images used by any container (running or stopped) are never
# removed. Dangling layers are pruned afterwards.
#
#   KEEP=3 PREFIX=ghcr.io/surajmazar/atrium-contabo/ infra/scripts/image-cleanup.sh
#
# Installed on the Contabo VPS as /usr/local/sbin/atrium-image-cleanup, run daily by /etc/cron.d/atrium-image-cleanup.
set -eu
KEEP="${KEEP:-3}"
PREFIX="${PREFIX:-ghcr.io/surajmazar/atrium-contabo/}"
ENGINE="$(command -v docker || command -v podman)"
TAB="$(printf '\t')"

in_use="$("$ENGINE" ps -a --format '{{.Image}}' | sort -u)"
in_use_ids="$("$ENGINE" ps -aq | xargs -r "$ENGINE" inspect --format '{{.Image}}' | sed 's/^sha256://' | cut -c1-12 | sort -u)"

"$ENGINE" images --format '{{.Repository}}' | grep "^${PREFIX}" | sort -u | while read -r repo; do
  # Newest first (CreatedAt sorts lexicographically); everything after the first $KEEP is a candidate.
  "$ENGINE" images "$repo" --format "{{.CreatedAt}}${TAB}{{.ID}}${TAB}{{.Repository}}:{{.Tag}}" | sort -r |
    awk -F "$TAB" -v keep="$KEEP" 'NR > keep { print $2 "\t" $3 }' |
    while IFS="$TAB" read -r id ref; do
      if printf '%s\n' "$in_use" | grep -qxF "$ref" || printf '%s\n' "$in_use_ids" | grep -qxF "$(printf '%s' "$id" | cut -c1-12)"; then
        continue
      fi
      if "$ENGINE" image rm "$ref" >/dev/null 2>&1; then echo "$(date -u +%FT%TZ) removed $ref"; fi
    done
done

"$ENGINE" image prune -f >/dev/null 2>&1 || true
