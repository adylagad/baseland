#!/usr/bin/env bash
# Pair, then run clip 2's iOS test and the Claude Code driver together.
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export ROOT
U="${SIM_UDID:?set SIM_UDID to the iPhone 17 simulator id (xcrun simctl list devices)}"
S="$1"; OUT="$2"; RECORD_SIM="${3:-0}"
cd $ROOT/apps/ios
TEST_RUNNER_RECORD=1 TEST_RUNNER_SHOTS_DIR=$OUT xcodebuild test-without-building -scheme Baseland -destination "id=$U" -derivedDataPath build/dd -only-testing:BaselandUITests/FinalRecordingTests/testPairHarness > $OUT/pair.log 2>&1 &
pair=$!
# Read the clipboard the moment the app copied the command (never printed).
until grep -q "testPairHarness\] copied" $OUT/marks.txt 2>/dev/null; do sleep 0.2; kill -0 $pair 2>/dev/null || break; done
( umask 077; xcrun simctl pbpaste $U > $OUT/.paired )
xcrun simctl pbcopy $U </dev/null
wait $pair || { echo "pairing failed"; exit 1; }
TEST_RUNNER_RECORD=1 TEST_RUNNER_SHOTS_DIR=$OUT xcodebuild test-without-building -scheme Baseland -destination "id=$U" -derivedDataPath build/dd -only-testing:BaselandUITests/FinalRecordingTests/testClip2ClaudeCodeArrives > $OUT/clip2-test.log 2>&1 &
test_pid=$!
# Wait for the test to reach its first mark, then start the simulator recording.
until grep -q "testClip2ClaudeCodeArrives\] start" $OUT/marks.txt 2>/dev/null; do sleep 0.5; done
if [ "$RECORD_SIM" = 1 ]; then
  xcrun simctl io $U recordVideo --codec=h264 --force $OUT/clip2-phone.mp4 > $OUT/rec2.log 2>&1 &
  rec=$!
  python3 -c 'import time;print(time.time())' > $OUT/clip2-phone-start
fi
"$ROOT/scripts/recording/clip2-driver.sh" "$S" "$OUT" "Use Baseland. Draft a Play: if ETH drops 1% in the next 2 hours, buy \$5 of ETH and take profit at 2%. Replay it over the last 3 days, then arm it, and tell me where I approve it."
wait $test_pid; status=$?
[ "$RECORD_SIM" = 1 ] && kill -INT $rec && wait $rec
grep -E "error:|Test Case .*(passed|failed)" $OUT/clip2-test.log
exit $status
