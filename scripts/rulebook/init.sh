#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.local"

TENANT_ID=""
VERSION_CODE=""
VERSION_NAME=""
VERSION_DESCRIPTION=""
EFFECTIVE_FROM=""
ACTIVATE_VERSION="true"
REPLACE_RULES="false"

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
    --version-code)
      VERSION_CODE="$2"
      shift 2
      ;;
    --version-code=*)
      VERSION_CODE="${1#*=}"
      shift
      ;;
    --version-name)
      VERSION_NAME="$2"
      shift 2
      ;;
    --version-name=*)
      VERSION_NAME="${1#*=}"
      shift
      ;;
    --version-description)
      VERSION_DESCRIPTION="$2"
      shift 2
      ;;
    --version-description=*)
      VERSION_DESCRIPTION="${1#*=}"
      shift
      ;;
    --effective-from)
      EFFECTIVE_FROM="$2"
      shift 2
      ;;
    --effective-from=*)
      EFFECTIVE_FROM="${1#*=}"
      shift
      ;;
    --replace-rules)
      REPLACE_RULES="true"
      shift
      ;;
    --no-activate)
      ACTIVATE_VERSION="false"
      shift
      ;;
    -h|--help)
      cat <<'USAGE'
Usage:
  scripts/rulebook/init.sh [options]

Options:
  --tenant <uuid>              Init only for one tenant (default: all active tenants)
  --version-code <code>        Rulebook version code
  --version-name <name>        Rulebook version name
  --version-description <txt>  Rulebook version description
  --effective-from <YYYY-MM-DD>
  --replace-rules              Delete existing rules in target version before upsert
  --no-activate                Keep version inactive after init
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

PAYLOAD=$(TENANT_ID="$TENANT_ID" VERSION_CODE="$VERSION_CODE" VERSION_NAME="$VERSION_NAME" VERSION_DESCRIPTION="$VERSION_DESCRIPTION" EFFECTIVE_FROM="$EFFECTIVE_FROM" ACTIVATE_VERSION="$ACTIVATE_VERSION" REPLACE_RULES="$REPLACE_RULES" node <<'NODE'
const payload = {};
const tenantId = process.env.TENANT_ID || '';
const versionCode = process.env.VERSION_CODE || '';
const versionName = process.env.VERSION_NAME || '';
const versionDescription = process.env.VERSION_DESCRIPTION || '';
const effectiveFrom = process.env.EFFECTIVE_FROM || '';
const activateVersion = process.env.ACTIVATE_VERSION === 'true';
const replaceRules = process.env.REPLACE_RULES === 'true';

if (tenantId) payload.tenantId = tenantId;
if (versionCode) payload.versionCode = versionCode;
if (versionName) payload.versionName = versionName;
if (versionDescription) payload.versionDescription = versionDescription;
if (effectiveFrom) payload.effectiveFrom = effectiveFrom;
payload.activateVersion = activateVersion;
payload.replaceRules = replaceRules;

process.stdout.write(JSON.stringify(payload));
NODE
)

curl -fsS -X POST "${NEXT_PUBLIC_APP_URL}/api/internal/rulebook/init" \
  -H "x-cron-secret: ${CRON_SECRET}" \
  -H "content-type: application/json" \
  -d "$PAYLOAD"

echo
