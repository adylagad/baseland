import AppIntents
import Foundation

// The actions a person can take without opening Baseland: from the Dynamic
// Island, the lock screen, Control Center and Siri. This file is compiled into
// the app *and* the widget extension. Every intent is a LiveActivityIntent,
// which iOS always runs in the app's process (launching it in the background
// if needed), so they can use the app's signed-in session. No App Group is
// needed, which matters with a free Apple ID.

enum PlayCommand: String, Sendable {
    case approve, skip, pause, killAll
}

enum PlayIntentError: Error, CustomLocalizedStringResourceConvertible {
    case notReady

    var localizedStringResource: LocalizedStringResource {
        "Open Baseland once, then try again."
    }
}

/// Set by the app at launch; the widget extension never sets it.
@MainActor
enum IntentBridge {
    static var handler: (@MainActor (PlayCommand, String?) async throws -> Void)?

    static func run(_ command: PlayCommand, _ playId: String?) async throws {
        guard let handler else { throw PlayIntentError.notReady }
        try await handler(command, playId)
    }
}

struct ApprovePlayIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Approve Play"
    static let isDiscoverable = false

    @Parameter(title: "Play") var playId: String

    init() {}
    init(playId: String) { self.playId = playId }

    func perform() async throws -> some IntentResult {
        try await IntentBridge.run(.approve, playId)
        return .result()
    }
}

struct SkipPlayIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Skip Play"
    static let isDiscoverable = false

    @Parameter(title: "Play") var playId: String

    init() {}
    init(playId: String) { self.playId = playId }

    func perform() async throws -> some IntentResult {
        try await IntentBridge.run(.skip, playId)
        return .result()
    }
}

struct PausePlayIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Pause Play"
    static let isDiscoverable = false

    @Parameter(title: "Play") var playId: String

    init() {}
    init(playId: String) { self.playId = playId }

    func perform() async throws -> some IntentResult {
        try await IntentBridge.run(.pause, playId)
        return .result()
    }
}

/// The kill switch: Control Center, Siri ("Pause everything in Baseland"),
/// Shortcuts, and the app's own button.
struct KillAllIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Stop all Plays"
    static let description = IntentDescription("Stops every running Baseland Play at once.")

    init() {}

    func perform() async throws -> some IntentResult & ProvidesDialog {
        try await IntentBridge.run(.killAll, nil)
        return .result(dialog: "Stopped every running Play.")
    }
}
