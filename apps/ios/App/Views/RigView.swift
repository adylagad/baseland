import BaselandKit
import SwiftUI

/// Advanced mode: how your agent is put together. Every control here changes
/// what the engine does at the next decision, including for running Plays.
struct RigView: View {
    @Environment(AppModel.self) private var model
    @State private var editingInstinct: RigCatalog.Instinct?
    @State private var importing = false

    var body: some View {
        NavigationStack {
            Group {
                if let rig = model.rig, let catalog = model.catalog {
                    Form {
                        brain(rig, catalog)
                        senses(rig, catalog)
                        instincts(rig, catalog)
                        hands(rig, catalog)
                        leash(rig)
                        accountSection
                        lab
                    }
                    .scrollContentBackground(.hidden)
                    .background(Theme.paper)
                } else {
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity).background(Theme.paper)
                }
            }
            .navigationTitle("The Rig")
            .task {
                if model.rig == nil { await model.loadRig() }
                await model.loadAccount()
            }
            .refreshable {
                await model.loadRig()
                await model.loadAccount()
            }
            .sheet(item: $editingInstinct) { instinct in
                InstinctEditor(instinct: instinct, current: model.rig?.instincts.overrides[instinct.id])
                    .presentationDetents([.medium, .large])
            }
            .sheet(isPresented: $importing) { ImportCartridgeView().presentationDetents([.medium]) }
        }
    }

    // MARK: Slots

    private func brain(_ rig: RigDTO, _ catalog: RigCatalog) -> some View {
        Section {
            Picker("Model", selection: binding(rig.brain.model) { $0.brain.model = $1 }) {
                ForEach(catalog.models) { m in Text(m.label).tag(m.id) }
            }
            .pickerStyle(.inline)
            .labelsHidden()
            if rig.brain.model != "rules" {
                Picker("Thinks", selection: binding(rig.brain.effort) { $0.brain.effort = $1 }) {
                    Text("Quick").tag("low")
                    Text("Balanced").tag("medium")
                    Text("Careful").tag("high")
                }
                .pickerStyle(.segmented)
            }
        } header: {
            slotHeader("Brain", "brain.head.profile")
        } footer: {
            Text("Decides once, when a Play's trigger fires. It never places orders; the engine checks the Leash and previews every order.")
        }
    }

    private func senses(_ rig: RigDTO, _ catalog: RigCatalog) -> some View {
        Section {
            ForEach(catalog.senses) { sense in
                Toggle(isOn: binding(rig.senses.enabled.contains(sense.id)) { r, on in
                    r.senses.enabled = on ? Array(Set(r.senses.enabled + [sense.id])).sorted() : r.senses.enabled.filter { $0 != sense.id }
                }) {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            Text(sense.label).font(Theme.label(15, weight: .medium))
                            Text("$\(sense.priceUsdc.formatted(.number.precision(.fractionLength(2...3))))")
                                .font(Theme.money(12, weight: .semibold))
                                .foregroundStyle(Theme.inkMuted)
                        }
                        Text(sense.use).font(Theme.label(12)).foregroundStyle(Theme.inkMuted)
                    }
                }
                .tint(Theme.Stage.watching)
            }
            stepper("Budget per Play", value: rig.senses.budgetUsdc, range: 0...1, step: 0.05, money: true) { $0.senses.budgetUsdc = $1 }
        } header: {
            slotHeader("Senses", "dot.radiowaves.up.forward")
        } footer: {
            HStack(spacing: 6) {
                GhostBadge(compact: true)
                Text("Purchases are simulated at these real x402 prices until the portfolio is funded. Switching a Sense off stops it for running Plays too.")
            }
        }
    }

    private func instincts(_ rig: RigDTO, _ catalog: RigCatalog) -> some View {
        Section {
            ForEach(catalog.instincts) { instinct in
                Button { editingInstinct = instinct } label: {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(instinct.id.capitalized).font(Theme.label(15, weight: .semibold)).foregroundStyle(Theme.ink)
                            Text(rig.instincts.overrides[instinct.id] ?? instinct.text)
                                .font(Theme.label(12))
                                .foregroundStyle(Theme.inkMuted)
                                .lineLimit(2)
                        }
                        Spacer()
                        if rig.instincts.overrides[instinct.id] != nil {
                            Text("YOURS").font(Theme.money(10, weight: .bold)).foregroundStyle(Theme.Stage.watching)
                        }
                    }
                }
            }
        } header: {
            slotHeader("Instincts", "theatermasks")
        } footer: {
            Text("How the Brain judges a trigger. Edit the wording to make it yours; limits stay in the Leash.")
        }
    }

    private func hands(_ rig: RigDTO, _ catalog: RigCatalog) -> some View {
        Section {
            FlowLayout(spacing: 8, lineSpacing: 8) {
                ForEach(catalog.assets, id: \.self) { asset in
                    let on = rig.hands.assets.contains(asset)
                    Button(asset) {
                        Task {
                            await model.editRig { r in
                                if on, r.hands.assets.count > 1 { r.hands.assets.removeAll { $0 == asset } } else if !on { r.hands.assets.append(asset) }
                            }
                        }
                    }
                    .buttonStyle(.bordered)
                    .tint(on ? Theme.Stage.watching : Theme.inkMuted)
                    .font(Theme.money(14, weight: .bold))
                    .accessibilityValue(on ? "allowed" : "not allowed")
                }
            }
            .padding(.vertical, 4)
            Picker("Asks before trading", selection: binding(askMode(rig)) { r, mode in
                r.hands.ask = mode == "always" ? .string("always") : mode == "never" ? .string("never") : .object(["aboveUsd": .number(10)])
            }) {
                Text("Always").tag("always")
                Text("Above $10").tag("above")
                Text("Never").tag("never")
            }
        } header: {
            slotHeader("Hands", "hand.raised")
        } footer: {
            Text("What the agent may touch. New Plays use this approval policy; exits are always allowed so a position can close.")
        }
    }

    private func leash(_ rig: RigDTO) -> some View {
        Section {
            stepper("Max per order", value: rig.leash.maxOrderUsd, range: 1...100, step: 1, money: true) { $0.leash.maxOrderUsd = $1 }
            stepper("Max per Play", value: rig.leash.maxPlayUsd, range: 1...500, step: 5, money: true) { $0.leash.maxPlayUsd = $1 }
            stepper("Max evidence per Play", value: rig.leash.maxEvidenceUsdc, range: 0...5, step: 0.05, money: true) { $0.leash.maxEvidenceUsdc = $1 }
        } header: {
            slotHeader("Leash", "lock.shield")
        } footer: {
            Text("Hard caps on top of every Play's own limits. The engine enforces them before any order.")
        }
    }

    @ViewBuilder private var accountSection: some View {
        Section {
            if let a = model.account {
                LabeledContent {
                    Text(Format.usd(a.ghost.cashUsd)).font(Theme.money(15, weight: .semibold))
                } label: {
                    HStack(spacing: 6) { Text("Cash"); GhostBadge(compact: true) }
                }
                ForEach(a.ghost.positions) { p in
                    LabeledContent {
                        VStack(alignment: .trailing, spacing: 2) {
                            if let v = p.valueUsd { Text(Format.usd(v)).font(Theme.money(14, weight: .semibold)) }
                            if let pnl = p.pnlUsd { MoneyLabel(value: pnl, signed: true, size: 12) }
                        }
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(p.symbol).font(Theme.money(15, weight: .bold))
                            Text(p.base.formatted(.number.precision(.fractionLength(0...8)))).font(Theme.money(12)).foregroundStyle(Theme.inkMuted)
                        }
                    }
                }
                if let name = a.live?[path: "portfolio.name"]?.string {
                    LabeledContent("Coinbase portfolio", value: name)
                    if let total = a.live?[path: "balances.total_balance.value"]?.double {
                        LabeledContent("Balance", value: Format.usd(total))
                    }
                } else {
                    LabeledContent("Coinbase", value: "Not connected")
                }
            } else {
                ProgressView()
            }
        } header: {
            slotHeader("Account", "building.columns")
        }
    }

    private var lab: some View {
        Section {
            Button { importing = true } label: { Label("Import a cartridge", systemImage: "square.and.arrow.down") }
            NavigationLink { IslandLabView() } label: { Label("Island Lab", systemImage: "capsule.portrait") }
        } header: {
            slotHeader("Lab", "flask")
        } footer: {
            Text("Share a Play from its menu (⋯) or by long-pressing a card; import one here. Replay any Play against real past prices from the same menus.")
        }
    }

    // MARK: Helpers

    private func slotHeader(_ title: String, _ icon: String) -> some View {
        Label(title, systemImage: icon).font(Theme.money(12, weight: .bold)).foregroundStyle(Theme.inkSoft)
    }

    private func askMode(_ rig: RigDTO) -> String {
        if case .object = rig.hands.ask { return "above" }
        return rig.hands.ask.string ?? "always"
    }

    private func binding<V: Equatable>(_ value: V, set: @escaping (inout RigDTO, V) -> Void) -> Binding<V> {
        Binding(get: { value }, set: { new in Task { await model.editRig { set(&$0, new) } } })
    }

    private func stepper(_ label: String, value: Double, range: ClosedRange<Double>, step: Double, money: Bool, set: @escaping (inout RigDTO, Double) -> Void) -> some View {
        Stepper(value: binding(value, set: set), in: range, step: step) {
            HStack {
                Text(label)
                Spacer()
                Text(money ? Format.usd(value) : value.formatted()).font(Theme.money(14, weight: .semibold)).foregroundStyle(Theme.ink)
            }
        }
    }
}

