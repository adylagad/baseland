import ActivityKit
import Foundation

/// The Live Activity for one Play. Static attributes never change for the
/// life of the activity; `ContentState` is what Realtime updates push in.
public struct PlayActivityAttributes: ActivityAttributes, Sendable {
    public struct ContentState: Codable, Hashable, Sendable {
        public var stage: PlayStage
        /// The agent's latest one-line reasoning, or what it is waiting for.
        public var headline: String
        public var price: Double?
        /// 0...1, how close the trigger is.
        public var progress: Double
        public var pnlUSD: Double?
        /// Set while `stage == .awaiting`: the order the user is asked to approve.
        public var pendingAmountUSD: Double?
        public var endsAt: Date

        public init(
            stage: PlayStage,
            headline: String,
            price: Double? = nil,
            progress: Double = 0,
            pnlUSD: Double? = nil,
            pendingAmountUSD: Double? = nil,
            endsAt: Date
        ) {
            self.stage = stage
            self.headline = headline
            self.price = price
            self.progress = min(max(progress, 0), 1)
            self.pnlUSD = pnlUSD
            self.pendingAmountUSD = pendingAmountUSD
            self.endsAt = endsAt
        }
    }

    public var playId: String
    public var title: String
    /// Short asset symbol shown in the compact Island, e.g. "ETH".
    public var symbol: String
    /// Sponsor rule: simulated Plays are labeled GHOST on every surface.
    public var isGhost: Bool

    public init(playId: String, title: String, symbol: String, isGhost: Bool) {
        self.playId = playId
        self.title = title
        self.symbol = symbol
        self.isGhost = isGhost
    }
}
