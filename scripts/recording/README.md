# Recording the submission video

The three clips in the submission video were recorded by UI tests driving the
real app against the deployed engine (`apps/ios/UITests/FinalRecordingTests.swift`),
with these scripts starting and stopping the simulator recording around them.
The tests mark the waits (Claude writing the Deck, deciding), and
`scripts/cut-clip.py` cuts them out.

```sh
export SIM_UDID=<iPhone 17 simulator id>   # xcrun simctl list devices; boot only this one
OUT=$(mktemp -d)
scripts/recording/run-clip1.sh "$OUT" "$OUT"         # Ghost tour (fresh session)
scripts/recording/run-clip2.sh "$OUT" "$OUT" 1       # Claude Code → the phone
scripts/recording/run-clip3.sh "$OUT" "$OUT" 1       # LIVE: real money, approves for real
```

- **Clip 3 places a real order.** Run it only with the engine's
  `LIVE_TRADING_ENABLED` on, a key connected, and the explicit go-ahead
  AGENTS.md requires. Pass `0` instead of `1` to rehearse: the test taps Skip.
- Clip 2 runs a real interactive Claude Code session under `expect` and
  records it with asciinema. It needs `claude`, `asciinema`, `agg` and
  `expect`. `scripts/compose-claude-clip.py` puts it beside the phone.
- Before clip 3, connect the key off camera. A debug build connects it from
  a file: `xcrun simctl launch $SIM_UDID com.adylagad.baseland -connect-key-file <key.json>`.
  This keeps the key off the clipboard, which the Simulator syncs with the
  Mac. Under XCUITest the same launch argument hung at launch.
- Simulator recordings have a variable frame rate and can run a few percent
  slow against the wall clock. `cut-clip.py` takes a timescale, measured as
  the recording's length over the wall time between start and stop.
