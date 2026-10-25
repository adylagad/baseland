import BaselandKit
import SwiftUI

/// Edits the one value a chip points at. Pickers and sliders only: no text
/// boxes, in keeping with "cards and chips are the only input primitives".
struct ChipEditor: View {
    let part: SentencePart
    let cartridge: JSONValue
    let apply: (String, JSONValue) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var number: Double = 0
    @State private var minutes: Int = 60
    @State private var symbol = "ETH"

    private var field: String { part.field ?? "" }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                Text(title).font(Theme.label(17, weight: .semibold)).foregroundStyle(Theme.ink)
                Spacer()
                Button("Done") { commit() }.buttonStyle(.glassProminent)
            }
            editor
            Spacer(minLength: 0)
        }
        .padding(22)
        .onAppear(perform: load)
    }

    @ViewBuilder private var editor: some View {
        switch kind {
        case .amount:
            bigValue(Format.usd(number))
            Slider(value: $number, in: 1...25, step: 1)
            presets([2, 5, 10, 25].map { (Format.usd($0), $0) })
        case .percent(let range):
            bigValue("\(number.formatted(.number.precision(.fractionLength(0...1))))%")
            Slider(value: $number, in: range, step: 0.5)
            presets([1, 2, 3, 5].filter { range.contains($0) }.map { ("\(Int($0))%", $0) })
        case .price(let around):
            bigValue(Format.usd(number))
            Slider(value: $number, in: (around * 0.9)...(around * 1.1), step: max(0.01, (around * 0.001).rounded(toPlaces: 2)))
            HStack {
                Text(Format.usd(around * 0.9)).font(Theme.money(11)).foregroundStyle(Theme.inkMuted)
                Spacer()
                Text(Format.usd(around * 1.1)).font(Theme.money(11)).foregroundStyle(Theme.inkMuted)
            }
        case .duration:
            bigValue(durationLabel(minutes))
            let options = [15, 30, 60, 180, 360, 720, 1440]
            FlowLayout(spacing: 8, lineSpacing: 8) {
                ForEach(options, id: \.self) { m in
                    Button(durationLabel(m)) { minutes = m }
                        .buttonStyle(.bordered)
                        .tint(m == minutes ? Theme.Stage.watching : Theme.inkMuted)
                        .font(Theme.money(14, weight: .semibold))
                }
            }
        case .asset:
            FlowLayout(spacing: 8, lineSpacing: 8) {
                ForEach(["BTC", "ETH", "SOL", "XRP", "DOGE", "LINK", "AVAX", "ADA"], id: \.self) { s in
                    Button(s) { symbol = s }
                        .buttonStyle(.bordered)
                        .tint(s == symbol ? Theme.Stage.watching : Theme.inkMuted)
                        .font(Theme.money(15, weight: .bold))
                }
            }
        case .readOnly:
            Text("This part of the Play can't be changed here.").font(Theme.label(14)).foregroundStyle(Theme.inkMuted)
        }
    }

    // MARK: Kinds

    private enum Kind { case amount, percent(ClosedRange<Double>), price(Double), duration, asset, readOnly }

    private var kind: Kind {
        switch field {
        case "action.quoteUsd": .amount
        case "trigger.pct": .percent(0.5...20)
        case "exit.takeProfitPct": .percent(0.5...30)
        case "exit.stopLossPct": .percent(0.5...20)
        case "trigger.price": .price(cartridge[path: field]?.double ?? 1)
        case "window.lastsMin", "window.startsInMin", "trigger.afterMin": .duration
        case "trigger.product", "action.product": .asset
        default: .readOnly
        }
    }

    private var title: String {
        switch field {
        case "action.quoteUsd": "How much"
        case "trigger.pct": "How big a move"
        case "exit.takeProfitPct": "Take profit at"
        case "exit.stopLossPct": "Stop loss at"
        case "trigger.price": "Price level"
        case "window.lastsMin": "How long it stays open"
        case "window.startsInMin": "When it starts"
        case "trigger.afterMin": "When to act"
        case "trigger.product", "action.product": "Which asset"
        default: part.label ?? "Value"
        }
    }

    private func load() {
        number = cartridge[path: field]?.double ?? 0
        minutes = Int(cartridge[path: field]?.double ?? 60)
        symbol = PlayKind.symbol(cartridge)
    }

    private func commit() {
        switch kind {
        case .amount, .percent, .price: apply(field, .number(number))
        case .duration: apply(field, .number(Double(minutes)))
        case .asset:
            // One asset for the whole Play: trigger, action and Leash move together.
            let product = JSONValue.string("\(symbol)-USDC")
            if cartridge[path: "trigger.product"] != nil { apply("trigger.product", product) }
            apply("action.product", product)
            apply("leash.allowedProducts", .array([product]))
        case .readOnly: break
        }
        dismiss()
    }

    // MARK: Pieces

    private func bigValue(_ text: String) -> some View {
        Text(text)
            .font(Theme.money(40, weight: .bold))
            .foregroundStyle(Theme.ink)
            .contentTransition(.numericText())
            .animation(.snappy, value: text)
    }

    private func presets(_ items: [(String, Double)]) -> some View {
        HStack(spacing: 8) {
            ForEach(items, id: \.1) { label, value in
                Button(label) { number = value }
                    .buttonStyle(.bordered)
                    .tint(value == number ? Theme.Stage.watching : Theme.inkMuted)
                    .font(Theme.money(14, weight: .semibold))
            }
        }
    }

    private func durationLabel(_ m: Int) -> String {
        if m < 60 { return "\(m)m" }
        if m % 1440 == 0 { return "\(m / 1440)d" }
        return m % 60 == 0 ? "\(m / 60)h" : "\(m / 60)h \(m % 60)m"
    }
}

private extension Double {
    func rounded(toPlaces p: Int) -> Double {
        let m = pow(10, Double(p))
        return (self * m).rounded() / m
    }
}
