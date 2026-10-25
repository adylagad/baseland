import AppIntents
import SwiftUI
import WidgetKit

/// Control Center button that stops every running Play.
struct KillSwitchControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "com.adylagad.baseland.killswitch") {
            ControlWidgetButton(action: KillAllIntent()) {
                Label("Stop all Plays", systemImage: "stop.circle.fill")
            }
        }
        .displayName("Stop all Plays")
        .description("Stops every running Baseland Play.")
    }
}
