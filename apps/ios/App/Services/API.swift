import Foundation

struct APIError: LocalizedError {
    let status: Int
    let message: String
    let details: [String]

    var errorDescription: String? { message }
}

private struct ErrorBody: Decodable {
    let error: String?
    let details: [String]?
}

/// The Baseland engine over HTTP, authenticated with the Supabase session.
struct EngineAPI: Sendable {
    let base: URL
    let token: @Sendable () async throws -> String

    private let decoder = JSONCoding.decoder()

    // MARK: Account

    func me() async throws -> Me { try await send("GET", "/v1/me") }

    func connectCoinbase(keyJSON: Data) async throws {
        let _: JSONValue = try await send("POST", "/v1/credentials", raw: keyJSON)
    }

    func disconnectCoinbase() async throws {
        let _: JSONValue = try await send("DELETE", "/v1/credentials")
    }

    // MARK: Harness (the Baseland MCP in Claude Code)

    func harness() async throws -> HarnessLink { try await send("GET", "/v1/harness") }

    /// Mints a token, returned only this once. Replaces any earlier one.
    func mintHarnessToken() async throws -> HarnessLink { try await send("POST", "/v1/harness") }

    func disconnectHarness() async throws -> HarnessLink { try await send("DELETE", "/v1/harness") }

    // MARK: Plays

    func plays() async throws -> [Play] {
        struct R: Decodable { let plays: [Play] }
        return try await (send("GET", "/v1/plays") as R).plays
    }

    func play(_ id: String) async throws -> (Play, [TapeRow]) {
        struct R: Decodable { let play: Play; let tape: [TapeRow] }
        let r: R = try await send("GET", "/v1/plays/\(id)")
        return (r.play, r.tape)
    }

    func createPlay(cartridge: JSONValue, mode: String) async throws -> Play {
        try await send("POST", "/v1/plays", body: ["cartridge": cartridge, "mode": .string(mode)])
    }

    /// approve, skip, pause, resume, kill
    func act(_ id: String, _ action: String) async throws -> Play {
        try await send("POST", "/v1/plays/\(id)/\(action)")
    }

    func killAll() async throws -> Int {
        struct R: Decodable { let stopped: Int }
        return try await (send("POST", "/v1/kill-all") as R).stopped
    }

    // MARK: Words → Plays

    func deck(refresh: Bool) async throws -> [DeckCard] {
        struct R: Decodable { let cards: [DeckCard] }
        return try await (send("GET", refresh ? "/v1/deck?refresh=1" : "/v1/deck") as R).cards
    }

    func arm(card: String, cartridge: JSONValue?, mode: String) async throws -> Play {
        var body: [String: JSONValue] = ["mode": .string(mode)]
        if let cartridge { body["cartridge"] = cartridge }
        return try await send("POST", "/v1/deck/\(card)/arm", body: body)
    }

    func skip(card: String) async throws {
        let _: JSONValue = try await send("POST", "/v1/deck/\(card)/skip")
    }

    func draft(text: String) async throws -> JSONValue {
        struct R: Decodable { let cartridge: JSONValue }
        return try await (send("POST", "/v1/plays/draft", body: ["text": .string(text)]) as R).cartridge
    }

    /// Validates an edited cartridge and regenerates its sentence.
    func preview(cartridge: JSONValue) async throws -> (valid: Bool, cartridge: JSONValue?, issues: [String]) {
        struct R: Decodable { let valid: Bool; let cartridge: JSONValue?; let issues: [String]? }
        let r: R = try await send("POST", "/v1/cartridges/preview", body: ["cartridge": cartridge])
        return (r.valid, r.cartridge, r.issues ?? [])
    }

    // MARK: The Rig

    func rig() async throws -> (RigDTO, RigCatalog) {
        struct R: Decodable { let rig: RigDTO; let catalog: RigCatalog }
        let r: R = try await send("GET", "/v1/rig")
        return (r.rig, r.catalog)
    }

    func saveRig(_ rig: RigDTO) async throws -> RigDTO {
        struct R: Decodable { let rig: RigDTO }
        let data = try JSONCoding.encoder.encode(["rig": rig])
        return try await (send("PUT", "/v1/rig", raw: data) as R).rig
    }

    func account() async throws -> Account { try await send("GET", "/v1/account") }

    func replay(cartridge: JSONValue, days: Double) async throws -> ReplayResult {
        try await send("POST", "/v1/replay", body: ["cartridge": cartridge, "days": .number(days)])
    }

    // MARK: Transport

    private func send<T: Decodable>(_ method: String, _ path: String, body: [String: JSONValue]? = nil, raw: Data? = nil) async throws -> T {
        var req = URLRequest(url: URL(string: path, relativeTo: base)!)
        req.httpMethod = method
        req.timeoutInterval = 60
        req.setValue("Bearer \(try await token())", forHTTPHeaderField: "Authorization")
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONCoding.encoder.encode(body)
        } else if let raw {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = raw
        }
        let (data, response) = try await URLSession.shared.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let e = try? decoder.decode(ErrorBody.self, from: data)
            throw APIError(status: status, message: e?.error ?? "The engine answered \(status).", details: e?.details ?? [])
        }
        return try decoder.decode(T.self, from: data)
    }
}
