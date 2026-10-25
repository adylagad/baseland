import ActivityKit
import BaselandKit
import SwiftUI
import WidgetKit

/// One Play, from Armed to Done, on the lock screen and in the Dynamic Island.
/// All views come from BaselandKit so the app's preview gallery matches.
struct PlayLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: PlayActivityAttributes.self) { context in
            LockScreenCard(attributes: context.attributes, state: context.state)
                .activityBackgroundTint(Theme.surface)
                .activitySystemActionForegroundColor(Theme.ink)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    IslandExpandedLeading(attributes: context.attributes, state: context.state)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    IslandExpandedTrailing(attributes: context.attributes, state: context.state)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    IslandExpandedBottom(attributes: context.attributes, state: context.state)
                }
            } compactLeading: {
                IslandCompactLeading(attributes: context.attributes, state: context.state)
            } compactTrailing: {
                IslandCompactTrailing(state: context.state)
            } minimal: {
                IslandMinimal(attributes: context.attributes, state: context.state)
            }
            .keylineTint(context.state.stage.color)
        }
    }
}
