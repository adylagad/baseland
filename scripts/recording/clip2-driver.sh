#!/usr/bin/env bash
# Clip 2 driver: reads the paired command from the simulator clipboard (never
# printed), runs Claude Code under asciinema, flags the iOS test when the Play
# is armed, then lets Claude finish its answer and exits.
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export ROOT
set -uo pipefail
S="$1"; OUT="$2"; PROMPT="$3"
clip="$(cat "$OUT/.paired" 2>/dev/null || true)"
rm -f "$OUT/.paired"
[[ "$clip" == "pnpm connect-claude bl_"* ]] || { echo "no paired command was captured"; exit 1; }
export BASELAND_TOKEN="${clip#pnpm connect-claude }"
# A throwaway Claude Code project with the Baseland skill in it.
P=$S/cc-project
mkdir -p $P/.claude/skills/baseland && cp $ROOT/packages/mcp/skill/baseland/SKILL.md $P/.claude/skills/baseland/
python3 - "$P/mcp.json" <<'PY'
import json, sys, os
json.dump({"mcpServers": {"baseland": {"command": "node", "args": [os.environ["ROOT"] + "/packages/mcp/dist/index.js"], "env": {"BASELAND_TOKEN": os.environ["BASELAND_TOKEN"]}}}}, open(sys.argv[1], "w"))
PY
chmod 600 $P/mcp.json
rm -f "$OUT/clip2-armed" "$OUT/clip2-done" "$OUT/clip2-term-end"
count() { node $ROOT/packages/mcp/scripts/drive.mjs 'list_plays={"include_finished":true}' 2>/dev/null | grep -c "(id " ; }
before=$(count)
( cd $P && asciinema rec --headless --overwrite --window-size 104x34 --idle-time-limit 600 -c "expect $ROOT/scripts/recording/claude-session.exp '$PROMPT' $OUT/clip2-armed $OUT/clip2-term-end" $OUT/clip2.cast ) &
rec=$!
python3 -c 'import time;print(time.time())' > $OUT/clip2-term-start
for i in $(seq 1 300); do
  now=$(count); [ "$now" -gt "$before" ] && break; sleep 2
done
date +%s > "$OUT/clip2-armed"
echo "armed after ${i} polls"
wait $rec
touch "$OUT/clip2-done"
rm -f $P/mcp.json