private struct InstinctEditor: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let instinct: RigCatalog.Instinct
    let current: String?
    @State private var text = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextEditor(text: $text).frame(minHeight: 160).font(Theme.label(15))
                } footer: {
                    Text("\(text.count)/600 · The Brain reads this when judging a Play with the \(instinct.id) instinct.")
                }
                if current != nil {
                    Button("Use the built-in wording", role: .destructive) {
                        Task { await model.editRig { $0.instincts.overrides[instinct.id] = nil }; dismiss() }
                    }
                }
            }
            .navigationTitle(instinct.id.capitalized)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
                        Task {
                            await model.editRig { $0.instincts.overrides[instinct.id] = (trimmed.isEmpty || trimmed == instinct.text) ? nil : String(trimmed.prefix(600)) }
                            dismiss()
                        }
                    }
                }
            }
            .onAppear { text = current ?? instinct.text }
        }
    }
}

private struct ImportCartridgeView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextEditor(text: $text).frame(minHeight: 140).font(Theme.money(12))
                    Button("Paste from clipboard") { text = UIPasteboard.general.string ?? "" }
                } footer: {
                    Text("A cartridge is a Play as JSON. Mode isn't part of it: an imported Play always starts as a card you choose to arm, in Ghost.")
                }
            }
            .navigationTitle("Import a cartridge")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Import") { Task { if await model.importCartridge(text) { dismiss() } } }.disabled(text.count < 10)
                }
            }
        }
    }
}
