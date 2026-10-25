import BaselandKit
import SwiftUI

/// One Play: where it stands, what it's asking, and everything on its Tape.
struct PlayDetailView: View {
    @Environment(AppModel.self) private var model
    let playId: String
    @State private var confirmStop = false
    @State private var replaying = false

    private var play: Play? { model.plays.first { $0.id == playId } }
    private var tape: [TapeRow] { model.tapes[playId] ?? [] }

    var body: some View {
        ScrollView {
            if let play {
                VStack(alignment: .leading, spacing: 18) {
                    header(play)
                    if play.state == .awaiting, let pending = play.pending { approval(play, pending) }
                    controls(play)
                    spend
                    TapeView(rows: tape)
                }
                .padding(18)
            } else {
                ProgressView().padding(60)
            }
        }
        .background(Theme.paper)
        .navigationTitle(play?.title ?? "Play")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: playId) { await model.loadTape(playId) }
        .refreshable { await model.loadTape(playId) }
        .toolbar {
            if let play {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button { replaying = true } label: { Label("Replay against real prices", systemImage: "clock.arrow.circlepath") }
                        ShareLink(item: AppModel.shareText(play.spec), subject: Text(play.title)) { Label("Share cartridge", systemImage: "square.and.arrow.up") }
                    } label: { Image(systemName: "ellipsis.circle") }
                    .accessibilityIdentifier("playMenu")
                }
            }
        }
        .sheet(isPresented: $replaying) {
            if let play { ReplayView(title: play.title, cartridge: play.spec).presentationDetents([.large]) }
        }
        .confirmationDialog("Stop this Play?", isPresented: $confirmStop, titleVisibility: .visible) {
            Button("Stop Play", role: .destructive) { Task { await model.act(playId, "kill") } }
        }
    }

    private func header(_ play: Play) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                StagePill(stage: play.state, ghost: play.isGhost)
                if play.isGhost { GhostBadge() } else { LiveBadge() }
                Spacer()
                if !play.state.isTerminal {
                    Text(timerInterval: Date.now...max(play.windowEnd, .now), countsDown: true)
                        .font(Theme.money(13, weight: .medium))
                        .foregroundStyle(Theme.inkMuted)
                        .monospacedDigit()
                        .frame(width: 80, alignment: .trailing)
                }
            }
            ChipSentence(parts: play.sentence, size: 18, editable: false)
            Text(play.headline)
                .font(Theme.label(17, weight: .medium))
                .foregroundStyle(Theme.ink)
                .fixedSize(horizontal: false, vertical: true)
            if !play.state.isTerminal, play.state != .awaiting {
                ProgressTrack(progress: play.status.progress ?? 0, color: play.state.color, track: Theme.line)
            }
            HStack(spacing: 18) {
                if let price = play.status.price {
                    stat("\(play.symbol) price", Format.price(price))
                }
                // A buy that hasn't sold has no result yet; don't show "+$0.00".
                if let pnl = play.status.pnlUsd, pnl != 0 {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("P&L").font(Theme.money(9, weight: .bold)).tracking(0.8).foregroundStyle(Theme.inkMuted)
                        MoneyLabel(value: pnl, signed: true, size: 15)
                    }
                }
            }
        }
        .padding(18)
        .background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(Theme.surface))
        .overlay {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .strokeBorder(play.isGhost ? Theme.ghost.opacity(0.8) : Theme.line, style: StrokeStyle(lineWidth: play.isGhost ? 1.5 : 1, dash: play.isGhost ? [6, 4] : []))
        }
    }

    private func approval(_ play: Play, _ pending: PendingDTO) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("YOUR CALL").font(Theme.money(11, weight: .bold)).tracking(1).foregroundStyle(PlayStage.awaiting.color)
            HStack(alignment: .firstTextBaseline) {
                Text(pending.side == "BUY" ? "Buy" : "Sell").font(Theme.label(22, weight: .semibold))
                Text(Format.usd(pending.estUsd)).font(Theme.money(34, weight: .bold))
                Text(pending.product).font(Theme.money(14)).foregroundStyle(Theme.inkMuted)
            }
            .foregroundStyle(Theme.ink)
            HStack(spacing: 10) {
                Button { Task { await model.act(play.id, "skip") } } label: {
                    Text("Skip").frame(maxWidth: .infinity).padding(.vertical, 6)
                }
                .buttonStyle(.glass)
                Button { Task { await model.approve(play) } } label: {
                    Label(pending.estUsd > IslandLimits.approvalUSD ? "Approve with Face ID" : "Approve", systemImage: pending.estUsd > IslandLimits.approvalUSD ? "faceid" : "checkmark")
                        .frame(maxWidth: .infinity).padding(.vertical, 6)
                }
                .buttonStyle(.glassProminent)
                .tint(PlayStage.awaiting.color)
            }
            .font(Theme.label(16, weight: .semibold))
        }
        .padding(18)
        .background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(PlayStage.awaiting.color.opacity(0.1)))
    }

    @ViewBuilder private func controls(_ play: Play) -> some View {
        if !play.state.isTerminal {
            HStack(spacing: 10) {
                if play.state == .paused {
                    Button { Task { await model.act(play.id, "resume") } } label: { Label("Resume", systemImage: "play.fill").frame(maxWidth: .infinity) }
                        .buttonStyle(.glass)
                } else if play.state == .armed || play.state == .watching {
                    Button { Task { await model.act(play.id, "pause") } } label: { Label("Pause", systemImage: "pause.fill").frame(maxWidth: .infinity) }
                        .buttonStyle(.glass)
                }
                Button(role: .destructive) { confirmStop = true } label: { Label("Stop", systemImage: "stop.fill").frame(maxWidth: .infinity) }
                    .buttonStyle(.glass)
                    .tint(Theme.Stage.stopped)
            }
            .font(Theme.label(15, weight: .semibold))
        }
    }

    @ViewBuilder private var spend: some View {
        let evidence = tape.filter { $0.kind == "evidence" }
        if !evidence.isEmpty {
            let total = evidence.reduce(0) { $0 + $1.costUsdc }
            HStack {
                Image(systemName: "doc.text.magnifyingglass")
                Text("Evidence bought").font(Theme.label(14, weight: .medium))
                Spacer()
                Text("$\(total.formatted(.number.precision(.fractionLength(3))))").font(Theme.money(14, weight: .semibold))
                if evidence.allSatisfy(\.simulated) { GhostBadge(compact: true) }
            }
            .foregroundStyle(Theme.ink)
            .padding(14)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Theme.surface2))
        }
    }

    private func stat(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased()).font(Theme.money(9, weight: .bold)).tracking(0.8).foregroundStyle(Theme.inkMuted)
            Text(value).font(Theme.money(15, weight: .semibold)).foregroundStyle(Theme.ink).monospacedDigit()
        }
    }
}

