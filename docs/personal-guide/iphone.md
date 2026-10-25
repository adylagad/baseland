# Run on your iPhone (free Apple ID)

No paid developer account is needed to run on your own phone. The limits are
that the install expires after **7 days** and there is no push (APNs) or
TestFlight.

You need an iPhone **with a Dynamic Island** (iPhone 14 Pro or later, any
iPhone 15 or newer) on **iOS 18 or later**. iOS 18 is the minimum for the
Control Center kill switch.

## Once

1. Xcode → Settings → **Accounts** → **+** → Apple ID → sign in. A "Personal
   Team" appears.
2. iPhone: Settings → Privacy & Security → **Developer Mode** → on, then
   restart.
3. Connect the phone by cable (or the same Wi-Fi after the first pairing) and
   trust the computer.

## Each build

1. `cd apps/ios && xcodegen` (Claude does this), then open
   `Baseland.xcodeproj`.
2. For both the **Baseland** and **BaselandWidgets** targets: Signing &
   Capabilities → Team → your Personal Team. If the bundle identifier is
   taken, change the prefix. Claude keeps them in `project.yml`.
3. Pick your iPhone as the run destination → **Run**.
4. First launch only: iPhone Settings → General → **VPN & Device Management**
   → trust your developer certificate.
5. Settings → Baseland → make sure **Live Activities** is on.
