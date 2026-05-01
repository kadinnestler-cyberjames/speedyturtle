#!/usr/bin/env bash
# speedyturtle end-to-end smoke test.
#
# Spins up the dev server (if not running), submits a scan against a
# deliberately-vulnerable training target, polls until ready, fetches
# the full result + PDF, and reports back.
#
# Default target: testphp.vulnweb.com (Acunetix's public test site,
# explicitly authorized for scanning per https://www.vulnweb.com/).
#
# Usage:
#   ./scripts/test-scan.sh                          # uses default target
#   ./scripts/test-scan.sh https://your-target.com  # custom target
#   TARGET=foo.com ./scripts/test-scan.sh           # via env var

set -uo pipefail

TARGET="${1:-${TARGET:-testphp.vulnweb.com}}"
EMAIL="${EMAIL:-test@speedyturtle.local}"
BASE="${BASE:-http://localhost:3000}"
TIMEOUT_SEC="${TIMEOUT_SEC:-600}"

echo "═══════════════════════════════════════════════════════════════"
echo " speedyturtle end-to-end test"
echo "═══════════════════════════════════════════════════════════════"
echo " Target:   $TARGET"
echo " Email:    $EMAIL"
echo " Base URL: $BASE"
echo " Timeout:  ${TIMEOUT_SEC}s"
echo "═══════════════════════════════════════════════════════════════"
echo

# 1. Verify dev server is running
echo "→ Checking dev server at $BASE…"
if ! curl -s -o /dev/null -w "%{http_code}" --max-time 3 "$BASE" | grep -q "200"; then
  echo "  ✗ Dev server not responding. Start it with:"
  echo "    cd ~/speedyturtle && npm run dev"
  exit 1
fi
echo "  ✓ Dev server responding"

# 2. Verify scanner binaries
echo "→ Checking scanner binaries…"
for bin in subfinder httpx nuclei; do
  if [ -x "$HOME/.local/bin/$bin" ]; then
    echo "  ✓ $bin present"
  else
    echo "  ⚠ $bin missing (will degrade gracefully but reduces findings)"
  fi
done

# 3. Verify Claude API key
echo "→ Checking ANTHROPIC_API_KEY…"
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  echo "  ✓ ANTHROPIC_API_KEY set (full reasoning enabled)"
else
  echo "  ⚠ ANTHROPIC_API_KEY missing (5 reasoning layers will use template fallbacks)"
fi
echo

# 4. Submit scan
echo "→ Submitting scan request…"
SCAN_RESPONSE=$(curl -s -X POST "$BASE/api/scan" \
  -H "Content-Type: application/json" \
  -d "{\"target\":\"$TARGET\",\"email\":\"$EMAIL\",\"mode\":\"red-team\",\"authorizationConfirmed\":true}")

SCAN_ID=$(echo "$SCAN_RESPONSE" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('id',''))" 2>/dev/null)

if [ -z "$SCAN_ID" ]; then
  echo "  ✗ Submission failed:"
  echo "    $SCAN_RESPONSE"
  exit 1
fi
echo "  ✓ Scan ID: $SCAN_ID"
echo

