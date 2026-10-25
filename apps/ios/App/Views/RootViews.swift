import BaselandKit
import SwiftUI

struct RootView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        ZStack(alignment: .top) {
            switch model.phase {
            case .launching:
                Theme.paper.ignoresSafeArea().overlay(ProgressView())
            case .onboarding:
                OnboardingView()
            case .ready:
                TabView(selection: $model.selectedTab) {
                    Tab("Deck", systemImage: "rectangle.stack.fill", value: AppModel.Tab.deck) { DeckView() }
                    Tab("Plays", systemImage: "dot.radiowaves.left.and.right", value: AppModel.Tab.plays) { PlaysView() }
                        .badge(model.plays.filter { $0.state == .awaiting }.count)
                }
                .tint(Theme.ink)
            }
            if let toast = model.toast {
                ToastView(toast: toast)
                    .padding(.top, 6)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .task(id: toast.id) {
                        try? await Task.sleep(for: .seconds(3.2))
                        if model.toast?.id == toast.id { withAnimation { model.toast = nil } }
                    }
            }
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.85), value: model.toast)
        .sheet(item: Binding(get: { model.openPlayId.map(OpenPlay.init) }, set: { model.openPlayId = $0?.id })) { open in
            NavigationStack { PlayDetailView(playId: open.id) }
        }
    }

    private struct OpenPlay: Identifiable { let id: String }
}

struct OnboardingView: View {
    @Environment(AppModel.self) private var model
    @State private var starting = false

    var body: some View {
        ZStack {
            Theme.paper.ignoresSafeArea()
            ContourBackground(focus: .init(x: 0.5, y: 0.22), tightness: 0.3).ignoresSafeArea()
            VStack(alignment: .leading, spacing: 22) {
                Spacer()
                Text("BASELAND").font(Theme.money(14, weight: .bold)).tracking(3).foregroundStyle(Theme.inkMuted)
                Text("Every market event becomes a Play.")
                    .font(.system(size: 40, weight: .bold))
                    .foregroundStyle(Theme.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Your agent watches the moment, buys the evidence it needs, and asks you in the Dynamic Island. You approve with a tap.")
                    .font(Theme.label(17))
                    .foregroundStyle(Theme.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)

                // A taste of the Island.
                HStack {
                    IslandCompactLeading(attributes: DemoPlay.attributes, state: DemoPlay.script(endsAt: .now)[4])
                    Spacer(minLength: 90)
                    IslandCompactTrailing(state: DemoPlay.script(endsAt: .now)[4])
                }
                .padding(.horizontal, 16)
                .frame(height: 40)
                .background(Capsule().fill(.black))
                .padding(.vertical, 8)

                Spacer()

                VStack(alignment: .leading, spacing: 10) {
                    Button {
                        starting = true
                        Task { await model.startGhost(); starting = false }
                    } label: {
                        HStack {
                            if starting { ProgressView().tint(.white) }
                            Text("Start in Ghost").font(Theme.label(17, weight: .semibold))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                    }
                    .buttonStyle(.glassProminent)
                    .tint(Theme.ink)
                    .disabled(starting)
                    HStack(spacing: 6) {
                        GhostBadge(compact: true)
                        Text("Real prices, pretend money. Every simulated action is labeled.")
                            .font(Theme.label(12))
                            .foregroundStyle(Theme.inkMuted)
                    }
                    Text("You can connect your Coinbase portfolio later in Settings.")
                        .font(Theme.label(12))
                        .foregroundStyle(Theme.inkMuted)
                }
            }
            .padding(26)
        }
    }
}

struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var keyJSON = ""
    @State private var connecting = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    if let cb = model.me?.coinbase, cb.connected {
                        LabeledContent("Portfolio", value: cb.portfolio?.name ?? "Connected")
                        Button("Disconnect", role: .destructive) { Task { await model.disconnectCoinbase() } }
                    } else {
                        Text("Paste the CDP key file you downloaded, scoped to one dedicated portfolio. It's verified, encrypted and kept only by the engine.")
                            .font(Theme.label(13))
                            .foregroundStyle(Theme.inkSoft)
                        TextField("{ \"id\": …, \"privateKey\": … }", text: $keyJSON, axis: .vertical)
                            .font(Theme.money(12))
                            .lineLimit(3...6)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        Button {
                            connecting = true
                            Task {
                                if await model.connectCoinbase(json: keyJSON) { keyJSON = "" }
                                connecting = false
                            }
                        } label: {
                            HStack { if connecting { ProgressView() }; Text("Connect") }
                        }
                        .disabled(keyJSON.count < 20 || connecting)
                    }
                } header: {
                    Text("Coinbase")
                } footer: {
                    Text(model.me?.liveTradingEnabled == true ? "Live trading is on for this engine." : "Live trading is switched off on the engine; Plays run in Ghost.")
                }

                Section("This iPhone") {
                    LabeledContent("Live Activities", value: model.activities.enabled ? "On" : "Off in Settings")
                    LabeledContent("Keeping Plays live in background", value: model.keepAlive.isRunning ? "Yes" : "No")
                    NavigationLink("Island Lab") { IslandLabView() }
                }

                Section("Engine") {
                    LabeledContent("Server", value: Config.engineURL.host() ?? "")
                    if let cash = model.me?.ghostCashUsd { LabeledContent("Ghost cash", value: Format.usd(cash)) }
                }
            }
            .navigationTitle("Settings")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}
