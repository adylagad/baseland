# ios

The Baseland iPhone app: SwiftUI, a Live Activity for each running Play, and
(soon) App Intents for approving from the Dynamic Island.

## Layout

| Path | What |
| --- | --- |
| `project.yml` | XcodeGen spec. **Edit this, never the generated `.xcodeproj`** (gitignored). |
| `App/` | The app target |
| `Widgets/` | Widget extension: the Play Live Activity (lock screen + Dynamic Island) |
| `BaselandKit/` | Swift package shared by both: `PlayStage`, `PlayActivityAttributes`, `Theme` tokens, and the Island views themselves |
| `Shared/` | App Intents (Approve / Skip / Pause / Stop all), compiled into the app **and** the widget. They are `LiveActivityIntent`s, so they always run in the app's process |
| `App/Services/` | Engine API, Supabase sign-in + Realtime, Live Activity sync, the background keep-alive, voice |
| `App/Views/` | Onboarding, the Deck, the chip editor, Plays, a Play's page and its Tape, the Rig, Replay, Settings |
| `UITests/` | End-to-end UI tests against the deployed engine (Ghost only) |

The Island views live in BaselandKit so the app's **Island Lab** (Settings →
Island Lab) can render the exact UI the widget shows. `AppModel` is the
single source of truth; the app talks to the engine (`BaselandEngineURL` in
`project.yml`) and to Supabase for sign-in and Realtime.

## Build and run

```sh
cd apps/ios
xcodegen
xcodebuild -scheme Baseland -destination 'platform=iOS Simulator,name=iPhone 17' \
  -derivedDataPath build/dd build
xcrun simctl install booted build/dd/Build/Products/Debug-iphonesimulator/Baseland.app
xcrun simctl launch booted com.adylagad.baseland -demo-activity
```

Launch arguments:

- `-demo-activity` starts the scripted GHOST demo Play and steps through every
  stage every 4 seconds. Open another app to see it in the Dynamic Island.
- `-demo-stage N` holds the demo on stage N (0 = armed … 6 = done), for
  screenshots.

- `-reset-session` signs out first (used by the UI tests).
- `-tab-plays`, `-open-play <id>` jump to a screen.
- `-BaselandEngineURL http://localhost:8787` points the app at a local engine.

UI tests (real engine, Ghost only; screenshots to a folder). `BaselandFlowTests`,
`IslandApprovalTests` and `RigTests` run on the iPhone 17; run
`LockScreenApprovalTests` on the iPhone 16e (no Dynamic Island). Add
`TEST_RUNNER_APPEARANCE=dark` to run `RigTests` in dark mode:

```sh
TEST_RUNNER_SHOTS_DIR=/tmp/shots xcodebuild test -scheme Baseland \
  -destination 'platform=iOS Simulator,name=iPhone 17' -derivedDataPath build/dd
```

Kit tests (Swift Testing, run on the simulator because ActivityKit is iOS-only):

```sh
cd apps/ios/BaselandKit
xcodebuild -scheme BaselandKit -destination 'platform=iOS Simulator,name=iPhone 17' test
```

On a real iPhone with a free Apple ID: see `docs/personal-guide/iphone.md`.
