#!/usr/bin/env bash
# ===========================================================================
# BSF backend smoke test
#
# Exercises every endpoint that can be verified without vendor credentials.
# Nothing here fakes a delivery: Email / WhatsApp jobs are expected to end up
# in `waiting_config` until the customer supplies the API keys.
#
# Usage (on the server):
#   sudo bash -c 'set -a; . /etc/bsf-backend.env; set +a; ./scripts/smoke-test.sh'
#
#   ./scripts/smoke-test.sh [base-url] [--keep]
#
# Default base-url is http://127.0.0.1:3000
# Without --keep the throwaway client/machine/recipients are deleted again.
# ===========================================================================
set -euo pipefail

BASE="http://127.0.0.1:3000"
KEEP=0
for arg in "$@"; do
  case "$arg" in
    --keep) KEEP=1 ;;
    http*)  BASE="$arg" ;;
  esac
done

API="$BASE/api/v1"
KEY="${INTERNAL_API_KEY:-}"

if [ -z "$KEY" ]; then
  echo "!! INTERNAL_API_KEY is empty - write checks will expect a 401." >&2
fi

auth=(-H "content-type: application/json")
[ -n "$KEY" ] && auth+=(-H "x-api-key: $KEY")

pass=0
fail=0

# Strip all whitespace so the assertions do not depend on JSON formatting.
norm() { printf '%s' "$1" | tr -d '[:space:]'; }

check() { # check <label> <expected-fragment> <actual>
  local label="$1" want="$2" got="$3"
  if norm "$got" | grep -qF "$(norm "$want")"; then
    printf '  \033[32mPASS\033[0m %s\n' "$label"
    pass=$((pass + 1))
  else
    printf '  \033[31mFAIL\033[0m %s\n      expected to contain: %s\n      got: %s\n' \
      "$label" "$want" "$(printf '%s' "$got" | cut -c1-400)"
    fail=$((fail + 1))
  fi
}

# Walk a JSON path, e.g.  json_field data id
json_field() {
  python3 -c '
import sys, json
try:
    d = json.load(sys.stdin)
except Exception:
    print(""); sys.exit(0)
for key in sys.argv[1:]:
    if isinstance(d, list):
        d = d[int(key)]
    elif isinstance(d, dict):
        d = d.get(key)
    else:
        d = None
    if d is None:
        break
print("" if d is None else d)
' "$@"
}

echo "=============================================================="
echo " BSF backend smoke test"
echo " target: $API"
echo "=============================================================="

echo
echo "[1] service health"
H=$(curl -s "$API/health")
check "health returns ok"    '"ok": true'        "$H"
check "database reachable"   '"database":{"ok":true' "$H"
check "queue stats present"  'waiting_config'    "$H"

echo
echo "[2] provider credential state"
P=$(curl -s "$API/meta/providers")
check "email status reported"     '"channel":"email"'    "$P"
check "whatsapp status reported"  '"channel":"whatsapp"' "$P"

echo
echo "[3] write endpoints require the API key"
UNAUTH=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/clients" \
  -H 'content-type: application/json' -d '{"name":"should-not-exist"}')
if [ -z "$KEY" ]; then
  check "unsigned write allowed (INTERNAL_API_KEY is empty)" "20" "$UNAUTH"
else
  check "unsigned write rejected with 401" "401" "$UNAUTH"
fi

echo
echo "[4] validation rejects bad input"
BAD=$(curl -s -X POST "$API/notifications/send" "${auth[@]}" -d '{"channel":"carrier-pigeon","to":"x"}')
check "invalid channel rejected" 'VALIDATION_ERROR' "$BAD"

echo
echo "[5] create a client, machine and recipient"
SERIAL="SMOKE-$(date +%s)"
CLIENT=$(curl -s -X POST "$API/clients" "${auth[@]}" \
  -d "{\"name\":\"Smoke Test Client $SERIAL\",\"code\":\"$SERIAL\",\"region\":\"hk_island\"}")
check "client created" '"ok":true' "$CLIENT"
CID=$(printf '%s' "$CLIENT" | json_field data id)

MACHINE=$(curl -s -X POST "$API/machines" "${auth[@]}" \
  -d "{\"serial\":\"$SERIAL\",\"name\":\"Smoke Bin\",\"clientId\":\"$CID\",\"region\":\"hk_island\"}")
check "machine created"     '"ok":true'              "$MACHINE"
check "machine linked to client" "\"client_id\":\"$CID\"" "$MACHINE"
MID=$(printf '%s' "$MACHINE" | json_field data id)