/// The Tape: everything a Play saw, bought, decided and did.
struct TapeView: View {
    let rows: [TapeRow]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("THE TAPE").font(Theme.money(11, weight: .bold)).tracking(1.2).foregroundStyle(Theme.inkMuted).padding(.bottom, 10)
            ForEach(rows.reversed()) { row in
                TapeLine(row: row)
            }
            if rows.isEmpty {
                Text("Nothing yet.").font(Theme.label(14)).foregroundStyle(Theme.inkMuted)
            }
        }
    }
}

private struct TapeLine: View {
    let row: TapeRow

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 26, height: 26)
                .background(Circle().fill(tint.opacity(0.12)))
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(title).font(Theme.label(14, weight: .semibold)).foregroundStyle(Theme.ink)
                    if row.simulated && ["evidence", "order", "fill"].contains(row.kind) { GhostBadge(compact: true) }
                    Spacer()
                    Text(row.at.formatted(date: .omitted, time: .standard)).font(Theme.money(11)).foregroundStyle(Theme.inkMuted)
                }
                if let detail { Text(detail).font(Theme.label(13)).foregroundStyle(Theme.inkSoft).fixedSize(horizontal: false, vertical: true) }
            }
        }
        .padding(.vertical, 8)
    }

    private var p: JSONValue { row.payload }

    private var icon: String {
        switch row.kind {
        case "state": "circle.dotted"
        case "observe": "eye"
        case "trigger": "bolt.fill"
        case "evidence": "doc.text.magnifyingglass"
        case "decision": "sparkles"
        case "approval_request": "hand.raised.fill"
        case "approval": "hand.thumbsup.fill"
        case "leash_reject": "shield.slash.fill"
        case "order_preview": "list.bullet.rectangle"
        case "order": "arrow.up.forward.circle.fill"
        case "fill": "checkmark.seal.fill"
        case "error": "exclamationmark.triangle.fill"
        default: "note.text"
        }
    }

    private var tint: Color {
        switch row.kind {
        case "trigger", "approval_request": PlayStage.awaiting.color
        case "decision": PlayStage.deciding.color
        case "fill", "approval": Theme.Stage.done
        case "leash_reject", "error": Theme.Stage.stopped
        case "evidence": Theme.ghost
        default: Theme.Stage.watching
        }
    }

    private var title: String {
        switch row.kind {
        case "state": (p[path: "to"]?.string.flatMap(PlayStage.init(rawValue:))?.label) ?? "State"
        case "observe": "Window opened"
        case "trigger": p[path: "summary"]?.string ?? "Trigger"
        case "evidence": "Bought \(p[path: "provider"]?.string ?? "evidence") · $\(row.costUsdc.formatted(.number.precision(.fractionLength(3))))"
        case "decision": "Agent: \(p[path: "verdict"]?.string ?? "?")"
        case "approval_request": "Asked you"
        case "approval": (p[path: "decision"]?.string == "skip") ? "Skipped" : "Approved by \(p[path: "by"]?.string ?? "you")"
        case "leash_reject": "Leash stopped it"
        case "order_preview": "Previewed the order"
        case "order": p[path: "stage"]?.string == "accepted" ? "Order accepted" : "Order sent"
        case "fill": "\(p[path: "side"]?.string == "SELL" ? "Sold" : "Bought") at \(Format.usd(p[path: "avgPrice"]?.double ?? 0))"
        case "error": "Problem"
        default: row.kind.capitalized
        }
    }

    private var detail: String? {
        switch row.kind {
        case "state": return p[path: "reason"]?.string
        case "observe": return p[path: "anchorPrice"]?.double.map { "Opening price \(Format.price($0))" }
        case "evidence": return p[path: "query"]?.string.map { "“\($0)”" + (row.simulated ? " (simulated: no data fetched)" : "") }
        case "decision":
            if case .array(let reasons)? = p[path: "reasons"] { return reasons.compactMap(\.string).map { "• " + $0 }.joined(separator: "\n") }
            return p[path: "headline"]?.string
        case "approval_request": return p[path: "headline"]?.string
        case "leash_reject", "error": return p[path: "reason"]?.string ?? p[path: "message"]?.string
        case "fill":
            let base = p[path: "baseSize"]?.double ?? 0
            let fee = p[path: "feeUsd"]?.double ?? 0
            return "\(base.formatted(.number.precision(.fractionLength(0...8)))) \(p[path: "product"]?.string ?? "") · fee \(Format.usd(fee))"
        default: return nil
        }
    }
}