# 5. Poll status
echo "→ Polling scan status (max ${TIMEOUT_SEC}s)…"
START=$(date +%s)
LAST_STEP=""
while true; do
  STATUS_JSON=$(curl -s "$BASE/api/scan/$SCAN_ID/status")
  STATUS=$(echo "$STATUS_JSON" | python3 -c "import sys,json;print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
  STEP=$(echo "$STATUS_JSON" | python3 -c "import sys,json;p=json.load(sys.stdin).get('progress',{});print(f\"{p.get('pct',0)}% — {p.get('message','')}\")" 2>/dev/null)

  if [ "$STEP" != "$LAST_STEP" ]; then
    echo "  · $STEP"
    LAST_STEP="$STEP"
  fi

  if [ "$STATUS" = "ready" ]; then
    DURATION=$(($(date +%s) - START))
    echo "  ✓ Scan complete in ${DURATION}s"
    break
  fi
  if [ "$STATUS" = "failed" ]; then
    echo "  ✗ Scan failed"
    echo "$STATUS_JSON" | python3 -m json.tool
    exit 1
  fi
  if [ $(($(date +%s) - START)) -gt "$TIMEOUT_SEC" ]; then
    echo "  ✗ Timeout after ${TIMEOUT_SEC}s"
    exit 1
  fi
  sleep 5
done
echo

# 6. Fetch full result via the on-disk store (avoids needing a result API endpoint)
echo "→ Fetching full result…"
RESULT_FILE="/tmp/speedyturtle/scans/${SCAN_ID}.json"
if [ ! -f "$RESULT_FILE" ]; then
  echo "  ✗ Result file not found at $RESULT_FILE"
  exit 1
fi

FINDING_COUNT=$(python3 -c "import json;print(len(json.load(open('$RESULT_FILE')).get('findings',[])))" 2>/dev/null)
CRITICAL=$(python3 -c "import json;d=json.load(open('$RESULT_FILE'));print(len([f for f in d.get('findings',[]) if f.get('severity')=='critical']))" 2>/dev/null)
HIGH=$(python3 -c "import json;d=json.load(open('$RESULT_FILE'));print(len([f for f in d.get('findings',[]) if f.get('severity')=='high']))" 2>/dev/null)
MEDIUM=$(python3 -c "import json;d=json.load(open('$RESULT_FILE'));print(len([f for f in d.get('findings',[]) if f.get('severity')=='medium']))" 2>/dev/null)
CHAIN_COUNT=$(python3 -c "import json;print(len(json.load(open('$RESULT_FILE')).get('exploitChains',[]) or []))" 2>/dev/null)
GENEALOGY_COUNT=$(python3 -c "import json;d=json.load(open('$RESULT_FILE'));print(len(d.get('genealogy',{}).get('families',[]) if d.get('genealogy') else []))" 2>/dev/null)
ADVERSARY_COUNT=$(python3 -c "import json;print(len(json.load(open('$RESULT_FILE')).get('adversaryProfile',[]) or []))" 2>/dev/null)
HAS_CHEAPEST_CUT=$(python3 -c "import json;d=json.load(open('$RESULT_FILE'));print('yes' if d.get('cheapestCut') else 'no')" 2>/dev/null)
HAS_VALIDATION=$(python3 -c "import json;d=json.load(open('$RESULT_FILE'));print('yes' if d.get('validation') else 'no')" 2>/dev/null)

echo "  Total findings:        $FINDING_COUNT"
echo "  Critical:              $CRITICAL"
echo "  High:                  $HIGH"
echo "  Medium:                $MEDIUM"
echo "  Exploit chains:        $CHAIN_COUNT"
echo "  Vuln families:         $GENEALOGY_COUNT"
echo "  Adversary personas:    $ADVERSARY_COUNT"
echo "  Cheapest Cut found:    $HAS_CHEAPEST_CUT"
echo "  Validation present:    $HAS_VALIDATION"
echo

# 7. Fetch PDF
echo "→ Downloading PDF…"
PDF_OUT="/tmp/speedyturtle-test-${SCAN_ID}.pdf"
if curl -s -o "$PDF_OUT" -w "%{http_code}" "$BASE/api/pdf/$SCAN_ID" | grep -q "200"; then
  PDF_SIZE=$(wc -c < "$PDF_OUT" | tr -d ' ')
  echo "  ✓ PDF saved: $PDF_OUT ($PDF_SIZE bytes)"
else
  echo "  ✗ PDF generation failed"
  exit 1
fi
echo

# 8. Print verdict
echo "═══════════════════════════════════════════════════════════════"
echo " VERDICT"
echo "═══════════════════════════════════════════════════════════════"

PASS=true
[ "$FINDING_COUNT" -gt 0 ] || { echo " ✗ Zero findings (scanners may have failed)"; PASS=false; }
[ "$ADVERSARY_COUNT" -gt 0 ] || { echo " ✗ Adversary profile empty"; PASS=false; }
[ "$HAS_VALIDATION" = "yes" ] || { echo " ✗ Validation missing"; PASS=false; }

if [ "$PASS" = "true" ]; then
  echo " ✓ All pipeline stages produced output"
  echo " ✓ Scan flow works end-to-end"
  echo
  echo " View result: $BASE/scan/$SCAN_ID"
  echo " PDF:         $PDF_OUT"
  exit 0
else
  echo
  echo " Test FAILED. Inspect $RESULT_FILE for diagnosis."
  exit 1
fi
