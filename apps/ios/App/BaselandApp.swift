import SwiftUI

@main
struct BaselandApp: App {
    @State private var activities = LiveActivityController()

    var body: some Scene {
        WindowGroup {
            IslandLabView()
                .environment(activities)
                .task {
                    // `-demo-activity` starts the scripted GHOST Play and steps
                    // through its stages, so the Island can be screenshotted
                    // from the command line without tapping anything.
                    let args = ProcessInfo.processInfo.arguments
                    if args.contains("-demo-activity") {
                        await activities.runDemo(stepSeconds: 4)
                    } else if let i = args.firstIndex(of: "-demo-stage"), args.indices.contains(i + 1),
                              let stage = Int(args[i + 1]) {
                        // `-demo-stage N` holds the demo on one stage, for screenshots.
                        await activities.endAll()
                        await activities.step(to: stage)
                    }
                }
        }
    }
}
