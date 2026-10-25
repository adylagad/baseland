import BaselandKit
import Charts
import SwiftUI

/// How a Play would have done over real past prices. Always GHOST.
struct ReplayView: View {
    @Environment(AppModel.self) private var model
    let title: String
    let cartridge: JSONValue
    @State private var days: Double = 1
    @State private var result: ReplayResult?
    @State private var loading = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    HStack {
                        GhostBadge()
                        Text("Replay · real prices, simulated trades").font(Theme.label(13)).foregroundStyle(Theme.inkMuted)
                    }
                    Picker("Range", selection: $days) {
                        Text("24 hours").tag(1.0)
                        Text("3 days").tag(3.0)
                        Text("7 days").tag(7.0)
                    }
                    .pickerStyle(.segmented)

                    if loading {
                        ProgressView().frame(maxWidth: .infinity, minHeight: 240)
                    } else if let r = result {
                        summary(r)
                        ReplayChart(result: r, cartridge: cartridge)
                            .frame(height: 240)
                        ForEach(r.notes, id: \.self) { note in
                            Label(note, systemImage: "info.circle").font(Theme.label(12)).foregroundStyle(Theme.inkMuted)
                        }
                    }
                }
                .padding(18)
            }
            .background(Theme.paper)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .task(id: days) { await run() }
        }
    }

    private func run() async {
        loading = true
        result = await model.replay(cartridge, days: days)
        loading = false
    }

    @ViewBuilder private func summary(_ r: ReplayResult) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if !r.fired {
                Text("Never triggered").font(Theme.label(22, weight: .bold)).foregroundStyle(Theme.ink)
                Text("Over this range the trigger was never met, so nothing would have been bought.")
                    .font(Theme.label(14)).foregroundStyle(Theme.inkSoft)
            } else {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    MoneyLabel(value: r.pnlUsd, signed: true, size: 30)
                    Text(r.holding ? "still holding" : outcome(r)).font(Theme.label(15, weight: .medium)).foregroundStyle(Theme.inkSoft)
                }
                if let e = r.entry {
                    Text("Bought \(Format.usd(e.spentUsd)) at \(Format.price(e.price)) on \(e.at.formatted(date: .abbreviated, time: .shortened)).")
                        .font(Theme.label(14)).foregroundStyle(Theme.inkSoft)
                }
                if let x = r.exit {
                    Text("\(x.reason == "take_profit" ? "Took profit" : "Stopped out") at \(Format.price(x.price)) on \(x.at.formatted(date: .abbreviated, time: .shortened)).")
                        .font(Theme.label(14)).foregroundStyle(Theme.inkSoft)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Theme.surface))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Theme.ghost.opacity(0.8), style: StrokeStyle(lineWidth: 1.5, dash: [6, 4])))
    }

    private func outcome(_ r: ReplayResult) -> String {
        switch r.exit?.reason {
        case "take_profit": "took profit"
        case "stop_loss": "stopped out"
        default: "closed"
        }
    }
}

/// One series: price in neutral ink. Levels are dashed rules in their stage
/// color with ink labels; entry and exit are shaped, ringed markers with
/// labels, so nothing is told by color alone (red/green are close for
/// deuteranopes). Drag to scrub.
private struct ReplayChart: View {
    let result: ReplayResult
    let cartridge: JSONValue
    @State private var scrub: Date?

