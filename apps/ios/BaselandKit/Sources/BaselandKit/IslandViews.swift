import SwiftUI

// Every view a Play's Live Activity shows, in one place. The widget extension
// composes them into ActivityConfiguration; the app renders the same views in
// its Island preview gallery, so design review never drifts from the real thing.
// The Dynamic Island is always black, so Island views use white ink.

public typealias PlayState = PlayActivityAttributes.ContentState

// MARK: - Atoms

public struct StageDot: View {
    let stage: PlayStage
    let isGhost: Bool
    var size: CGFloat = 8

    public init(stage: PlayStage, isGhost: Bool, size: CGFloat = 8) {
        self.stage = stage
        self.isGhost = isGhost
        self.size = size
    }

    public var body: some View {
        Circle()
            .fill(stage.color)
            .frame(width: size, height: size)
            .padding(isGhost ? 2.5 : 0)
            .overlay {
                if isGhost {
                    // A ghost Play's dot is ringed in a dashed lavender line.
                    Circle().strokeBorder(Theme.ghost, style: StrokeStyle(lineWidth: 1.2, dash: [2, 1.6]))
                }
            }
            .accessibilityLabel(isGhost ? "\(stage.label), simulated" : stage.label)
    }
}

/// The GHOST label. Dashed, lavender, monospaced: unmistakable by design.
public struct GhostBadge: View {
    var compact: Bool

    public init(compact: Bool = false) { self.compact = compact }

    public var body: some View {
        Text("GHOST")
            .font(Theme.money(compact ? 9 : 10, weight: .bold))
            .tracking(1.2)
            .foregroundStyle(Theme.ghost)
            .padding(.horizontal, compact ? 5 : 7)
            .padding(.vertical, compact ? 1.5 : 3)
            .overlay(Capsule().strokeBorder(Theme.ghost, style: StrokeStyle(lineWidth: 1, dash: [3, 2])))
            .accessibilityLabel("Simulated")
    }
}

public struct ProgressTrack: View {
    let progress: Double
    let color: Color
    var track: Color = .white.opacity(0.14)

    public init(progress: Double, color: Color, track: Color = .white.opacity(0.14)) {
        self.progress = progress
        self.color = color
        self.track = track
    }

    public var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(track)
                Capsule().fill(color).frame(width: max(4, geo.size.width * progress))
            }
        }
        .frame(height: 4)
        .accessibilityValue("\(Int(progress * 100)) percent to trigger")
    }
}

// MARK: - Dynamic Island: compact and minimal

public struct IslandCompactLeading: View {
    let attributes: PlayActivityAttributes
    let state: PlayState

    public init(attributes: PlayActivityAttributes, state: PlayState) {
        self.attributes = attributes
        self.state = state
    }

    public var body: some View {
        HStack(spacing: 5) {
            StageDot(stage: state.stage, isGhost: attributes.isGhost)
            Text(attributes.symbol)
                .font(Theme.money(13, weight: .bold))
                .foregroundStyle(.white)
        }
    }
}

public struct IslandCompactTrailing: View {
    let state: PlayState

    public init(state: PlayState) { self.state = state }

    public var body: some View {
        Group {
            switch state.stage {
            case .awaiting:
                Text(state.pendingAmountUSD.map { Format.usd($0) + "?" } ?? "Ask")
                    .foregroundStyle(state.stage.color)
            case .deciding:
                Image(systemName: "sparkles").foregroundStyle(state.stage.color)
                    .accessibilityLabel("Deciding")
            case .armed, .watching, .paused:
                // Sized for "5:59:58" in 12pt mono; narrower truncates to "5:59:…".
                Text(timerInterval: Date.now...max(state.endsAt, .now), countsDown: true)
                    .font(Theme.money(12, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.85))
                    .multilineTextAlignment(.trailing)
                    .frame(width: 58, alignment: .trailing)
            case .executing:
                Image(systemName: "arrow.triangle.2.circlepath").foregroundStyle(state.stage.color)
                    .accessibilityLabel("Executing")
            case .done:
                Text(state.pnlUSD.map { Format.usd($0, signed: true) } ?? "Done")
                    .foregroundStyle((state.pnlUSD ?? 0) >= 0 ? Theme.Stage.done : Theme.Stage.stopped)
            case .killed, .expired, .failed:
                Text(state.stage.label).foregroundStyle(state.stage.color)
            }
        }
        .font(Theme.money(13, weight: .semibold))
        .monospacedDigit()
        .lineLimit(1)
    }
}

/// Shown when another app's activity shares the Island: a ring that fills
/// toward the trigger, in the stage color.
public struct IslandMinimal: View {
    let attributes: PlayActivityAttributes
    let state: PlayState

    public init(attributes: PlayActivityAttributes, state: PlayState) {
        self.attributes = attributes
        self.state = state
    }

