import BaselandKit
import Foundation
import LocalAuthentication
import Observation
import UIKit

/// Everything the app shows, and every action it takes. One instance, created
/// at launch, so App Intents run while the app is in the background reach the
/// same signed-in state.
@MainActor
@Observable
final class AppModel {
    static let shared = AppModel()

    enum Phase: Equatable { case launching, onboarding, ready }

    private(set) var phase: Phase = .launching
    private(set) var me: Me?
    private(set) var plays: [Play] = []
    private(set) var tapes: [String: [TapeRow]] = [:]
    var drafts: [Draft] = []
    private(set) var deckLoading = false
    private(set) var drafting = false
    var toast: Toast?
    var openPlayId: String?
    var selectedTab: Tab = .deck
    private(set) var rig: RigDTO?
    private(set) var catalog: RigCatalog?
    private(set) var account: Account?

    enum Tab: Hashable { case deck, plays, rig }

    struct Toast: Identifiable, Equatable {
        let id = UUID()
        let text: String
        var isError = false
    }

    let session = Session()
    let activities = ActivitySync()
    let keepAlive = KeepAlive()
    let api: EngineAPI

    private init() {
        let session = session
        api = EngineAPI(base: Config.engineURL, token: { try await session.accessToken() })
        IntentBridge.handler = { [weak self] command, playId in
            try await self?.handle(command, playId: playId)
        }
    }

    // MARK: Launch

    func bootstrap() async {
        guard phase == .launching else { return }
        if let uid = session.userId {
            await enter(userId: uid)
        } else {
            phase = .onboarding
        }
    }

    /// Ghost mode needs no account: an anonymous Supabase user.
    func startGhost() async {
        do {
            let uid = try await session.signInAnonymously()
            await enter(userId: uid)
        } catch {
            show("Couldn't reach Baseland. Check your connection.", error: true)
        }
    }

    private func enter(userId: String) async {
        // A stored session can outlive its user (deleted, or expired beyond
        // refresh). If the engine rejects it, start over instead of failing
        // every request.
        do {
            me = try await api.me()
        } catch let e as APIError where e.status == 401 {
            await session.signOut()
            phase = .onboarding
            return
        } catch {
            // Offline or engine waking up: carry on; refresh retries.
        }
        phase = .ready
        await session.listen(
            userId: userId,
            onPlay: { play in Task { @MainActor in AppModel.shared.merge(play) } },
            onTape: { row in Task { @MainActor in AppModel.shared.merge(row) } }
        )
        await refresh()
        await loadRig()
        if drafts.isEmpty { await loadDeck(refresh: false) }
    }

    func refresh() async {
        async let me = try? api.me()
        async let plays = try? api.plays()
        if let m = await me { self.me = m }
        if let p = await plays {
            self.plays = p
            await afterPlaysChanged()
        }
    }

    // MARK: Deck and drafts

    func loadDeck(refresh: Bool) async {
        deckLoading = true
        defer { deckLoading = false }
        do {
            let cards = try await api.deck(refresh: refresh)
            let fromWords = drafts.filter { $0.cardId == nil }
            drafts = fromWords + cards.map { Draft(id: $0.id, cardId: $0.id, cartridge: $0.spec, sentence: $0.sentence, rationale: $0.rationale) }
        } catch {
            show(message(for: error), error: true)
        }
    }