R1=$(curl -s -X POST "$API/notification-recipients" "${auth[@]}" \
  -d "{\"clientId\":\"$CID\",\"machineId\":\"$MID\",\"channel\":\"email\",\"address\":\"smoke@example.com\",\"name\":\"Smoke Tester\"}")
check "email recipient created" '"ok":true' "$R1"
RID=$(printf '%s' "$R1" | json_field data id)

R2=$(curl -s -X POST "$API/notification-recipients" "${auth[@]}" \
  -d "{\"clientId\":\"$CID\",\"machineId\":\"$MID\",\"channel\":\"whatsapp\",\"address\":\"+85261234567\"}")
check "whatsapp recipient created" '"ok":true' "$R2"
RID2=$(printf '%s' "$R2" | json_field data id)

echo
echo "[6] temperature inside the safe range produces no alert"
SAFE=$(curl -s -X POST "$API/alerts/temperature" "${auth[@]}" \
  -d "{\"machineSerial\":\"$SERIAL\",\"temperatureC\":35}")
check "no breach reported" '"breached":false' "$SAFE"

echo
echo "[7] 61.5C breaches the 58C limit and fans out to both channels"
HOT=$(curl -s -X POST "$API/alerts/temperature" "${auth[@]}" \
  -d "{\"machineSerial\":\"$SERIAL\",\"temperatureC\":61.5}")
check "high breach detected"  '"breached":"high"' "$HOT"
check "alert queued"          '"jobId"'           "$HOT"
check "both channels targeted" '"channel":"whatsapp"' "$HOT"

echo
echo "[8] a repeat reading inside the same hour is deduplicated"
HOT2=$(curl -s -X POST "$API/alerts/temperature" "${auth[@]}" \
  -d "{\"machineSerial\":\"$SERIAL\",\"temperatureC\":63}")
check "duplicate suppressed" '"deduplicated":true' "$HOT2"

echo
echo "[9] 8C breaches the 12C lower limit in the other direction"
COLD=$(curl -s -X POST "$API/alerts/temperature" "${auth[@]}" \
  -d "{\"machineSerial\":\"$SERIAL\",\"temperatureC\":8}")
check "low breach detected" '"breached":"low"' "$COLD"

echo
echo "[10] credentials are still missing, so nothing may report as sent"
sleep 8
STATS=$(curl -s "$API/notifications/stats")
check "no job claims to be sent"     '"sent":0'         "$STATS"
check "jobs parked awaiting config"  '"waiting_config"' "$STATS"

echo
echo "[11] delivery history records why nothing was delivered"
LOGS=$(curl -s "$API/notifications/logs?limit=5")
check "log entry explains the failure" 'PROVIDER_NOT_CONFIGURED' "$LOGS"

echo
echo "[12] audit trail captured the changes"
AUDIT=$(curl -s "$API/audit-logs?limit=5")
check "audit entries exist" '"action"' "$AUDIT"

echo
echo "[13] test-send endpoint never claims a delivery"
TESTMAIL=$(curl -s -X POST "$API/notifications/test/email" "${auth[@]}" -d '{"to":"smoke@example.com"}')
check "reports provider not configured" '"providerConfigured":false' "$TESTMAIL"

# ---------------------------------------------------------------------------
# Clean up the throwaway records unless --keep was requested.
# ---------------------------------------------------------------------------
if [ "$KEEP" -eq 0 ] && [ -n "${DATABASE_URL:-}" ]; then
  psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 >/dev/null <<SQL
DELETE FROM notification_logs  WHERE job_id IN (
         SELECT id FROM notification_jobs
          WHERE client_id = '$CID' OR to_address = 'smoke@example.com');
DELETE FROM notification_jobs  WHERE client_id = '$CID' OR to_address = 'smoke@example.com';
DELETE FROM notification_recipients WHERE client_id = '$CID';
DELETE FROM alert_thresholds   WHERE machine_id = '$MID';
DELETE FROM machines           WHERE id = '$MID';
DELETE FROM audit_logs         WHERE entity_id IN ('$CID', '$MID', '$RID', '$RID2');
DELETE FROM clients            WHERE id = '$CID';
SQL
  echo
  echo "Demo records for $SERIAL removed (pass --keep to retain them)."
fi

echo
echo "=============================================================="
printf ' result: \033[32m%d passed\033[0m, ' "$pass"
if [ "$fail" -gt 0 ]; then printf '\033[31m%d failed\033[0m\n' "$fail"; else printf '0 failed\n'; fi
echo "=============================================================="

[ "$fail" -eq 0 ]
