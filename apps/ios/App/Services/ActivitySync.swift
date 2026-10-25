import ActivityKit
import BaselandKit
import Foundation

/// Keeps one Live Activity per running Play in step with the engine. There
/// is no APNs (no paid developer account), so the app pushes each update
/// itself as Realtime delivers it; the keep-alive keeps it able to.
@MainActor
final class ActivitySync {
    /// What each activity last showed, so unchanged content isn't re-sent
    /// (iOS budgets Live Activity updates).
    private var shown: [String: PlayState] = [:]

    var enabled: Bool { ActivityAuthorizationInfo().areActivitiesEnabled }

    func sync(_ plays: [Play]) async {
        for play in plays { await sync(play) }
    }

    func sync(_ play: Play) async {
        let state = Self.content(for: play)
        if shown[play.id] == state { return }
        shown[play.id] = state
        let existing = Self.activityID(for: play.id)

        if play.state.isTerminal {
            guard let existing else { return }
            // Leave the final result on the lock screen for a few minutes.
            await Self.end(existing, with: state, after: .now.addingTimeInterval(5 * 60))
            return
        }
        if let existing {
            await Self.update(existing, with: state)
        } else if enabled {
            let attributes = PlayActivityAttributes(playId: play.id, title: play.title, symbol: play.symbol, isGhost: play.isGhost)
            _ = try? Activity.request(attributes: attributes, content: ActivityContent(state: state, staleDate: play.windowEnd), pushType: nil)
        }
    }

    func endAll() async {
        shown.removeAll()
        for activity in Activity<PlayActivityAttributes>.activities {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
    }

    static func content(for play: Play) -> PlayState {
        PlayState(
            stage: play.state,
            headline: play.headline,
            price: play.status.price,
            progress: play.status.progress ?? 0,
            pnlUSD: play.status.pnlUsd,
            pendingAmountUSD: play.state == .awaiting ? (play.pending?.estUsd ?? play.status.pendingAmountUsd) : nil,
            endsAt: play.windowEnd
        )
    }

    // Activity is not Sendable; it is only touched inside these nonisolated
    // helpers, looked up by id (docs/code-traps.md).
    private nonisolated static func activityID(for playId: String) -> String? {
        Activity<PlayActivityAttributes>.activities.first { $0.attributes.playId == playId }?.id
    }

    private nonisolated static func update(_ id: String, with state: PlayState) async {
        for a in Activity<PlayActivityAttributes>.activities where a.id == id {
            await a.update(ActivityContent(state: state, staleDate: state.endsAt))
        }
    }

    private nonisolated static func end(_ id: String, with state: PlayState, after date: Date) async {
        for a in Activity<PlayActivityAttributes>.activities where a.id == id {
            await a.end(ActivityContent(state: state, staleDate: nil), dismissalPolicy: .after(date))
        }
    }
}
