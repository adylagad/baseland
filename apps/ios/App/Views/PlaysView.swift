import BaselandKit
import SwiftUI

/// Every Play: what's running, and what finished.
struct PlaysView: View {
    @Environment(AppModel.self) private var model
    @State private var confirmKill = false

    var body: some View {
        NavigationStack {
            List {
                if model.plays.isEmpty {
                    ContentUnavailableView("No Plays yet", systemImage: "rectangle.stack", description: Text("Swipe right on a card in the Deck to arm one."))
                        .listRowBackground(Color.clear)
                }
                if !model.running.isEmpty {
                    Section("Running") {
                        ForEach(model.running) { play in
                            NavigationLink(value: play.id) { PlayRow(play: play) }
                        }
                    }
                }
                if !model.recent.isEmpty {
                    Section("Finished") {
                        ForEach(model.recent.prefix(30)) { play in
                            NavigationLink(value: play.id) { PlayRow(play: play) }
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.paper)
            .navigationTitle("Plays")
            .navigationDestination(for: String.self) { id in PlayDetailView(playId: id) }
            .refreshable { await model.refresh() }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(role: .destructive) { confirmKill = true } label: {
                        Label("Stop all", systemImage: "stop.circle.fill")
                    }
                    .tint(Theme.Stage.stopped)
                    .disabled(model.running.isEmpty)
                }
            }
            .confirmationDialog("Stop every running Play?", isPresented: $confirmKill, titleVisibility: .visible) {
                Button("Stop all Plays", role: .destructive) { Task { await model.killAll() } }
            } message: {
                Text("Orders already in flight finish first. Exits Coinbase holds stay in place.")
            }
        }
    }
}

struct PlayRow: View {
    let play: Play

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            StageDot(stage: play.state, isGhost: play.isGhost, size: 9).padding(.top, 6)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(play.title).font(Theme.label(16, weight: .semibold)).foregroundStyle(Theme.ink)
                    if play.isGhost { GhostBadge(compact: true) } else { LiveBadge(compact: true) }
                }
                Text(play.headline).font(Theme.label(13)).foregroundStyle(Theme.inkSoft).lineLimit(2)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 4) {
                if play.state == .awaiting, let amount = play.pending?.estUsd {
                    Text(Format.usd(amount) + "?").font(Theme.money(14, weight: .bold)).foregroundStyle(PlayStage.awaiting.color)
                } else if let pnl = play.status.pnlUsd, pnl != 0 {
                    MoneyLabel(value: pnl, signed: true, size: 14)
                }
                Text(play.state.label).font(Theme.money(10, weight: .bold)).foregroundStyle(play.state.color)
            }
        }
        .padding(.vertical, 4)
    }
}
