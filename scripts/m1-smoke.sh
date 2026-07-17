#!/usr/bin/env bash
# Current monolith smoke test. It verifies setup state, password authentication,
# session cookies, and the authenticated model-list API.
#
# Prerequisites:
#   - docker compose up -d (use API_V1=http://localhost:5180/api/v1)
#     or docker compose -f docker-compose.dev.yml up (default API_V1)
#   - jq and curl
#   - SMOKE_EMAIL and SMOKE_PASSWORD for an existing account
#
# For a brand-new disposable instance only, set SMOKE_ALLOW_SETUP=1. The script
# will create the initial administrator before testing the normal login path.
#
# Usage:
#   SMOKE_EMAIL=admin@example.com SMOKE_PASSWORD='replace-me-123' scripts/m1-smoke.sh

set -euo pipefail

API_V1="${API_V1:-http://localhost:5181/api/v1}"
SMOKE_EMAIL="${SMOKE_EMAIL:-}"
SMOKE_PASSWORD="${SMOKE_PASSWORD:-}"
SMOKE_DISPLAY_NAME="${SMOKE_DISPLAY_NAME:-Smoke Admin}"
SMOKE_ALLOW_SETUP="${SMOKE_ALLOW_SETUP:-0}"
COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

step() { printf "\n\033[1;36m>> %s\033[0m\n" "$1"; }
pass() { printf "  \033[32mPASS\033[0m %s\n" "$1"; }
fail() { printf "  \033[31mFAIL\033[0m %s\n" "$1"; exit 1; }

command -v curl >/dev/null || fail "curl is required"
command -v jq >/dev/null || fail "jq is required"
[[ -n "$SMOKE_EMAIL" ]] || fail "SMOKE_EMAIL is required"
[[ -n "$SMOKE_PASSWORD" ]] || fail "SMOKE_PASSWORD is required"
SMOKE_EXPECTED_EMAIL=$(printf '%s' "$SMOKE_EMAIL" \
  | tr '[:upper:]' '[:lower:]' \
  | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
[[ -n "$SMOKE_EXPECTED_EMAIL" ]] || fail "SMOKE_EMAIL is empty after normalization"

post_json() {
  curl -fsS -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
    -H "content-type: application/json" -X POST "$API_V1$1" -d "$2"
}

step "GET /setup/status"
setup_status=$(curl -fsS "$API_V1/setup/status") || fail "canvas-api unreachable"
setup_required=$(echo "$setup_status" | jq -r \
  'if (.data.required | type) == "boolean" then .data.required else error("missing boolean data.required") end') \
  || fail "unexpected setup status response"
pass "setup status reachable"

if [[ "$setup_required" == "true" ]]; then
  [[ "$SMOKE_ALLOW_SETUP" == "1" ]] || fail "instance requires setup; use SMOKE_ALLOW_SETUP=1 only for a disposable fresh instance"
  [[ ${#SMOKE_PASSWORD} -ge 12 ]] || fail "initial administrator password must contain at least 12 characters"
  [[ ${#SMOKE_DISPLAY_NAME} -ge 2 ]] || fail "SMOKE_DISPLAY_NAME must contain at least 2 characters"

  step "POST /setup/complete"
  setup_payload=$(jq -n \
    --arg email "$SMOKE_EMAIL" \
    --arg password "$SMOKE_PASSWORD" \
    --arg displayName "$SMOKE_DISPLAY_NAME" \
    '{email:$email,password:$password,display_name:$displayName}')
  setup_result=$(post_json "/setup/complete" "$setup_payload") || fail "initial setup failed"
  echo "$setup_result" | jq -e --arg email "$SMOKE_EXPECTED_EMAIL" \
    '.ok == true and .data.user.email == $email' >/dev/null || fail "unexpected setup response"
  pass "initial administrator created"
fi

step "POST /auth/login"
rm -f "$COOKIE_JAR"
login_payload=$(jq -n --arg email "$SMOKE_EMAIL" --arg password "$SMOKE_PASSWORD" \
  '{email:$email,password:$password}')
login=$(post_json "/auth/login" "$login_payload") || fail "password login failed"
echo "$login" | jq -e --arg email "$SMOKE_EXPECTED_EMAIL" \
  '.ok == true and .data.user.email == $email' >/dev/null || fail "unexpected login response"
pass "password login succeeded"

step "GET /auth/me"
me=$(curl -fsS -b "$COOKIE_JAR" "$API_V1/auth/me") || fail "auth/me failed"
echo "$me" | jq -e --arg email "$SMOKE_EXPECTED_EMAIL" \
  '.ok == true and .data.user_id != null and .data.email == $email' >/dev/null || fail "unexpected auth/me response"
pass "session cookie is valid"

step "GET /models"
models=$(curl -fsS -b "$COOKIE_JAR" "$API_V1/models") || fail "models list failed"
echo "$models" | jq -e '.ok == true and (.data | type == "array")' >/dev/null || fail "unexpected models response"
pass "model list endpoint reachable"

printf "\n\033[1;32mSmoke complete.\033[0m\n"
