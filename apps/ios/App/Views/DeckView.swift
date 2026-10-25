import BaselandKit
import SwiftUI

/// Home: a stack of Plays to arm with a swipe, and a composer to say one.
struct DeckView: View {
    @Environment(AppModel.self) private var model
    @State private var editing: EditingChip?
    @State private var showSettings = false
    @State private var confirmingLive: Draft?

    struct EditingChip: Identifiable {
        let draftId: String
        let part: SentencePart
        let cartridge: JSONValue
        var id: String { draftId + (part.field ?? "") }
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            Theme.paper.ignoresSafeArea()
            ContourBackground().ignoresSafeArea().opacity(0.8)

            VStack(spacing: 0) {
                header
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                Spacer(minLength: 12)
                stack
                    .padding(.horizontal, 18)
                Spacer(minLength: 12)
                swipeHint
                    .padding(.bottom, 92)
            }

            Composer()
                .padding(.horizontal, 16)
                .padding(.bottom, 10)
        }
        .sheet(item: $editing) { chip in
            ChipEditor(part: chip.part, cartridge: chip.cartridge) { field, value in
                Task { await model.edit(chip.draftId, field: field, to: value) }
            }
            .presentationDetents([.height(360)])
        }
        .sheet(isPresented: $showSettings) { SettingsView() }
        .confirmationDialog(
            "Arm with real money?",
            isPresented: Binding(get: { confirmingLive != nil }, set: { if !$0 { confirmingLive = nil } }),
            titleVisibility: .visible,
            presenting: confirmingLive
        ) { draft in
            Button("Arm LIVE", role: .destructive) { Task { await model.arm(draft, mode: "live") } }
            Button("Cancel", role: .cancel) {}
        } message: { draft in
            Text(liveMessage(draft))
        }
    }

    private func liveMessage(_ draft: Draft) -> String {
        let amount = draft.cartridge[path: "action.quoteUsd"]?.double.map { Format.usd($0) } ?? "the amount on the card"
        let portfolio = model.me?.coinbase.portfolio?.name ?? "your portfolio"
        return "Up to \(amount) from your Coinbase portfolio “\(portfolio)”. The agent still asks you before it buys, and the Leash caps every order."
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text("BASELAND")
                    .font(Theme.money(13, weight: .bold))
                    .tracking(2.5)
                    .foregroundStyle(Theme.ink)
                Text("Every event is a Play")
                    .font(Theme.label(12))
                    .foregroundStyle(Theme.inkMuted)
                    .lineLimit(1)
            }
            Spacer()
            if let cash = model.me?.ghostCashUsd {
                HStack(spacing: 6) {
                    GhostBadge(compact: true)
                    Text(Format.usd(cash)).font(Theme.money(13, weight: .semibold)).foregroundStyle(Theme.ink)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 7)
                .glassEffect(.regular, in: Capsule())
                .accessibilityLabel("Ghost cash \(Format.usd(cash))")
            }
            Button { showSettings = true } label: {
                Image(systemName: "slider.horizontal.3").font(.system(size: 15, weight: .semibold)).foregroundStyle(Theme.ink)
                    .frame(width: 36, height: 36)
            }
            .glassEffect(.regular.interactive(), in: Circle())
            .accessibilityLabel("Settings")
        }
    }

    @ViewBuilder private var stack: some View {
        if model.drafts.isEmpty {
            EmptyDeck(loading: model.deckLoading) { Task { await model.loadDeck(refresh: true) } }
                .frame(height: 430)
        } else {
            ZStack {
                ForEach(Array(model.drafts.prefix(3).enumerated().reversed()), id: \.element.id) { index, draft in
                    SwipeCard(draft: draft, depth: index) { part in
                        editing = EditingChip(draftId: draft.id, part: part, cartridge: draft.cartridge)
                    }
                    .zIndex(Double(10 - index))
                }
            }
            .frame(height: 430)
        }
    }

    private var swipeHint: some View {
        HStack(spacing: 28) {
            Button { if let d = model.drafts.first { Task { await model.skip(d) } } } label: {
                Image(systemName: "xmark").font(.system(size: 18, weight: .bold)).foregroundStyle(Theme.inkSoft).frame(width: 54, height: 54)
            }
            .glassEffect(.regular.interactive(), in: Circle())
            .accessibilityLabel("Skip this Play")
            .accessibilityIdentifier("skipButton")
            Text(model.canGoLive ? "Swipe right for Ghost" : "Swipe right to arm in Ghost")
                .font(Theme.label(12))
                .foregroundStyle(Theme.inkMuted)
            Button { if let d = model.drafts.first { Task { await model.arm(d) } } } label: {
                Image(systemName: "checkmark").font(.system(size: 18, weight: .bold)).foregroundStyle(.white).frame(width: 54, height: 54)
            }
            .glassEffect(.regular.tint(Theme.Stage.done).interactive(), in: Circle())
            .accessibilityLabel("Arm this Play in Ghost")
            .accessibilityIdentifier("armButton")
            // Real money only with a connected key and live trading on; never a swipe.
            if model.canGoLive {
                Button { confirmingLive = model.drafts.first } label: {
                    Text("LIVE").font(Theme.money(13, weight: .bold)).tracking(1).foregroundStyle(.white).frame(width: 54, height: 54)
                }
                .glassEffect(.regular.tint(Theme.Stage.stopped).interactive(), in: Circle())
                .accessibilityLabel("Arm this Play with real money")
                .accessibilityIdentifier("armLiveButton")
            }
        }
        .opacity(model.drafts.isEmpty ? 0 : 1)
    }
}