    /// Words → a draft on top of the Deck.
    func draft(from text: String) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count > 2 else { return }
        drafting = true
        defer { drafting = false }
        do {
            let cartridge = try await api.draft(text: trimmed)
            let sentence = Self.sentence(of: cartridge)
            drafts.insert(Draft(id: UUID().uuidString, cardId: nil, cartridge: cartridge, sentence: sentence, rationale: "From what you said: “\(trimmed)”"), at: 0)
        } catch {
            show(message(for: error), error: true)
        }
    }

    /// After a chip edit: the engine validates and rewrites the sentence.
    func edit(_ draftId: String, field: String, to value: JSONValue) async {
        guard let i = drafts.firstIndex(where: { $0.id == draftId }) else { return }
        var cartridge = drafts[i].cartridge
        cartridge[path: field] = value
        // A lone amount chip also moves the Leash, which is sized to the order.
        if field == "action.quoteUsd", let amount = value.double {
            if (cartridge[path: "leash.maxOrderUsd"]?.double ?? 0) < amount { cartridge[path: "leash.maxOrderUsd"] = .number(amount) }
            if (cartridge[path: "leash.maxPlayUsd"]?.double ?? 0) < amount { cartridge[path: "leash.maxPlayUsd"] = .number(amount) }
        }
        do {
            let r = try await api.preview(cartridge: cartridge)
            guard r.valid, let next = r.cartridge, let j = drafts.firstIndex(where: { $0.id == draftId }) else {
                show(r.issues.first.map(Self.humanize) ?? "That change doesn't fit this Play.", error: true)
                return
            }
            drafts[j].cartridge = next
            drafts[j].sentence = Self.sentence(of: next)
        } catch {
            show(message(for: error), error: true)
        }
    }

    /// A connected key and an engine with live trading switched on.
    var canGoLive: Bool { me?.coinbase.connected == true && me?.liveTradingEnabled == true }

    /// Swipe right.
    func arm(_ draft: Draft, mode: String = "ghost") async {
        drafts.removeAll { $0.id == draft.id }
        do {
            let play = if let card = draft.cardId {
                try await api.arm(card: card, cartridge: draft.cartridge, mode: mode)
            } else {
                try await api.createPlay(cartridge: draft.cartridge, mode: mode)
            }
            merge(play)
            show(mode == "ghost" ? "Armed in Ghost. It's in your Dynamic Island." : "Armed LIVE with real money. It asks before it buys.")
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        } catch {
            drafts.insert(draft, at: 0)
            show(message(for: error), error: true)
        }
    }

    /// Swipe left.
    func skip(_ draft: Draft) async {
        drafts.removeAll { $0.id == draft.id }
        if let card = draft.cardId { try? await api.skip(card: card) }
        if drafts.isEmpty { await loadDeck(refresh: true) }
    }

    // MARK: Play controls

    func approve(_ play: Play) async {
        let amount = play.pending?.estUsd ?? 0
        if amount > IslandLimits.approvalUSD, !(await authenticate(reason: "Approve \(Format.usd(amount)) for \(play.title)")) { return }
        await act(play.id, "approve")
    }

    func act(_ playId: String, _ action: String) async {
        do {
            merge(try await api.act(playId, action))
        } catch {
            show(message(for: error), error: true)
        }
    }

    func killAll() async {
        do {
            let n = try await api.killAll()
            show(n == 0 ? "Nothing was running." : "Stopped \(n) Play\(n == 1 ? "" : "s").")
            await refresh()
        } catch {
            show(message(for: error), error: true)
        }
    }

    func loadTape(_ playId: String) async {
        if let (play, tape) = try? await api.play(playId) {
            tapes[playId] = tape
            merge(play)
        }
    }

    // MARK: The Rig

    func loadRig() async {
        do {
            let (r, c) = try await api.rig()
            rig = r
            catalog = c
        } catch {
            show(message(for: error), error: true)
        }
    }

    /// Applies an edit at once and saves it; on failure, puts the old Rig back.
    func editRig(_ change: (inout RigDTO) -> Void) async {
        guard var next = rig else { return }
        let before = next
        change(&next)
        guard next != before else { return }
        rig = next
        do {
            rig = try await api.saveRig(next)
        } catch {
            rig = before
            show(message(for: error), error: true)
        }
    }

    func loadAccount() async {
        account = try? await api.account()
    }

    func replay(_ cartridge: JSONValue, days: Double) async -> ReplayResult? {
        do {
            return try await api.replay(cartridge: cartridge, days: days)
        } catch {
            show(message(for: error), error: true)
            return nil
        }
    }

    // MARK: Cartridges (share and import)

    /// A cartridge as pretty JSON, for sharing. Mode is never part of it.
    static func shareText(_ cartridge: JSONValue) -> String {
        let e = JSONEncoder()
        e.outputFormatting = [.prettyPrinted, .sortedKeys]
        return (try? e.encode(cartridge)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
    }

    /// Pasted JSON → validated by the engine → a card on top of the Deck.
    func importCartridge(_ text: String) async -> Bool {
        guard let data = text.data(using: .utf8), let json = try? JSONDecoder().decode(JSONValue.self, from: data) else {
            show("That isn't a cartridge (it should be JSON).", error: true)
            return false
        }
        do {
            let r = try await api.preview(cartridge: json)
            guard r.valid, let cartridge = r.cartridge else {
                show(r.issues.first.map(Self.humanize) ?? "That cartridge doesn't validate.", error: true)
                return false
            }
            drafts.insert(Draft(id: UUID().uuidString, cardId: nil, cartridge: cartridge, sentence: Self.sentence(of: cartridge), rationale: "Imported cartridge"), at: 0)
            selectedTab = .deck
            show("Imported. It's on top of your Deck.")
            return true
        } catch {
            show(message(for: error), error: true)
            return false
        }
    }

    // MARK: Coinbase

    func connectCoinbase(json: String) async -> Bool {
        do {
            try await api.connectCoinbase(keyJSON: Data(json.utf8))
            me = try? await api.me()
            show("Connected to \(me?.coinbase.portfolio?.name ?? "your portfolio").")
            return true
        } catch {
            show(message(for: error), error: true)
            return false
        }
    }

    func disconnectCoinbase() async {
        try? await api.disconnectCoinbase()
        me = try? await api.me()
    }

    // MARK: App Intents (Island buttons, Control Center, Siri)

    private func handle(_ command: PlayCommand, playId: String?) async throws {
        if phase == .launching { await bootstrap() }
        switch command {
        case .approve:
            guard let playId else { return }
            merge(try await api.act(playId, "approve"))
        case .skip:
            guard let playId else { return }
            merge(try await api.act(playId, "skip"))
        case .pause:
            guard let playId else { return }
            merge(try await api.act(playId, "pause"))
        case .killAll:
            _ = try await api.killAll()
            await refresh()
        }
    }

    // MARK: Live updates

    func merge(_ play: Play) {
        if let i = plays.firstIndex(where: { $0.id == play.id }) {
            // Realtime and HTTP can race; keep the newer row.
            if let a = plays[i].updatedAt, let b = play.updatedAt, b < a { return }
            plays[i] = play
        } else {
            plays.insert(play, at: 0)
        }
        Task { await afterPlaysChanged() }
    }

    func merge(_ row: TapeRow) {
        var rows = tapes[row.playId] ?? []
        guard !rows.contains(where: { $0.id == row.id }) else { return }
        rows.append(row)
        tapes[row.playId] = rows.sorted { $0.id < $1.id }
        if row.kind == "fill" || row.kind == "state" { Task { me = try? await api.me() } }
    }

    private func afterPlaysChanged() async {
        await activities.sync(plays)
        keepAlive.set(plays.contains { !$0.state.isTerminal })
    }

    var running: [Play] { plays.filter { !$0.state.isTerminal } }
    var recent: [Play] { plays.filter { $0.state.isTerminal } }

    // MARK: Helpers

    func show(_ text: String, error: Bool = false) {
        toast = Toast(text: text, isError: error)
    }

    private func message(for error: Error) -> String {
        if let e = error as? APIError { return e.details.first.map(Self.humanize) ?? e.message }
        if (error as? URLError)?.code == .notConnectedToInternet { return "You're offline." }
        return "Something went wrong. Try again."
    }

    /// "action.quoteUsd: order is larger than…" → "Order is larger than…"
    static func humanize(_ issue: String) -> String {
        let text = issue.split(separator: ":", maxSplits: 1).last.map { String($0).trimmingCharacters(in: .whitespaces) } ?? issue
        return text.prefix(1).uppercased() + text.dropFirst()
    }

    static func sentence(of cartridge: JSONValue) -> [SentencePart] {
        guard let data = try? JSONCoding.encoder.encode(cartridge[path: "sentence"] ?? .array([])) else { return [] }
        return (try? JSONDecoder().decode([SentencePart].self, from: data)) ?? []
    }

    private func authenticate(reason: String) async -> Bool {
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else { return true }
        return (try? await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason)) ?? false
    }
}
