import Foundation

/// Any JSON. Cartridges stay as JSON in the app so a chip can edit the exact
/// field it points at (`action.quoteUsd`) without the app modelling every
/// cartridge shape; the engine validates.
enum JSONValue: Codable, Hashable, Sendable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let b = try? c.decode(Bool.self) { self = .bool(b) }
        else if let n = try? c.decode(Double.self) { self = .number(n) }
        else if let s = try? c.decode(String.self) { self = .string(s) }
        else if let a = try? c.decode([JSONValue].self) { self = .array(a) }
        else { self = .object(try c.decode([String: JSONValue].self)) }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .string(let s): try c.encode(s)
        case .number(let n):
            // Whole numbers encode as integers (zod's int() and literal(1) care).
            if n.rounded() == n, abs(n) < 1e15 { try c.encode(Int64(n)) } else { try c.encode(n) }
        case .bool(let b): try c.encode(b)
        case .object(let o): try c.encode(o)
        case .array(let a): try c.encode(a)
        case .null: try c.encodeNil()
        }
    }

    subscript(path path: String) -> JSONValue? {
        get {
            path.split(separator: ".").reduce(Optional(self)) { node, key in
                if case .object(let o)? = node { return o[String(key)] }
                return nil
            }
        }
        set {
            let keys = path.split(separator: ".").map(String.init)
            self = Self.setting(self, keys[...], to: newValue ?? .null)
        }
    }

    private static func setting(_ node: JSONValue, _ keys: ArraySlice<String>, to value: JSONValue) -> JSONValue {
        guard let key = keys.first else { return value }
        var o: [String: JSONValue] = if case .object(let existing) = node { existing } else { [:] }
        o[key] = setting(o[key] ?? .null, keys.dropFirst(), to: value)
        return .object(o)
    }

    var double: Double? {
        switch self {
        case .number(let n): n
        case .string(let s): Double(s)
        default: nil
        }
    }

    var string: String? {
        switch self {
        case .string(let s): s
        case .number(let n): n.rounded() == n ? String(Int64(n)) : String(n)
        default: nil
        }
    }
}
