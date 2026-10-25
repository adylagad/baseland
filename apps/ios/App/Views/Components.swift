import BaselandKit
import SwiftUI

// MARK: - Contour motif

/// The "land" in Baseland: faint contour lines, tightening toward a point.
/// Decorative only; never carries information.
struct ContourBackground: View {
    var focus: UnitPoint = .init(x: 0.85, y: 0.12)
    var tightness: Double = 0

    var body: some View {
        Canvas { ctx, size in
            let center = CGPoint(x: size.width * focus.x, y: size.height * focus.y)
            let rings = 16
            for i in 1...rings {
                let base = CGFloat(i) * (34 - 12 * tightness)
                var path = Path()
                let steps = 90
                for s in 0...steps {
                    let a = Double(s) / Double(steps) * 2 * .pi
                    let wobble = 1 + 0.06 * sin(a * 3 + Double(i) * 0.7) + 0.035 * sin(a * 5 - Double(i))
                    let p = CGPoint(x: center.x + cos(a) * base * wobble * 1.25, y: center.y + sin(a) * base * wobble)
                    s == 0 ? path.move(to: p) : path.addLine(to: p)
                }
                ctx.stroke(path, with: .color(Theme.line.opacity(i.isMultiple(of: 4) ? 0.9 : 0.5)), lineWidth: i.isMultiple(of: 4) ? 1 : 0.6)
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

// MARK: - Chips and sentences

/// A tappable chip: the only way to change a Play's numbers.
struct Chip: View {
    let label: String
    var editable = true
    var action: () -> Void = {}

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(Theme.money(16, weight: .semibold))
                .foregroundStyle(Theme.ink)
                .padding(.horizontal, 9)
                .padding(.vertical, 3)
                .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Theme.Stage.watching.opacity(0.12)))
                .overlay(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .strokeBorder(Theme.Stage.watching.opacity(editable ? 0.45 : 0.15), style: StrokeStyle(lineWidth: 1, dash: editable ? [] : [2, 2]))
                )
        }
        .buttonStyle(.plain)
        .disabled(!editable)
        .accessibilityHint(editable ? "Change this value" : "")
        .accessibilityIdentifier("chip")
    }
}

/// A Play's sentence: words wrap naturally around chips.
struct ChipSentence: View {
    let parts: [SentencePart]
    var size: CGFloat = 19
    var editable = true
    var onChip: (SentencePart) -> Void = { _ in }

    var body: some View {
        FlowLayout(spacing: 4, lineSpacing: 7) {
            ForEach(Array(tokens.enumerated()), id: \.offset) { _, token in
                switch token {
                case .word(let w):
                    Text(w).font(Theme.label(size, weight: .regular)).foregroundStyle(Theme.ink)
                case .chip(let part, let trailing):
                    // Punctuation right after a chip stays glued to it.
                    HStack(spacing: 1) {
                        Chip(label: part.label ?? "?", editable: editable) { onChip(part) }
                        if !trailing.isEmpty {
                            Text(trailing).font(Theme.label(size, weight: .regular)).foregroundStyle(Theme.ink)
                        }
                    }
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    private enum Token { case word(String), chip(SentencePart, String) }

    private static let punctuation = Set(".,!?;:")

    private var tokens: [Token] {
        var out: [Token] = []
        for part in parts {
            if part.isChip { out.append(.chip(part, "")); continue }
            var text = part.text ?? ""
            // Leading punctuation belongs to whatever came before it.
            let lead = String(text.prefix { Self.punctuation.contains($0) })
            if !lead.isEmpty, let last = out.last {
                switch last {
                case .chip(let chip, let trailing): out[out.count - 1] = .chip(chip, trailing + lead)
                case .word(let w): out[out.count - 1] = .word(w + lead)
                }
                text.removeFirst(lead.count)
            }
            for word in text.split(separator: " ", omittingEmptySubsequences: true) {
                out.append(.word(String(word)))
            }
        }
        return out
    }
}

/// Lays children out left to right, wrapping to new lines.
struct FlowLayout: Layout {
    var spacing: CGFloat = 4
    var lineSpacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(subviews, width: proposal.width ?? .infinity)
        let height = rows.reduce(0) { $0 + $1.height } + CGFloat(max(0, rows.count - 1)) * lineSpacing
        let width = rows.map(\.width).max() ?? 0
        return CGSize(width: proposal.width ?? width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in arrange(subviews, width: bounds.width) {
            var x = bounds.minX
            for i in row.items {
                let size = subviews[i].sizeThatFits(.unspecified)
                subviews[i].place(at: CGPoint(x: x, y: y + (row.height - size.height) / 2), proposal: .unspecified)
                x += size.width + spacing
            }
            y += row.height + lineSpacing
        }
    }

    private struct Row { var items: [Int] = []; var width: CGFloat = 0; var height: CGFloat = 0 }

    private func arrange(_ subviews: Subviews, width: CGFloat) -> [Row] {
        var rows: [Row] = [Row()]
        for i in subviews.indices {
            let size = subviews[i].sizeThatFits(.unspecified)
            let needed = rows[rows.count - 1].items.isEmpty ? size.width : rows[rows.count - 1].width + spacing + size.width
            if needed > width, !rows[rows.count - 1].items.isEmpty {
                rows.append(Row())
            }
            var row = rows[rows.count - 1]
            row.width = row.items.isEmpty ? size.width : row.width + spacing + size.width
            row.height = max(row.height, size.height)
            row.items.append(i)
            rows[rows.count - 1] = row
        }
        return rows
    }
}

// MARK: - Small pieces

struct StagePill: View {
    let stage: PlayStage
    var ghost = false

    var body: some View {
        HStack(spacing: 6) {
            StageDot(stage: stage, isGhost: ghost, size: 7)
            Text(stage.label.uppercased())
                .font(Theme.money(11, weight: .bold))
                .tracking(0.8)
                .foregroundStyle(stage.color)
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 5)
        .background(Capsule().fill(stage.color.opacity(0.12)))
    }
}

struct MoneyLabel: View {
    let value: Double
    var signed = false
    var size: CGFloat = 15

    var body: some View {
        Text(Format.usd(value, signed: signed))
            .font(Theme.money(size, weight: .semibold))
            .monospacedDigit()
            .foregroundStyle(signed ? (value >= 0 ? Theme.Stage.done : Theme.Stage.stopped) : Theme.ink)
    }
}

/// Short label for what kind of Play a cartridge is.
enum PlayKind {
    static func label(_ cartridge: JSONValue) -> String {
        switch cartridge[path: "trigger.kind"]?.string {
        case "price_cross": cartridge[path: "trigger.direction"]?.string == "below" ? "Drop" : "Breakout"
        case "pct_move":
            switch cartridge[path: "trigger.direction"]?.string {
            case "down": "Dip"
            case "up": "Jump"
            default: "Move"
            }
        default: (cartridge[path: "trigger.afterMin"]?.double ?? 0) == 0 ? "Now" : "Timed"
        }
    }

    static func symbol(_ cartridge: JSONValue) -> String {
        cartridge[path: "action.product"]?.string?.split(separator: "-").first.map(String.init) ?? "?"
    }
}

struct ToastView: View {
    let toast: AppModel.Toast

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: toast.isError ? "exclamationmark.circle.fill" : "checkmark.circle.fill")
                .foregroundStyle(toast.isError ? Theme.Stage.stopped : Theme.Stage.done)
            Text(toast.text).font(Theme.label(14, weight: .medium)).foregroundStyle(Theme.ink)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .glassEffect(.regular, in: Capsule())
        .padding(.horizontal, 20)
    }
}
