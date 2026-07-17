#!/usr/bin/env bash
# XG Canvas M4 smoke — script extraction → storyboard → batch regenerate.
#
# Prerequisites:
#   - account-api + canvas-api up
#   - canvas schema migrated (M2) + entities table populated
#   - script-extract Feature Config bound to a currently available gen.text model

set -euo pipefail

CANVAS_API="${CANVAS_API:-http://localhost:5181/api/v1}"
EMAIL="${EMAIL:-m4-$(date +%s)@example.com}"
PASSWORD="${PASSWORD:-smoke-pass-1234}"

JAR="$(mktemp)"; trap 'rm -f "$JAR"' EXIT

step() { printf "\n\033[1;36m>> %s\033[0m\n" "$1"; }
pass() { printf "  \033[32mPASS\033[0m %s\n" "$1"; }
fail() { printf "  \033[31mFAIL\033[0m %s\n" "$1"; exit 1; }

post() { curl -fsS -c "$JAR" -b "$JAR" -H "content-type: application/json" -X "$1" "$CANVAS_API$2" -d "$3"; }
get()  { curl -fsS -c "$JAR" -b "$JAR" "$CANVAS_API$1"; }

SAMPLE_SCRIPT="夜晚, 废弃工厂. 林深(男, 30岁, 神情冷峻)推开锈蚀的大门, 手上攥着一把旧钥匙. 突然身后传来脚步声, 苏雨(女, 25岁, 一身风衣)从阴影里走出: '你来晚了.' 林深盯着她: '钥匙在你这里?' 苏雨抬手, 一只青铜匣子在月光下泛着冷光."

step "register + project"
post POST "/auth/register" "$(jq -n --arg e "$EMAIL" --arg p "$PASSWORD" '{email:$e,password:$p,display_name:"m4"}')" >/dev/null
ws=$(get "/auth/me" | jq -r .data.workspace_id)
project_id=$(post POST "/projects" "$(jq -n --arg w "$ws" '{workspace_id:$w,name:"m4-storyboard"}')" | jq -r .data.id)
pass "project $project_id"

step "create script_input node + paste sample"
script_node=$(post POST "/projects/$project_id/canvas/nodes" "$(jq -n --arg t "$SAMPLE_SCRIPT" '{type:"script_input",position:{x:0,y:0},data:{raw_text:$t,optimized_text:"",model_id:null}}')" | jq -r .data.id)
pass "script node $script_node"

step "extract characters"
post POST "/script/extract-characters" "$(jq -n --arg p "$project_id" --arg n "$script_node" --arg t "$SAMPLE_SCRIPT" '{project_id:$p,script_node_id:$n,raw_text:$t}')" | jq .data
pass "characters extracted"

step "extract scenes"
post POST "/script/extract-scenes" "$(jq -n --arg p "$project_id" --arg n "$script_node" --arg t "$SAMPLE_SCRIPT" '{project_id:$p,script_node_id:$n,raw_text:$t}')" | jq .data
pass "scenes extracted"

step "extract props"
post POST "/script/extract-props" "$(jq -n --arg p "$project_id" --arg n "$script_node" --arg t "$SAMPLE_SCRIPT" '{project_id:$p,script_node_id:$n,raw_text:$t}')" | jq .data
pass "props extracted"

step "generate storyboard (depends on extracted entities)"
post POST "/script/generate-storyboard" "$(jq -n --arg p "$project_id" --arg n "$script_node" --arg t "$SAMPLE_SCRIPT" '{project_id:$p,script_node_id:$n,raw_text:$t}')" | jq .data
shots=$(get "/projects/$project_id/canvas" | jq '[.data.nodes[] | select(.type=="storyboard_shot")] | length')
[[ "$shots" -ge 4 ]] && pass "got $shots storyboard shots" || fail "expected >=4 shots, got $shots"

step "edges connecting characters/scene to first shot"
edges=$(get "/projects/$project_id/canvas" | jq '[.data.edges[] | select(.target_handle | IN("characters","scene","props"))] | length')
[[ "$edges" -ge 1 ]] && pass "got $edges entity_ref edges" || echo "  warn: 0 entity_ref edges (LLM may have skipped name matches)"

step "patch a shot via PATCH /nodes/:id (table-view simulator)"
shot_id=$(get "/projects/$project_id/canvas" | jq -r '[.data.nodes[] | select(.type=="storyboard_shot")][0].id')
curl -fsS -c "$JAR" -b "$JAR" -H "content-type: application/json" -X PATCH "$CANVAS_API/projects/$project_id/canvas/nodes/$shot_id" -d '{"data":{"prompt":"换成更冷的色调"}}' >/dev/null
pass "shot $shot_id patched"

step "queue endpoint reachable"
get "/tasks?project_id=$project_id&limit=5" | jq '.data | length' >/dev/null
pass "queue endpoint ok"

printf "\n\033[1;32mM4 smoke complete (API path).\033[0m\n"
echo "Browser checks (manual):"
echo "  1. /projects/$project_id/canvas — pick the script_input node, bottom pill shows 提取角色 / 提取场景 / 生成分镜"
echo "  2. switch view to 分镜表 — rows visible, edit prompt in-place persists"
echo "  3. multi-select rows + 批量重生成 — task list bumps in 队列 view"
echo "  4. Drop a grid node, drag cells around — order persists across reload"
