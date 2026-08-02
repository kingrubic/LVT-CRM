#!/bin/zsh
set -euo pipefail
umask 077

readonly REPO="/Users/vsc_agent/projects/LVT-CRM"
readonly BACKUP_DIR="/Users/vsc_agent/clawd/backups/lvt-crm-convex/nightly"

mkdir -p "$BACKUP_DIR"
cd "$REPO"

timestamp="$(date '+%Y%m%dT%H%M%S%z')"
snapshot="$BACKUP_DIR/local-$timestamp.zip"

./scripts/lvt-convex-self-hosted-env.sh \
  ./node_modules/.bin/convex export \
  --include-file-storage \
  --path "$snapshot"
unzip -t "$snapshot" >/dev/null

find "$BACKUP_DIR" -type f -name 'local-*.zip' -mtime +30 -delete

echo "ok timestamp=$timestamp snapshot=$snapshot"