/// One card in the stack; the top one follows the finger.
private struct SwipeCard: View {
    @Environment(AppModel.self) private var model
    let draft: Draft
    let depth: Int
    let onChip: (SentencePart) -> Void
    @State private var drag: CGSize = .zero
    @State private var replaying = false

    private let threshold: CGFloat = 110

    var body: some View {
        PlayCardView(draft: draft, onChip: depth == 0 ? onChip : { _ in })
            .overlay(alignment: .topLeading) { stamp }
            .scaleEffect(1 - CGFloat(depth) * 0.05)
            .offset(x: drag.width, y: drag.height * 0.25 + CGFloat(depth) * 16)
            .rotationEffect(.degrees(Double(drag.width) / 22))
            .opacity(depth > 2 ? 0 : 1)
            .allowsHitTesting(depth == 0)
            .gesture(depth == 0 ? dragGesture : nil)
            .animation(.spring(response: 0.35, dampingFraction: 0.8), value: drag)
            .animation(.spring(response: 0.4, dampingFraction: 0.85), value: depth)
            .sensoryFeedback(.selection, trigger: abs(drag.width) > threshold)
            .contextMenu {
                Button { replaying = true } label: { Label("Replay against real prices", systemImage: "clock.arrow.circlepath") }
                ShareLink(item: AppModel.shareText(draft.cartridge), subject: Text(draft.title)) { Label("Share cartridge", systemImage: "square.and.arrow.up") }
            }
            .sheet(isPresented: $replaying) { ReplayView(title: draft.title, cartridge: draft.cartridge).presentationDetents([.large]) }
    }

    private var dragGesture: some Gesture {
        DragGesture(minimumDistance: 12)
            .onChanged { drag = $0.translation }
            .onEnded { value in
                if value.translation.width > threshold {
                    drag = CGSize(width: 600, height: value.translation.height)
                    Task { await model.arm(draft) }
                } else if value.translation.width < -threshold {
                    drag = CGSize(width: -600, height: value.translation.height)
                    Task { await model.skip(draft) }
                } else {
                    drag = .zero
                }
            }
    }

    @ViewBuilder private var stamp: some View {
        let progress = min(1, abs(drag.width) / threshold)
        if drag.width > 20 {
            StampLabel(text: "ARM · GHOST", color: Theme.Stage.done).opacity(progress).padding(22).rotationEffect(.degrees(-10))
        } else if drag.width < -20 {
            StampLabel(text: "SKIP", color: Theme.inkMuted).opacity(progress).padding(22).rotationEffect(.degrees(10))
                .frame(maxWidth: .infinity, alignment: .trailing)
        }
    }
}

private struct StampLabel: View {
    let text: String
    let color: Color

    var body: some View {
        Text(text)
            .font(Theme.money(16, weight: .heavy))
            .tracking(1.5)
            .foregroundStyle(color)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(color, lineWidth: 2.5))
    }
}

