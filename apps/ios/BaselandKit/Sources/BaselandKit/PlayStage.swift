import SwiftUI

/// The lifecycle of a Play. Mirrors `plays.state` in the database; the raw
/// values must match it exactly.
public enum PlayStage: String, Codable, Hashable, CaseIterable, Sendable {
    case armed, watching, deciding, awaiting, executing, done, paused, killed, expired, failed

    public var label: String {
        switch self {
        case .armed: "Armed"
        case .watching: "Watching"
        case .deciding: "Deciding"
        case .awaiting: "Your call"
        case .executing: "Executing"
        case .done: "Done"
        case .paused: "Paused"
        case .killed: "Stopped"
        case .expired: "Expired"
        case .failed: "Failed"
        }
    }

    /// The only strong color on any surface is the stage's.
    public var color: Color {
        switch self {
        case .armed, .paused: Theme.Stage.idle
        case .watching, .executing: Theme.Stage.watching
        case .deciding: Theme.Stage.deciding
        case .awaiting: Theme.Stage.awaiting
        case .done: Theme.Stage.done
        case .killed, .failed: Theme.Stage.stopped
        case .expired: Theme.Stage.expired
        }
    }

    public var isTerminal: Bool {
        switch self {
        case .done, .killed, .expired, .failed: true
        default: false
        }
    }

    /// Stages where something is happening right now; the stage dot pulses.
    public var isActive: Bool { self == .deciding || self == .executing }
}
