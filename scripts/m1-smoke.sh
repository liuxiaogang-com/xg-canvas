#!/usr/bin/env bash
# Current monolith smoke test. It checks the public health endpoint and the
# authenticated API surface that replaced the old account-api/internal route.
#
# Prerequisites:
#   - docker compose up -d
#   - database migrations + seed data applied
#
# Usage:
#   scripts/m1-smoke.sh

set -euo pipefail

API="${API:-http://localhost:5181}"
COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

step() { printf "\n\033[1;36m>> %s\033[0m\n" "$1"; }
pass() { printf "  \033[32mPASS\033[0m %s\n" "$1"; }
fail() { printf "  \033[31mFAIL\033[0m %s\n" "$1"; exit 1; }

step "GET /health"
health=$(curl -fsS "${API}/health") || fail "canvas-api unreachable"
echo "$health" | grep -q '"status"' && pass "canvas-api up" || fail "unexpected health response"

step "POST /api/v1/auth/dev-login"
login=$(curl -fsS -c "$COOKIE_JAR" -X POST "${API}/api/v1/auth/dev-login") || fail "dev-login failed"
echo "$login" | grep -q '"user"' && pass "logged in" || fail "unexpected login response"

step "GET /api/v1/auth/me"
me=$(curl -fsS -b "$COOKIE_JAR" "${API}/api/v1/auth/me") || fail "auth/me failed"
echo "$me" | grep -q '"id"' && pass "session valid" || fail "unexpected auth/me response"

step "GET /api/v1/models"
models=$(curl -fsS -b "$COOKIE_JAR" "${API}/api/v1/models") || fail "models list failed"
echo "$models" | head -c 300; echo
echo "$models" | grep -q '\[' && pass "model list endpoint reachable" || fail "unexpected models response"

printf "\n\033[1;32mSmoke complete.\033[0m\n"
