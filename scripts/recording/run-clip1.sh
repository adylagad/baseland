#!/usr/bin/env bash
# Clip 1 (Ghost tour) from a fresh session, recorded.
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export ROOT
S="$1"; OUT="$2"
U="${SIM_UDID:?set SIM_UDID to the iPhone 17 simulator id (xcrun simctl list devices)}"
cd $ROOT/apps/ios
TEST_RUNNER_RECORD=1 TEST_RUNNER_SHOTS_DIR=$OUT xcodebuild test-without-building -scheme Baseland -destination "id=$U" -derivedDataPath build/dd -only-testing:BaselandUITests/FinalRecordingTests/testClip1GhostTour > $OUT/clip1.log 2>&1 &
t=$!
until grep -q "testClip1GhostTour\] start" $OUT/marks.txt 2>/dev/null; do sleep 0.3; kill -0 $t 2>/dev/null || break; done
xcrun simctl io $U recordVideo --codec=h264 --force $OUT/clip1-raw.mp4 > /dev/null 2>&1 &
rec=$!
python3 -c 'import time;print(time.time())' > $OUT/clip1-start
wait $t; status=$?
kill -INT $rec; wait $rec
grep -E "error:|Test Case .*(passed|failed)" $OUT/clip1.log
exit $status
