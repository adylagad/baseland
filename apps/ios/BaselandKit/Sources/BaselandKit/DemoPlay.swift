import Foundation

/// A scripted Play used by the Island preview gallery and the `-demo-activity`
/// launch argument. Always GHOST: it is never a real trade.
public enum DemoPlay {
    public static let attributes = PlayActivityAttributes(
        playId: "demo",
        title: "ETH breakout",
        symbol: "ETH",
        isGhost: true
    )

    public static func script(endsAt: Date) -> [PlayState] {
        [
            PlayState(stage: .armed, headline: "Opens at the next 5-minute candle.", price: 2353.57, progress: 0, endsAt: endsAt),
            PlayState(stage: .watching, headline: "Watching for $2,400 on rising volume.", price: 2371.20, progress: 0.42, endsAt: endsAt),
            PlayState(stage: .watching, headline: "$12 from the trigger. Volume 1.4× average.", price: 2388.05, progress: 0.81, endsAt: endsAt),
            PlayState(stage: .deciding, headline: "Trigger hit. Buying news + flows evidence ($0.03)…", price: 2401.10, progress: 1, endsAt: endsAt),
            PlayState(stage: .awaiting, headline: "Breakout confirmed on volume; funding neutral. Buy $3 of ETH?", price: 2402.75, progress: 1, pendingAmountUSD: 3, endsAt: endsAt),
            PlayState(stage: .executing, headline: "Previewed, inside the Leash. Placing order…", price: 2403.00, progress: 1, endsAt: endsAt),
            PlayState(stage: .done, headline: "Bought 0.00125 ETH. Took profit at +4%.", price: 2499.12, progress: 1, pnlUSD: 0.12, endsAt: endsAt),
        ]
    }
}
