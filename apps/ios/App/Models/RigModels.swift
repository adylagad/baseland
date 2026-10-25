import Foundation

/// The user's Rig, mirrored from the engine (packages/play-schema rig.ts).
struct RigDTO: Codable, Equatable, Sendable {
    struct Brain: Codable, Equatable, Sendable { var model: String; var effort: String }
    struct Senses: Codable, Equatable, Sendable { var enabled: [String]; var budgetUsdc: Double }
    struct Instincts: Codable, Equatable, Sendable { var overrides: [String: String] }
    struct Hands: Codable, Equatable, Sendable { var assets: [String]; var ask: JSONValue }
    struct Leash: Codable, Equatable, Sendable { var maxOrderUsd: Double; var maxPlayUsd: Double; var maxEvidenceUsdc: Double }

    var brain: Brain
    var senses: Senses
    var instincts: Instincts
    var hands: Hands
    var leash: Leash
}

struct RigCatalog: Codable, Sendable {
    struct Model: Codable, Identifiable, Sendable { var id: String; var label: String }
    struct Sense: Codable, Identifiable, Sendable {
        var id: String
        var label: String
        var provider: String
        var use: String
        var assets: String
        var priceUsdc: Double
    }
    struct Instinct: Codable, Identifiable, Sendable { var id: String; var text: String }

    var models: [Model]
    var senses: [Sense]
    var instincts: [Instinct]
    var assets: [String]
}

struct Account: Codable, Sendable {
    struct Position: Codable, Identifiable, Sendable {
        var product: String
        var symbol: String
        var base: Double
        var avgPrice: Double?
        var valueUsd: Double?
        var pnlUsd: Double?
        var id: String { product }
    }
    struct Ghost: Codable, Sendable { var cashUsd: Double; var positions: [Position] }

    var ghost: Ghost
    var live: JSONValue?
}

struct ReplayResult: Codable, Sendable {
    struct Point: Codable, Sendable, Identifiable { var t: Date; var close: Double; var id: Date { t } }
    struct Mark: Codable, Sendable { var at: Date; var price: Double }
    struct Entry: Codable, Sendable { var at: Date; var price: Double; var base: Double; var feeUsd: Double; var spentUsd: Double }
    struct Exit: Codable, Sendable { var at: Date; var price: Double; var reason: String; var feeUsd: Double }

    var product: String
    var granularity: String
    var from: Date
    var to: Date
    var fired: Bool
    var trigger: Mark?
    var entry: Entry?
    var exit: Exit?
    var pnlUsd: Double
    var holding: Bool
    var series: [Point]
    var notes: [String]
}
