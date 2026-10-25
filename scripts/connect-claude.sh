#!/usr/bin/env bash
# Connects Claude Code to Baseland: builds the MCP server, registers it for
# your user, and installs the Baseland skill.
#
#   pnpm connect-claude bl_...   # paired: Plays appear on your phone
#   pnpm connect-claude          # anonymous Ghost account, no phone needed
#
# The token comes from the app: Rig → Account → Claude Code. Claude Code keeps
# it in ~/.claude.json; `claude mcp remove baseland -s user` forgets it.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
token="${1:-}"

if [[ -n "$token" && "$token" != bl_* ]]; then
  echo "That doesn't look like a Baseland token (they start with bl_)." >&2
  exit 1
fi
command -v claude >/dev/null || { echo "Claude Code (the claude command) isn't installed." >&2; exit 1; }

echo "Building the Baseland MCP server…"
pnpm --dir "$root" --filter @baseland/mcp build >/dev/null

claude mcp remove baseland -s user >/dev/null 2>&1 || true
env_args=()
[[ -n "$token" ]] && env_args=(-e "BASELAND_TOKEN=$token")
claude mcp add baseland -s user "${env_args[@]}" -- node "$root/packages/mcp/dist/index.js" >/dev/null

mkdir -p "$HOME/.claude/skills/baseland"
cp "$root/packages/mcp/skill/baseland/SKILL.md" "$HOME/.claude/skills/baseland/SKILL.md"

if [[ -n "$token" ]]; then
  echo "Connected: Claude Code now creates GHOST Plays on your phone's Island."
else
  echo "Connected with a private anonymous Ghost account (no phone)."
fi
echo "Restart Claude Code, then try: \"Draft a Play: if ETH drops 2% today, buy \$5. Replay it first.\""