    public var body: some View {
        ZStack {
            Circle().stroke(.white.opacity(0.18), lineWidth: 2.5)
            Circle()
                .trim(from: 0, to: state.stage == .awaiting ? 1 : max(0.04, state.progress))
                .stroke(state.stage.color, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Circle().fill(attributes.isGhost ? Theme.ghost : state.stage.color).frame(width: 5, height: 5)
        }
        .frame(width: 20, height: 20)
    }
}

// MARK: - Dynamic Island: expanded regions

public struct IslandExpandedLeading: View {
    let attributes: PlayActivityAttributes
    let state: PlayState

    public init(attributes: PlayActivityAttributes, state: PlayState) {
        self.attributes = attributes
        self.state = state
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 5) {
                StageDot(stage: state.stage, isGhost: attributes.isGhost, size: 7)
                Text(state.stage.label.uppercased())
                    .font(Theme.money(10, weight: .bold))
                    .tracking(0.8)
                    .foregroundStyle(state.stage.color)
            }
            Text(attributes.title)
                .font(Theme.label(15, weight: .semibold))
                .foregroundStyle(.white)
                .lineLimit(1)
        }
        .padding(.leading, 4)
    }
}

public struct IslandExpandedTrailing: View {
    let attributes: PlayActivityAttributes
    let state: PlayState

    public init(attributes: PlayActivityAttributes, state: PlayState) {
        self.attributes = attributes
        self.state = state
    }

    public var body: some View {
        VStack(alignment: .trailing, spacing: 4) {
            if attributes.isGhost { GhostBadge(compact: true) }
            if let price = state.price {
                Text(Format.price(price))
                    .font(Theme.money(15, weight: .semibold))
                    .foregroundStyle(.white)
                    .monospacedDigit()
            }
        }
        .padding(.trailing, 4)
    }
}

public struct IslandExpandedBottom<Actions: View>: View {
    let attributes: PlayActivityAttributes
    let state: PlayState
    let actions: Actions

    public init(
        attributes: PlayActivityAttributes,
        state: PlayState,
        @ViewBuilder actions: () -> Actions
    ) {
        self.attributes = attributes
        self.state = state
        self.actions = actions()
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text(state.headline)
                .font(Theme.label(13))
                .foregroundStyle(.white.opacity(0.82))
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
            if !state.stage.isTerminal && state.stage != .awaiting {
                ProgressTrack(progress: state.progress, color: state.stage.color)
            }
            actions
        }
        .padding(.horizontal, 4)
    }
}

extension IslandExpandedBottom where Actions == EmptyView {
    public init(attributes: PlayActivityAttributes, state: PlayState) {
        self.init(attributes: attributes, state: state) { EmptyView() }
    }
}

// MARK: - Lock screen

public struct LockScreenCard<Actions: View>: View {
    let attributes: PlayActivityAttributes
    let state: PlayState
    let actions: Actions

    public init(
        attributes: PlayActivityAttributes,
        state: PlayState,
        @ViewBuilder actions: () -> Actions
    ) {
        self.attributes = attributes
        self.state = state
        self.actions = actions()
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                StageDot(stage: state.stage, isGhost: attributes.isGhost)
                Text(state.stage.label.uppercased())
                    .font(Theme.money(11, weight: .bold))
                    .tracking(0.8)
                    .foregroundStyle(state.stage.color)
                if attributes.isGhost { GhostBadge(compact: true) }
                Spacer()
                if let price = state.price {
                    Text("\(attributes.symbol) \(Format.price(price))")
                        .font(Theme.money(13))
                        .foregroundStyle(Theme.inkSoft)
                        .monospacedDigit()
                }
            }
            Text(attributes.title)
                .font(Theme.label(17, weight: .semibold))
                .foregroundStyle(Theme.ink)
            Text(state.headline)
                .font(Theme.label(14))
                .foregroundStyle(Theme.inkSoft)
                .lineLimit(2)
            if !state.stage.isTerminal && state.stage != .awaiting {
                HStack(spacing: 10) {
                    ProgressTrack(progress: state.progress, color: state.stage.color, track: Theme.line)
                    Text(timerInterval: Date.now...max(state.endsAt, .now), countsDown: true)
                        .font(Theme.money(12, weight: .medium))
                        .foregroundStyle(Theme.inkMuted)
                        .monospacedDigit()
                        .frame(width: 58, alignment: .trailing)
                }
            }
            actions
        }
        .padding(16)
        .overlay {
            if attributes.isGhost {
                RoundedRectangle(cornerRadius: 18)
                    .strokeBorder(Theme.ghost.opacity(0.9), style: StrokeStyle(lineWidth: 1.5, dash: [6, 4]))
                    .padding(3)
            }
        }
    }
}

extension LockScreenCard where Actions == EmptyView {
    public init(attributes: PlayActivityAttributes, state: PlayState) {
        self.init(attributes: attributes, state: state) { EmptyView() }
    }
}
