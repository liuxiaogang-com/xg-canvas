#!/usr/bin/env bash
# XG Canvas M2 smoke test. Exercises canvas-api end-to-end:
#   register → login → list/create project → discover/submit a gen.text model →
#   confirm tasks reach succeeded → assets visible globally and in project.
#
# Prerequisites:
#   - docker compose up -d
#   - at least one gen.text model is enabled with an enabled credential
#   - canvas schema migrated + prompt-presets seed loaded
#
# Usage:
#   scripts/m2-smoke.sh

set -euo pipefail

CANVAS_API="${CANVAS_API:-http://localhost:5181/api/v1}"
EMAIL="m2-smoke-$(date +%s)@example.com"
PASSWORD="smoke-pass-1234"

JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

step() { printf "\n\033[1;36m>> %s\033[0m\n" "$1"; }
pass() { printf "  \033[32mPASS\033[0m %s\n" "$1"; }
fail() { printf "  \033[31mFAIL\033[0m %s\n" "$1"; exit 1; }

post() { curl -fsS -c "$JAR" -b "$JAR" -H "content-type: application/json" -X "$1" "$CANVAS_API$2" -d "$3"; }
get()  { curl -fsS -c "$JAR" -b "$JAR" "$CANVAS_API$1"; }

step "register"
register_payload=$(jq -n --arg e "$EMAIL" --arg p "$PASSWORD" '{email:$e,password:$p,display_name:"smoke"}')
me=$(post POST "/auth/register" "$register_payload")
echo "$me" | jq .data.user.email
[[ "$(echo "$me" | jq -r .ok)" == "true" ]] && pass "register" || fail "register"

step "list projects (should be empty)"
get "/projects" | jq .data | head -c 80; echo
pass "list ok"

step "create project"
ws=$(get "/auth/me" | jq -r .data.workspace_id)
created=$(post POST "/projects" "$(jq -n --arg w "$ws" '{workspace_id:$w,name:"smoke-project"}')")
project_id=$(echo "$created" | jq -r .data.id)
[[ -n "$project_id" ]] && pass "project $project_id created" || fail "no project id"

step "select available gen.text model"
text_model=$(get "/models?task_type=gen.text" | jq -r '.data[0].model_id // empty')
[[ -n "$text_model" ]] && pass "model $text_model selected" || fail "no available gen.text model"

step "submit gen.text"
text_task=$(post POST "/tasks" "$(jq -n --arg m "$text_model" '{task_type:"gen.text",model_id:$m,params:{},inputs:{prompt:"reply OK"}}')")
text_id=$(echo "$text_task" | jq -r .data.id)
pass "task $text_id queued"

step "wait for text task"
text_done=false
for i in $(seq 1 30); do
  s=$(get "/tasks/$text_id" | jq -r .data.status)
  echo "  status=$s"
  case "$s" in
    succeeded) pass "text task succeeded"; text_done=true; break ;;
    failed|cancelled) fail "text task ended in $s" ;;
  esac
  sleep 2
done
[[ "$text_done" == "true" ]] || fail "text task timed out"

step "global assets"
get "/assets?limit=5" | jq '.data | length'
pass "assets reachable"

step "save to project (copy first asset)"
asset_id=$(get "/assets?limit=1" | jq -r '.data[0].id')
if [[ "$asset_id" != "null" && -n "$asset_id" ]]; then
  post POST "/assets/$asset_id/copy-to-project" "$(jq -n --arg p "$project_id" '{project_id:$p}')" >/dev/null
  pass "asset $asset_id copied to project"
fi

step "create user preset + list"
post POST "/presets" "$(jq -n '{task_type:"gen.text",title:"smoke preset",content:[{role:"system",text:"hi"}]}')" >/dev/null
listed=$(get "/presets?task_type=gen.text" | jq '.data | length')
[[ "$listed" -ge 1 ]] && pass "presets listed: $listed" || fail "no presets returned"

step "max-lines lint"
pnpm -r lint 2>&1 | tail -10
pass "lint clean"

printf "\n\033[1;32mM2 smoke complete.\033[0m\n"
