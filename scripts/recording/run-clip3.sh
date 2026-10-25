#!/usr/bin/env bash
# Clip 3: connect the key and stop earlier Plays (off camera), then record the
# live clip. LIVE_APPROVE=1 approves for real; otherwise the test taps Skip.
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export ROOT
S="$1"; OUT="$2"; APPROVE="${3:-0}"
U="${SIM_UDID:?set SIM_UDID to the iPhone 17 simulator id (xcrun simctl list devices)}"
cd $ROOT/apps/ios
TEST_RUNNER_RECORD=1 TEST_RUNNER_SHOTS_DIR=$OUT TEST_RUNNER_KEY_FILE=${KEY_FILE:-$HOME/.config/baseland/cdp_api_key.json} xcodebuild test-without-building -scheme Baseland -destination "id=$U" -derivedDataPath build/dd -only-testing:BaselandUITests/FinalRecordingTests/testStopEarlierPlays > $OUT/stop.log 2>&1 || { echo "stop failed"; exit 1; }
TEST_RUNNER_RECORD=1 TEST_RUNNER_SHOTS_DIR=$OUT TEST_RUNNER_LIVE_APPROVE=$APPROVE xcodebuild test-without-building -scheme Baseland -destination "id=$U" -derivedDataPath build/dd -only-testing:BaselandUITests/FinalRecordingTests/testClip3LiveCrypto > $OUT/clip3.log 2>&1 &
t=$!
until grep -q "testClip3LiveCrypto\] start" $OUT/marks.txt 2>/dev/null; do sleep 0.3; kill -0 $t 2>/dev/null || break; done
xcrun simctl io $U recordVideo --codec=h264 --force $OUT/clip3-raw.mp4 > /dev/null 2>&1 &
rec=$!
python3 -c 'import time;print(time.time())' > $OUT/clip3-start
wait $t; status=$?
python3 -c "import time;print(time.time())" > $OUT/clip3-stop; kill -INT $rec; wait $rec
grep -E "error:|Test Case .*(passed|failed)" $OUT/clip3.log
exit $status
