#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.local"

TENANT_ID=""
FROM_DATE=""
TO_DATE=""
DRY_RUN="false"
FORCE_RETRY_WITHOUT_LINKED_TASK="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tenant)
      TENANT_ID="$2"
      shift 2
      ;;
    --tenant=*)
      TENANT_ID="${1#*=}"
      shift
      ;;
    --from)
      FROM_DATE="$2"
      shift 2
      ;;
    --from=*)
      FROM_DATE="${1#*=}"
      shift
      ;;
    --to)
      TO_DATE="$2"
      shift 2
      ;;
    --to=*)
      TO_DATE="${1#*=}"
      shift
      ;;
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    --force-retry-without-linked-task)
      FORCE_RETRY_WITHOUT_LINKED_TASK="true"
      shift
      ;;
    -h|--help)
      cat <<'USAGE'
Usage:
  scripts/cron/rulebook-generate.sh [options]

Options:
  --tenant <uuid>                          Run for one tenant (default: all active tenants)
  --from <YYYY-MM-DD>                      Start of generation window
  --to <YYYY-MM-DD>                        End of generation window
  --dry-run                                Evaluate without creating tasks
  --force-retry-without-linked-task        Retry generation records with missing linked task
USAGE
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

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

PAYLOAD=$(TENANT_ID="$TENANT_ID" FROM_DATE="$FROM_DATE" TO_DATE="$TO_DATE" DRY_RUN="$DRY_RUN" FORCE_RETRY_WITHOUT_LINKED_TASK="$FORCE_RETRY_WITHOUT_LINKED_TASK" node <<'NODE'
const payload = {};
const tenantId = process.env.TENANT_ID || '';
const fromDate = process.env.FROM_DATE || '';
const toDate = process.env.TO_DATE || '';
const dryRun = process.env.DRY_RUN === 'true';
const forceRetryWithoutLinkedTask = process.env.FORCE_RETRY_WITHOUT_LINKED_TASK === 'true';

if (tenantId) payload.tenantId = tenantId;
if (fromDate) payload.fromDate = fromDate;
if (toDate) payload.toDate = toDate;
payload.dryRun = dryRun;
payload.forceRetryWithoutLinkedTask = forceRetryWithoutLinkedTask;

process.stdout.write(JSON.stringify(payload));
NODE
)

curl -fsS -X POST "${NEXT_PUBLIC_APP_URL}/api/internal/cron/rulebook-generate" \
  -H "x-cron-secret: ${CRON_SECRET}" \
  -H "content-type: application/json" \
  -d "$PAYLOAD"

echo
