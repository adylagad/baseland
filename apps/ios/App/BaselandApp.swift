import AppIntents
import BaselandKit
import SwiftUI

@main
struct BaselandApp: App {
    @State private var model = AppModel.shared
    @State private var lab = LiveActivityController()

    init() {
        // Created here, not in a view, so App Intents run in the background
        // (Island buttons, Control Center, Siri) find a ready model.
        _ = AppModel.shared
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .environment(lab)
                .task { await launch() }
                .onOpenURL { url in
                    if let id = PlayLink.playId(from: url) { model.openPlayId = id }
                }
        }
    }

    private func launch() async {
        let args = ProcessInfo.processInfo.arguments
        // Development hooks for screenshots and tests from the command line.
        if args.contains("-demo-activity") { await lab.runDemo(stepSeconds: 4); return }
        if let i = args.firstIndex(of: "-demo-stage"), args.indices.contains(i + 1), let n = Int(args[i + 1]) {
            await lab.endAll()
            await lab.step(to: n)
            return
        }
        if args.contains("-reset-session") { await model.session.signOut() }
        await model.bootstrap()
        if args.contains("-tab-plays") { model.selectedTab = .plays }
        #if DEBUG
        // UI tests connect a Coinbase key from a file on the Mac, so the key
        // never passes through the clipboard (synced with the Mac's), the
        // screen, or a test log (XCUITest records typed text).
        if let i = args.firstIndex(of: "-connect-key-file"), args.indices.contains(i + 1),
           let json = try? String(contentsOfFile: args[i + 1], encoding: .utf8) {
            _ = await model.connectCoinbase(json: json)
        }
        #endif
        if let i = args.firstIndex(of: "-open-play"), args.indices.contains(i + 1) { model.openPlayId = args[i + 1] }
    }
}

/// "Pause everything in Baseland", plus the Shortcuts app.
struct BaselandShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: KillAllIntent(),
            phrases: ["Pause everything in \(.applicationName)", "Stop all \(.applicationName) Plays"],
            shortTitle: "Stop all Plays",
            systemImageName: "stop.circle.fill"
        )
    }
}
