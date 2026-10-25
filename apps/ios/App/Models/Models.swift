import BaselandKit
import Foundation

// Mirrors of the engine's JSON. The same types decode Realtime rows: those
// arrive snake_case and are decoded with `.convertFromSnakeCase`.

struct SentencePart: Codable, Hashable, Sendable {
    var kind: String
    var text: String?
    var id: String?
    var field: String?
    var label: String?

    var isChip: Bool { kind == "chip" }
}

struct PlayStatusDTO: Codable, Hashable, Sendable {
    var phase: String?
    var symbol: String?
    var headline: String?
    var progress: Double?
    var price: Double?
    var anchorPrice: Double?
    var pnlUsd: Double?
    var pendingAmountUsd: Double?
}

struct PendingDTO: Codable, Hashable, Sendable {
    var side: String
    var product: String
    var quoteUsd: Double?
    var baseSize: Double?
    var estUsd: Double
    var headline: String
}

struct Play: Codable, Identifiable, Hashable, Sendable {
    var id: String
    var userId: String
    var title: String
    var sentence: [SentencePart]
    var spec: JSONValue
    var mode: String
    var state: PlayStage
    var stateReason: String?
    var pending: PendingDTO?
    var status: PlayStatusDTO
    var windowStart: Date
    var windowEnd: Date
    var createdAt: Date?
    var updatedAt: Date?

    var isGhost: Bool { mode == "ghost" }
    var symbol: String { status.symbol ?? spec[path: "action.product"]?.string?.split(separator: "-").first.map(String.init) ?? "?" }
    var headline: String { status.headline?.isEmpty == false ? status.headline! : (stateReason ?? state.label) }
}

struct TapeRow: Codable, Identifiable, Hashable, Sendable {
    var id: Int
    var playId: String
    var at: Date
    var kind: String
    var simulated: Bool
    var costUsdc: Double
    var payload: JSONValue

    enum CodingKeys: String, CodingKey { case id, playId, at, kind, simulated, costUsdc, payload }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(Int.self, forKey: .id)
        playId = try c.decode(String.self, forKey: .playId)
        at = try c.decode(Date.self, forKey: .at)
        kind = try c.decode(String.self, forKey: .kind)
        simulated = try c.decode(Bool.self, forKey: .simulated)
        // numeric(14,6) can arrive as a number (engine) or a string (Realtime).
        if let n = try? c.decode(Double.self, forKey: .costUsdc) { costUsdc = n }
        else if let s = try? c.decode(String.self, forKey: .costUsdc) { costUsdc = Double(s) ?? 0 }
        else { costUsdc = 0 }
        payload = (try? c.decode(JSONValue.self, forKey: .payload)) ?? .object([:])
    }
}

struct DeckCard: Codable, Identifiable, Hashable, Sendable {
    var id: String
    var title: String
    var sentence: [SentencePart]
    var spec: JSONValue
    var rationale: String
    var status: String
}

struct Me: Codable, Sendable {
    struct Coinbase: Codable, Sendable {
        struct Portfolio: Codable, Sendable { var uuid: String; var name: String }
        var connected: Bool
        var portfolio: Portfolio?
    }
    var userId: String
    var ghostCashUsd: Double
    var coinbase: Coinbase
    var liveTradingEnabled: Bool
}

/// A Play being composed: a Deck card, or a draft from words.
struct Draft: Identifiable, Hashable, Sendable {
    var id: String
    var cardId: String?
    var cartridge: JSONValue
    var sentence: [SentencePart]
    var rationale: String?

    var title: String { cartridge[path: "title"]?.string ?? "Play" }
}

/// Whether a harness (the Baseland MCP) can act for this user. `token` is
/// present only in the response that minted it.
struct HarnessLink: Codable, Sendable {
    var connected: Bool
    var createdAt: Date?
    var lastUsedAt: Date?
    var token: String?
}

enum JSONCoding {
    static func decoder(snakeCase: Bool = false) -> JSONDecoder {
        let d = JSONDecoder()
        if snakeCase { d.keyDecodingStrategy = .convertFromSnakeCase }
        d.dateDecodingStrategy = .custom { decoder in
            let s = try decoder.singleValueContainer().decode(String.self)
            if let date = parseDate(s) { return date }
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "bad date \(s)"))
        }
        return d
    }

    static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    /// Accepts "…Z", "…+00:00", and 0-9 fractional digits (Postgres sends 6).
    static func parseDate(_ raw: String) -> Date? {
        var s = raw.replacingOccurrences(of: " ", with: "T")
        if let dot = s.firstIndex(of: ".") {
            let fracEnd = s[dot...].dropFirst().firstIndex { !$0.isNumber } ?? s.endIndex
            let digits = s[s.index(after: dot)..<fracEnd]
            s.replaceSubrange(s.index(after: dot)..<fracEnd, with: String((digits + "000").prefix(3)))
        }
        let f = ISO8601DateFormatter()
        f.formatOptions = s.contains(".") ? [.withInternetDateTime, .withFractionalSeconds] : [.withInternetDateTime]
        return f.date(from: s)
    }
}
