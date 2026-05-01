#!/usr/bin/env bash
# Spin up OWASP Juice Shop locally and run a speedyturtle Red Team scan against it.
# Juice Shop is specifically built to fail security scans — perfect for demonstrating
# the full reasoning depth (validator + chain reasoning + cheapest cut + adversary + genealogy).
#
# Requires: Docker, dev server already running on http://localhost:3030

set -uo pipefail

JUICE_PORT="${JUICE_PORT:-3001}"
SPEEDY="${SPEEDY:-http://localhost:3030}"
HERE="$(cd "$(dirname "$0")" && pwd)"

echo "→ Bringing up Juice Shop on :${JUICE_PORT}…"
( cd "$HERE" && docker compose up -d ) || { echo "  ✗ docker compose failed (is Docker Desktop running?)"; exit 1; }

echo "→ Waiting for Juice Shop to be healthy…"
DEADLINE=$(($(date +%s) + 90))
until curl -s -o /dev/null -w "%{http_code}" --max-time 2 "http://localhost:${JUICE_PORT}" 2>/dev/null | grep -q "200"; do
  if [ $(date +%s) -gt $DEADLINE ]; then echo "  ✗ Juice Shop didn't come up in 90s"; exit 1; fi
  sleep 3
done
echo "  ✓ Juice Shop responding at http://localhost:${JUICE_PORT}"

echo "→ Verifying speedyturtle dev server at ${SPEEDY}…"
if ! curl -s -o /dev/null --max-time 3 "${SPEEDY}" >/dev/null; then
  echo "  ✗ speedyturtle dev server not reachable. Run: cd ~/speedyturtle && PORT=3030 npm run dev"
  exit 1
fi

echo "→ Submitting scan against http://localhost:${JUICE_PORT}…"
SCAN=$(curl -s -X POST "${SPEEDY}/api/scan" -H "Content-Type: application/json" \
  -d "{\"target\":\"localhost:${JUICE_PORT}\",\"email\":\"juice-shop-test@speedyturtle.local\",\"mode\":\"red-team\",\"authorizationConfirmed\":true}")
SCAN_ID=$(echo "$SCAN" | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))")

if [ -z "$SCAN_ID" ]; then
  echo "  ✗ Submission failed: $SCAN"
  exit 1
fi

echo "  ✓ Scan ID: $SCAN_ID"
echo "  → Watch progress at: ${SPEEDY}/scan/${SCAN_ID}"
echo
echo "Polling status every 8s…"

START=$(date +%s)
LAST=""
while [ $(($(date +%s) - START)) -lt 600 ]; do
  RAW=$(curl -s "${SPEEDY}/api/scan/${SCAN_ID}/status")
  LINE=$(echo "$RAW" | python3 -c "import sys,json;d=json.load(sys.stdin);p=d.get('progress',{});print(f\"{d.get('status','?')} · {p.get('pct',0)}% · {p.get('message','')[:60]}\")" 2>/dev/null)
  if [ "$LINE" != "$LAST" ]; then
    echo "  · $LINE"
    LAST="$LINE"
  fi
  if echo "$RAW" | grep -qE '"status":"(ready|failed)"'; then break; fi
  sleep 8
done

echo
echo "Scan finished. Result + PDF:"
echo "  ${SPEEDY}/scan/${SCAN_ID}"
echo "  ${SPEEDY}/api/pdf/${SCAN_ID}"
echo
echo "To tear down Juice Shop: cd ${HERE} && docker compose down"
