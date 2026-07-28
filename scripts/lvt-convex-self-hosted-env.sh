#!/bin/zsh
set -euo pipefail

if (( $# == 0 )); then
  echo "usage: $0 <command> [args...]" >&2
  exit 64
fi

export CONVEX_SELF_HOSTED_URL="http://127.0.0.1:3210"
export CONVEX_SELF_HOSTED_ADMIN_KEY="$(
  security find-generic-password \
    -s lvt-convex-local-admin-key \
    -a lvt-crm \
    -w
)"
export CONVEX_DEPLOYMENT=""

exec "$@"
