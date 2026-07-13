#!/usr/bin/env bash
# XG Canvas M3 smoke test — exercises the canvas API only.
# UI flows (drag, click, agent panel) need a browser; see step 2 below.
#
# Prerequisites:
#   - account-api + canvas-api up
#   - canvas schema migrated (M2) — canvas tables exist
#   - a registered user; pass EMAIL/PASSWORD via env

set -euo pipefail

CANVAS_API="${CANVAS_API:-http://localhost:5181/api/v1}"
EMAIL="${EMAIL:-m3-$(date +%s)@example.com}"
PASSWORD="${PASSWORD:-smoke-pass-1234}"

JAR="$(mktemp)"; trap 'rm -f "$JAR"' EXIT

step() { printf "\n\033[1;36m>> %s\033[0m\n" "$1"; }
pass() { printf "  \033[32mPASS\033[0m %s\n" "$1"; }
fail() { printf "  \033[31mFAIL\033[0m %s\n" "$1"; exit 1; }

post() { curl -fsS -c "$JAR" -b "$JAR" -H "content-type: application/json" -X "$1" "$CANVAS_API$2" -d "$3"; }
get()  { curl -fsS -c "$JAR" -b "$JAR" "$CANVAS_API$1"; }
del()  { curl -fsS -c "$JAR" -b "$JAR" -X DELETE "$CANVAS_API$1"; }

step "register + create project"
post POST "/auth/register" "$(jq -n --arg e "$EMAIL" --arg p "$PASSWORD" '{email:$e,password:$p,display_name:"m3"}')" >/dev/null
ws=$(get "/auth/me" | jq -r .data.workspace_id)
project_id=$(post POST "/projects" "$(jq -n --arg w "$ws" '{workspace_id:$w,name:"m3-canvas"}')" | jq -r .data.id)
pass "project $project_id"

step "GET full canvas (auto-creates)"
get "/projects/$project_id/canvas" | jq '.data.canvas.id' | head -c 80; echo
pass "canvas auto-created"

step "create gen_image node"
node1=$(post POST "/projects/$project_id/canvas/nodes" '{"type":"gen_image","position":{"x":100,"y":100},"data":{"prompt":"废弃工厂场景","model_id":null,"aspect_ratio":"16:9","resolution":"1k"}}' | jq -r .data.id)
pass "node $node1"

step "create gen_text node"
node2=$(post POST "/projects/$project_id/canvas/nodes" '{"type":"gen_text","position":{"x":-200,"y":80},"data":{"prompt":"写一句开场白","model_id":null,"temperature":0.7,"max_tokens":200}}' | jq -r .data.id)
pass "node $node2"

step "valid edge gen_text.out -> gen_image.prompt"
edge=$(post POST "/projects/$project_id/canvas/edges" "$(jq -n --arg s "$node2" --arg t "$node1" '{source_node_id:$s,source_handle:"out",target_node_id:$t,target_handle:"prompt",data_type:"text"}')" | jq -r .data.id)
pass "edge $edge"

step "invalid edge image.out -> text.prompt should be rejected"
if post POST "/projects/$project_id/canvas/edges" "$(jq -n --arg s "$node1" --arg t "$node2" '{source_node_id:$s,source_handle:"out",target_node_id:$t,target_handle:"prompt",data_type:"image"}')" >/dev/null 2>&1; then
  fail "server accepted an illegal connection"
else
  pass "server rejected illegal connection"
fi

step "snapshot + restore round trip"
snap=$(post POST "/projects/$project_id/canvas/snapshots" '{}' | jq -r .data.id)
post POST "/projects/$project_id/canvas/nodes" '{"type":"gen_audio","position":{"x":0,"y":300},"data":{}}' >/dev/null
before=$(get "/projects/$project_id/canvas" | jq '.data.nodes | length')
post POST "/projects/$project_id/canvas/snapshots/$snap/restore" '{}' >/dev/null
after=$(get "/projects/$project_id/canvas" | jq '.data.nodes | length')
[[ "$after" -lt "$before" ]] && pass "restore reduced nodes from $before to $after" || fail "restore did not roll back"

step "agent message (requires gpt model + credential)"
if post POST "/agent/messages" "$(jq -n --arg p "$project_id" '{project_id:$p,message:"把光线调暗"}')" >/dev/null 2>&1; then
  pass "agent endpoint reachable"
else
  echo "  (skipped — no LLM credential configured)"
fi

step "cleanup"
del "/projects/$project_id" >/dev/null
pass "project removed"

printf "\n\033[1;32mM3 smoke complete (API path).\033[0m\n"
echo "Browser checks (manual):"
echo "  1. /projects/$project_id/canvas — drag to add nodes via LeftDock +"
echo "  2. select a node — bottom pill switches to its actions"
echo "  3. agent panel: '把光线调暗一点' — expects assistant patch + apply"
echo "  4. switch to list view — same nodes appear in grid + table"
echo "  5. reload — viewport + nodes survive"
