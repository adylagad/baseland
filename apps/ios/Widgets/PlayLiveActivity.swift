import ActivityKit
import AppIntents
import BaselandKit
import SwiftUI
import WidgetKit

/// One Play, from Armed to Done, on the lock screen and in the Dynamic Island.
/// All views come from BaselandKit so the app's preview gallery matches.
struct PlayLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: PlayActivityAttributes.self) { context in
            LockScreenCard(attributes: context.attributes, state: context.state) {
                PlayActions(attributes: context.attributes, state: context.state, onIsland: false)
            }
            .activityBackgroundTint(Theme.surface)
            .activitySystemActionForegroundColor(Theme.ink)
            .widgetURL(PlayLink.url(context.attributes.playId))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    IslandExpandedLeading(attributes: context.attributes, state: context.state)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    IslandExpandedTrailing(attributes: context.attributes, state: context.state)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    IslandExpandedBottom(attributes: context.attributes, state: context.state) {
                        PlayActions(attributes: context.attributes, state: context.state, onIsland: true)
                    }
                }
            } compactLeading: {
                IslandCompactLeading(attributes: context.attributes, state: context.state)
            } compactTrailing: {
                IslandCompactTrailing(state: context.state)
            } minimal: {
                IslandMinimal(attributes: context.attributes, state: context.state)
            }
            .keylineTint(context.state.stage.color)
            .widgetURL(PlayLink.url(context.attributes.playId))
        }
    }
}

/// Approve / Skip when the Play is asking, Pause while it watches. Orders
/// above the Island limit open the app instead, where Face ID is required.
private struct PlayActions: View {
    let attributes: PlayActivityAttributes
    let state: PlayState
    let onIsland: Bool

    var body: some View {
        switch state.stage {
        case .awaiting:
            if (state.pendingAmountUSD ?? .infinity) <= IslandLimits.approvalUSD {
                HStack(spacing: 8) {
                    Button(intent: SkipPlayIntent(playId: attributes.playId)) {
                        Text("Skip").frame(maxWidth: .infinity)
                    }
                    .tint(onIsland ? .white.opacity(0.25) : Theme.inkMuted)
                    Button(intent: ApprovePlayIntent(playId: attributes.playId)) {
                        Text(approveLabel).frame(maxWidth: .infinity)
                    }
                    .tint(PlayStage.awaiting.color)
                }
                .buttonStyle(.borderedProminent)
                .font(Theme.label(14, weight: .semibold))
            } else {
                Link(destination: PlayLink.url(attributes.playId)) {
                    Label("Open Baseland to approve", systemImage: "faceid")
                        .font(Theme.label(13, weight: .semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(Capsule().fill(PlayStage.awaiting.color.opacity(0.25)))
                }
                .foregroundStyle(onIsland ? .white : Theme.ink)
            }
        case .watching, .armed:
            HStack {
                Spacer()
                Button(intent: PausePlayIntent(playId: attributes.playId)) {
                    Label("Pause", systemImage: "pause.fill").font(Theme.label(12, weight: .medium))
                }
                .buttonStyle(.bordered)
                .tint(onIsland ? .white.opacity(0.6) : Theme.inkMuted)
            }
        default:
            EmptyView()
        }
    }

    // The GHOST badge sits just above the buttons; repeating it here wrapped
    // the label onto two lines in the Island.
    private var approveLabel: String {
        guard let amount = state.pendingAmountUSD else { return "Approve" }
        let text = amount.rounded() == amount ? "$\(Int(amount))" : Format.usd(amount)
        return "Approve \(text)"
    }
}
