#!/usr/bin/env bash
# Wrap a command with ANTHROPIC_AUTH_TOKEN pulled from the macOS keychain
# entry that the `claude` CLI writes when you run `claude /login` against
# a Pro/Max subscription. Inspect AI (and the Anthropic Python SDK with the
# `oauth-2025-04-20` beta header) accepts this token in lieu of an API key,
# which means scans + the CTI-REALM benchmark can run against your
# subscription instead of paid-per-call API access.
#
# Usage:
#   ./scripts/with-claude-oauth.sh <command> [args...]
#
# Examples:
#   ./scripts/with-claude-oauth.sh ./scripts/run-cti-realm.py --smoke --no-sandbox
#   ./scripts/with-claude-oauth.sh ./scripts/run-cti-realm.py --task cti_realm_25_minimal --limit 5

set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "with-claude-oauth.sh: keychain extraction is macOS-only." >&2
  echo "On Linux, run \`claude setup-token\` and export the result as ANTHROPIC_AUTH_TOKEN." >&2
  exit 2
fi

if ! command -v security >/dev/null 2>&1; then
  echo "with-claude-oauth.sh: \`security\` command not found." >&2
  exit 2
fi

# This will trigger a keychain access prompt the first time per session.
RAW="$(security find-generic-password -w -s 'Claude Code-credentials' 2>/dev/null || true)"
if [[ -z "$RAW" ]]; then
  echo "with-claude-oauth.sh: no 'Claude Code-credentials' entry found in keychain." >&2
  echo "Run \`claude /login\` first." >&2
  exit 2
fi

TOKEN="$(printf '%s' "$RAW" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d["claudeAiOauth"]["accessToken"])')"
if [[ -z "$TOKEN" ]]; then
  echo "with-claude-oauth.sh: failed to extract accessToken from keychain payload." >&2
  exit 2
fi

# Drop API key so inspect-ai picks the OAuth path.
unset ANTHROPIC_API_KEY
export ANTHROPIC_AUTH_TOKEN="$TOKEN"
exec "$@"
