#!/usr/bin/env bash
# End to end: the app mints a harness token, the Baseland MCP uses it to
# create a Ghost Play, and the app shows it (Plays list, Dynamic Island,
# "Last used"). Runs HarnessTests on the iPhone 17 simulator against the
# deployed engine, with this script as the MCP side.
#
#   scripts/harness-e2e.sh [screenshots dir]
#
# The token travels from the simulator clipboard into an env var and is never
# printed. Delete the anonymous test user afterwards (AGENTS.md).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
shots="${1:-$(mktemp -d)}"
mkdir -p "$shots"
dest='platform=iOS Simulator,name=iPhone 17'

pnpm --dir "$root" --filter @baseland/mcp build >/dev/null
cd "$root/apps/ios"
xcodegen >/dev/null
xcodebuild build-for-testing -scheme Baseland -destination "$dest" -derivedDataPath build/dd -quiet
xcrun simctl pbcopy booted </dev/null 2>/dev/null || true

TEST_RUNNER_HARNESS=1 TEST_RUNNER_SHOTS_DIR="$shots" xcodebuild test-without-building -scheme Baseland \
  -destination "$dest" -derivedDataPath build/dd -only-testing:BaselandUITests/HarnessTests >"$shots/xcodebuild.log" 2>&1 &
test_pid=$!

clip=""
for _ in $(seq 1 120); do
  clip="$(xcrun simctl pbpaste booted 2>/dev/null || true)"
  [[ "$clip" == "pnpm connect-claude bl_"* ]] && break
  sleep 2
done
if [[ "$clip" != "pnpm connect-claude bl_"* ]]; then
  echo "The app never copied a command; see $shots/xcodebuild.log" >&2
  wait "$test_pid" || true
  exit 1
fi

cartridge='{"version":1,"title":"From Claude Code","sentence":[{"kind":"text","text":"Buy "},{"kind":"chip","id":"amount","field":"action.quoteUsd","label":"$2"},{"kind":"text","text":" of ETH now."}],"window":{"lastsMin":30},"trigger":{"kind":"time","afterMin":0},"action":{"side":"BUY","product":"ETH-USDC","quoteUsd":2},"leash":{"maxOrderUsd":2,"maxPlayUsd":2}}'
BASELAND_TOKEN="${clip#pnpm connect-claude }" node "$root/packages/mcp/scripts/drive.mjs" whoami "create_play={\"cartridge\":$cartridge}"

if wait "$test_pid"; then
  echo "HarnessTests passed. Screenshots: $shots"
else
  echo "HarnessTests failed; see $shots/xcodebuild.log" >&2
  exit 1
fi
