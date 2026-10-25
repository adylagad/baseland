import BaselandKit
import SwiftUI

/// Phase 0 development screen: renders every Island presentation for every
/// stage of the demo Play, and drives a real Live Activity through them.
/// Replaced by the Play Deck in Phase 3.
struct IslandLabView: View {
    @Environment(LiveActivityController.self) private var activities
    private let script = DemoPlay.script(endsAt: .now.addingTimeInterval(6 * 3600))

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    controls
                    ForEach(Array(script.enumerated()), id: \.offset) { index, state in
                        StagePreview(index: index, state: state, isLive: activities.stepIndex == index && activities.currentID != nil)
                    }
                }
                .padding(16)
            }
            .background(Theme.paper)
            .navigationTitle("Island Lab")
        }
    }

    private var controls: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                GhostBadge()
                Text("Demo Play · simulated")
                    .font(Theme.label(13))
                    .foregroundStyle(Theme.inkMuted)
            }
            HStack(spacing: 10) {
                Button("Run demo") { Task { await activities.runDemo(stepSeconds: 3) } }
                    .buttonStyle(.borderedProminent)
                Button("End") { Task { await activities.endAll() } }
                    .buttonStyle(.bordered)
            }
            if !activities.areActivitiesEnabled {
                Text("Live Activities are off for Baseland in Settings.")
                    .font(Theme.label(13))
                    .foregroundStyle(Theme.Stage.stopped)
            }
            if let error = activities.lastError {
                Text(error).font(Theme.money(12)).foregroundStyle(Theme.Stage.stopped)
            }
        }
    }
}

/// Approximations of the Island shapes, filled with the real Island views.
private struct StagePreview: View {
    let index: Int
    let state: PlayState
    let isLive: Bool
    @Environment(LiveActivityController.self) private var activities

    private let attributes = DemoPlay.attributes

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("\(index + 1). \(state.stage.label)")
                    .font(Theme.label(15, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                if isLive {
                    Text("LIVE").font(Theme.money(10, weight: .bold)).foregroundStyle(state.stage.color)
                }
                Spacer()
                Button("Show") { Task { await activities.step(to: index) } }
                    .font(Theme.label(13))
            }

            // Compact
            HStack {
                IslandCompactLeading(attributes: attributes, state: state)
                Spacer(minLength: 120)
                IslandCompactTrailing(state: state)
            }
            .padding(.horizontal, 14)
            .frame(height: 37)
            .background(Capsule().fill(.black))

            // Expanded
            VStack(spacing: 10) {
                HStack(alignment: .top) {
                    IslandExpandedLeading(attributes: attributes, state: state)
                    Spacer()
                    IslandExpandedTrailing(attributes: attributes, state: state)
                }
                IslandExpandedBottom(attributes: attributes, state: state)
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 16)
            .background(RoundedRectangle(cornerRadius: 40, style: .continuous).fill(.black))

            // Lock screen
            LockScreenCard(attributes: attributes, state: state)
                .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(Theme.surface))

            HStack {
                IslandMinimal(attributes: attributes, state: state)
                    .padding(8)
                    .background(Circle().fill(.black))
                Text("minimal").font(Theme.money(11)).foregroundStyle(Theme.inkMuted)
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Theme.surface2))
    }
}
