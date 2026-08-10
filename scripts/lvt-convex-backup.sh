#!/bin/zsh
set -euo pipefail
umask 077

readonly SCRIPT_DIR="${0:A:h}"
readonly REPO="${SCRIPT_DIR:h}"
readonly BACKUP_DIR="${LVT_CONVEX_BACKUP_DIR:-$REPO/.runtime/backups/convex}"

mkdir -p "$BACKUP_DIR"
cd "$REPO"

timestamp="$(date '+%Y%m%dT%H%M%S%z')"
temporary_directory="$(mktemp -d "$BACKUP_DIR/.local-$timestamp.XXXXXX")"
temporary_snapshot="$temporary_directory/snapshot.zip"
snapshot="$BACKUP_DIR/local-$timestamp-${temporary_directory##*.}.zip"
trap 'rm -rf "$temporary_directory"' EXIT

./scripts/lvt-convex-self-hosted-env.sh \
  ./node_modules/.bin/convex export \
  --include-file-storage \
  --path "$temporary_snapshot"
unzip -t "$temporary_snapshot" >/dev/null
mv "$temporary_snapshot" "$snapshot"
rmdir "$temporary_directory"
trap - EXIT

find "$BACKUP_DIR" -type f -name 'local-*.zip' -mtime +30 -delete

echo "ok timestamp=$timestamp snapshot=$snapshot"
