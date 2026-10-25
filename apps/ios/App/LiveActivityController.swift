import ActivityKit
import BaselandKit
import Foundation
import Observation

/// Starts, updates and ends Play Live Activities. Updates are local: there is
/// no APNs without a paid developer account (see docs/ARCHITECTURE.md), so
/// the app pushes new content itself while it is alive.
@MainActor
@Observable
final class LiveActivityController {
    /// The id of the running activity. Only the id is held, never the
    /// `Activity` itself: it is not Sendable, so Swift 6 rejects passing it
    /// out of the main actor (see docs/code-traps.md).
    private(set) var currentID: String?
    private(set) var lastError: String?
    private(set) var stepIndex = 0

    var areActivitiesEnabled: Bool { ActivityAuthorizationInfo().areActivitiesEnabled }

    func start(_ attributes: PlayActivityAttributes, state: PlayState) {
        do {
            currentID = try Activity.request(
                attributes: attributes,
                content: ActivityContent(state: state, staleDate: state.endsAt),
                pushType: nil
            ).id
            lastError = nil
        } catch {
            lastError = error.localizedDescription
        }
    }

    func update(_ state: PlayState) async {
        guard let id = currentID else { return }
        await Self.push(state, to: id)
    }

    func endAll() async {
        await Self.endEverything()
        currentID = nil
        stepIndex = 0
    }

    private nonisolated static func push(_ state: PlayState, to id: String) async {
        for activity in Activity<PlayActivityAttributes>.activities where activity.id == id {
            await activity.update(ActivityContent(state: state, staleDate: state.endsAt))
        }
    }

    private nonisolated static func endEverything() async {
        for activity in Activity<PlayActivityAttributes>.activities {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
    }

    /// Plays the scripted demo through every stage, then leaves it on Done.
    func runDemo(stepSeconds: UInt64) async {
        await endAll()
        let script = DemoPlay.script(endsAt: .now.addingTimeInterval(6 * 3600))
        guard let first = script.first else { return }
        start(DemoPlay.attributes, state: first)
        for (i, state) in script.enumerated().dropFirst() {
            try? await Task.sleep(nanoseconds: stepSeconds * 1_000_000_000)
            stepIndex = i
            await update(state)
        }
    }

    func step(to index: Int) async {
        let script = DemoPlay.script(endsAt: .now.addingTimeInterval(6 * 3600))
        guard script.indices.contains(index) else { return }
        if currentID == nil { start(DemoPlay.attributes, state: script[index]) } else { await update(script[index]) }
        stepIndex = index
    }
}
