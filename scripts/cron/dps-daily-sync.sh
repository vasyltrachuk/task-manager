#!/bin/zsh
set -euo pipefail

ROOT_DIR="/Users/admin/Develop/task-manager"
ENV_FILE="$ROOT_DIR/.env.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

if [[ -z "${NEXT_PUBLIC_APP_URL:-}" || -z "${CRON_SECRET:-}" ]]; then
  echo "NEXT_PUBLIC_APP_URL or CRON_SECRET is missing"
  exit 1
fi

curl -fsS -X POST "${NEXT_PUBLIC_APP_URL}/api/internal/cron/dps-daily-sync" \
  -H "x-cron-secret: ${CRON_SECRET}" \
  -H "content-type: application/json"
