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

The Island views live in BaselandKit so the app's **Island Lab** can render
the exact UI the widget shows.

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

Kit tests (Swift Testing, run on the simulator because ActivityKit is iOS-only):

```sh
cd apps/ios/BaselandKit
xcodebuild -scheme BaselandKit -destination 'platform=iOS Simulator,name=iPhone 17' test
```

On a real iPhone with a free Apple ID: see `docs/personal-guide/iphone.md`.