    var body: some View {
        Chart {
            ForEach(result.series) { p in
                LineMark(x: .value("Time", p.t), y: .value("Price", p.close))
                    .foregroundStyle(Theme.inkSoft)
                    .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                    .interpolationMethod(.monotone)
            }

            if let level = triggerLevel {
                levelRule(level, color: PlayStage.awaiting.color, label: "Trigger")
            }
            if let entry = result.entry, let tp = cartridge[path: "exit.takeProfitPct"]?.double {
                levelRule(entry.price * (1 + tp / 100), color: Theme.Stage.done, label: "Take-profit")
            }
            if let entry = result.entry, let sl = cartridge[path: "exit.stopLossPct"]?.double {
                levelRule(entry.price * (1 - sl / 100), color: Theme.Stage.stopped, label: "Stop")
            }

            if let e = result.entry {
                PointMark(x: .value("Time", e.at), y: .value("Price", e.price))
                    .symbol(.circle)
                    .symbolSize(110)
                    .foregroundStyle(PlayStage.awaiting.color)
                    .annotation(position: .top, spacing: 4) { tag("Bought") }
            }
            if let x = result.exit {
                PointMark(x: .value("Time", x.at), y: .value("Price", x.price))
                    .symbol(x.reason == "take_profit" ? .triangle : .square)
                    .symbolSize(110)
                    .foregroundStyle(x.reason == "take_profit" ? Theme.Stage.done : Theme.Stage.stopped)
                    .annotation(position: x.reason == "take_profit" ? .top : .bottom, spacing: 4) {
                        tag(x.reason == "take_profit" ? "Took profit" : "Stopped")
                    }
            }

            if let scrub, let p = nearest(scrub) {
                RuleMark(x: .value("Time", p.t))
                    .foregroundStyle(Theme.inkMuted.opacity(0.6))
                    .lineStyle(StrokeStyle(lineWidth: 1))
                    .annotation(position: .top, overflowResolution: .init(x: .fit(to: .chart), y: .disabled)) {
                        VStack(spacing: 2) {
                            Text(Format.price(p.close)).font(Theme.money(13, weight: .semibold)).foregroundStyle(Theme.ink)
                            Text(p.t.formatted(date: .abbreviated, time: .shortened)).font(Theme.label(10)).foregroundStyle(Theme.inkMuted)
                        }
                        .padding(6)
                        .background(RoundedRectangle(cornerRadius: 8).fill(Theme.surface).shadow(color: .black.opacity(0.1), radius: 4))
                    }
            }
        }
        .chartYScale(domain: .automatic(includesZero: false))
        .chartXSelection(value: $scrub)
        .chartXAxis {
            AxisMarks(values: .automatic(desiredCount: 4)) { _ in
                AxisGridLine(stroke: StrokeStyle(lineWidth: 0.5)).foregroundStyle(Theme.line)
                AxisValueLabel(format: result.series.count > 0 && (result.to.timeIntervalSince(result.from) > 2 * 86400) ? .dateTime.month(.abbreviated).day() : .dateTime.hour())
                    .foregroundStyle(Theme.inkMuted)
            }
        }
        .chartYAxis {
            AxisMarks(position: .trailing, values: .automatic(desiredCount: 4)) { _ in
                AxisGridLine(stroke: StrokeStyle(lineWidth: 0.5)).foregroundStyle(Theme.line)
                AxisValueLabel().foregroundStyle(Theme.inkMuted).font(Theme.money(10))
            }
        }
        .accessibilityLabel("Price over the replay range")
    }

    private var triggerLevel: Double? {
        cartridge[path: "trigger.kind"]?.string == "price_cross" ? cartridge[path: "trigger.price"]?.double : result.trigger?.price
    }

    @ChartContentBuilder private func levelRule(_ y: Double, color: Color, label: String) -> some ChartContent {
        RuleMark(y: .value(label, y))
            .foregroundStyle(color.opacity(0.85))
            .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [5, 4]))
            // Labels sit at the right edge, on the surface, so they don't
            // collide with the entry and exit markers or each other's line.
            .annotation(position: .top, alignment: .trailing, spacing: 1) {
                Text("\(label) \(Format.price(y))")
                    .font(Theme.money(10, weight: .semibold))
                    .foregroundStyle(Theme.inkSoft)
                    .padding(.horizontal, 4)
                    .background(RoundedRectangle(cornerRadius: 4).fill(Theme.surface.opacity(0.85)))
            }
    }

    private func tag(_ text: String) -> some View {
        Text(text).font(Theme.label(11, weight: .semibold)).foregroundStyle(Theme.ink)
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(Capsule().fill(Theme.surface.opacity(0.9)))
    }

    private func nearest(_ t: Date) -> ReplayResult.Point? {
        result.series.min { abs($0.t.timeIntervalSince(t)) < abs($1.t.timeIntervalSince(t)) }
    }
}