/// The face of a Play before it's armed.
struct PlayCardView: View {
    let draft: Draft
    var onChip: (SentencePart) -> Void = { _ in }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .center, spacing: 10) {
                Text(PlayKind.symbol(draft.cartridge))
                    .font(Theme.money(15, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(Capsule().fill(Theme.ink))
                Text(PlayKind.label(draft.cartridge).uppercased())
                    .font(Theme.money(11, weight: .bold))
                    .tracking(1)
                    .foregroundStyle(Theme.inkMuted)
                Spacer()
                if draft.cardId == nil {
                    Label("Your words", systemImage: "waveform").font(Theme.label(11, weight: .medium)).foregroundStyle(Theme.inkMuted)
                }
            }

            Text(draft.title)
                .font(.system(size: 30, weight: .bold, design: .default))
                .foregroundStyle(Theme.ink)
                .lineLimit(2)
                .minimumScaleFactor(0.8)

            ChipSentence(parts: draft.sentence, onChip: onChip)

            if let why = draft.rationale {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "sparkles").font(.system(size: 12, weight: .semibold)).foregroundStyle(PlayStage.deciding.color).padding(.top, 2)
                    Text(why)
                        .font(Theme.label(14))
                        .foregroundStyle(Theme.inkSoft)
                        .lineLimit(4)
                }
            }

            Spacer(minLength: 0)

            Divider().overlay(Theme.line)

            HStack(spacing: 14) {
                footerItem("Leash", Format.usd(draft.cartridge[path: "leash.maxPlayUsd"]?.double ?? 0))
                footerItem("Evidence", Format.usd(draft.cartridge[path: "evidence.budgetUsdc"]?.double ?? 0))
                footerItem("Asks first", (draft.cartridge[path: "decision.ask"]?.string ?? "always") == "never" ? "No" : "Yes")
            }
        }
        .padding(22)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background {
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .fill(Theme.surface)
                .overlay(ContourBackground(focus: .init(x: 1.05, y: -0.05)).opacity(0.5).clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous)))
                .shadow(color: .black.opacity(0.08), radius: 24, y: 12)
        }
        .overlay(RoundedRectangle(cornerRadius: 30, style: .continuous).strokeBorder(Theme.line, lineWidth: 1))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("deckCard")
    }

    private func footerItem(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased()).font(Theme.money(9, weight: .bold)).tracking(0.8).foregroundStyle(Theme.inkMuted)
            Text(value).font(Theme.money(13, weight: .semibold)).foregroundStyle(Theme.ink)
        }
    }
}

private struct EmptyDeck: View {
    let loading: Bool
    let refresh: () -> Void

    var body: some View {
        VStack(spacing: 14) {
            if loading {
                ProgressView().controlSize(.large)
                Text("Writing your Deck from live prices…")
                    .font(Theme.label(15, weight: .medium))
                    .foregroundStyle(Theme.inkSoft)
                Text("The agent reads the market and suggests a few Plays.")
                    .font(Theme.label(13))
                    .foregroundStyle(Theme.inkMuted)
            } else {
                Image(systemName: "rectangle.stack").font(.system(size: 34)).foregroundStyle(Theme.inkMuted)
                Text("No Plays left").font(Theme.label(17, weight: .semibold)).foregroundStyle(Theme.ink)
                Button("Deal a new Deck", action: refresh).buttonStyle(.glassProminent)
            }
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(RoundedRectangle(cornerRadius: 30, style: .continuous).strokeBorder(Theme.line, style: StrokeStyle(lineWidth: 1.5, dash: [6, 5])))
    }
}

/// "Say or type a Play": becomes a draft on top of the Deck.
private struct Composer: View {
    @Environment(AppModel.self) private var model
    @State private var text = ""
    @State private var voice = Voice()
    @FocusState private var focused: Bool

    var body: some View {
        HStack(spacing: 10) {
            // Single-line on purpose: a vertical-axis field turns Return into a
            // newline and onSubmit never fires.
            TextField("Say a Play… “buy $5 of ETH if it breaks 2,400”", text: $text)
                .font(Theme.label(15))
                .focused($focused)
                .accessibilityIdentifier("composer")
                .submitLabel(.send)
                .onSubmit(send)
            if model.drafting {
                ProgressView()
            } else if !text.isEmpty {
                Button(action: send) {
                    Image(systemName: "arrow.up").font(.system(size: 15, weight: .bold)).foregroundStyle(.white).frame(width: 34, height: 34)
                        .background(Circle().fill(Theme.ink))
                }
                .accessibilityLabel("Make this a Play")
            } else {
                Image(systemName: voice.isListening ? "waveform" : "mic.fill")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(voice.isListening ? .white : Theme.ink)
                    .frame(width: 34, height: 34)
                    .background(Circle().fill(voice.isListening ? Theme.Stage.awaiting : Theme.surface2))
                    .symbolEffect(.variableColor.iterative, isActive: voice.isListening)
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { _ in if !voice.isListening { Task { await voice.start() } } }
                            .onEnded { _ in
                                voice.stop()
                                if !voice.transcript.isEmpty { text = voice.transcript; send() }
                                else if let why = voice.unavailableReason { model.show(why, error: true) }
                            }
                    )
                    .accessibilityLabel("Hold to say a Play")
            }
        }
        .padding(.leading, 18)
        .padding(.trailing, 8)
        .padding(.vertical, 8)
        .glassEffect(.regular.interactive(), in: RoundedRectangle(cornerRadius: 26, style: .continuous))
        .onChange(of: voice.transcript) { _, t in if voice.isListening { text = t } }
    }

    private func send() {
        let words = text
        text = ""
        focused = false
        Task { await model.draft(from: words) }
    }
}
