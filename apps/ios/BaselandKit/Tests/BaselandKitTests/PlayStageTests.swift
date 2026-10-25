import Foundation
import Testing
@testable import BaselandKit

@Suite struct PlayStageTests {
    // Must match the `plays.state` check constraint in
    // supabase/migrations/20261025015139_core_schema.sql exactly.
    @Test func rawValuesMatchTheDatabase() {
        #expect(PlayStage.allCases.map(\.rawValue) == [
            "armed", "watching", "deciding", "awaiting", "executing",
            "done", "paused", "killed", "expired", "failed",
        ])
    }

    @Test func terminalStages() {
        #expect(PlayStage.allCases.filter(\.isTerminal) == [.done, .killed, .expired, .failed])
    }

    @Test func contentStateClampsProgressAndRoundTrips() throws {
        let state = PlayState(stage: .watching, headline: "x", progress: 1.7, endsAt: Date(timeIntervalSince1970: 0))
        #expect(state.progress == 1)
        let decoded = try JSONDecoder().decode(PlayState.self, from: JSONEncoder().encode(state))
        #expect(decoded == state)
    }

    @Test func demoPlayIsAlwaysGhost() {
        #expect(DemoPlay.attributes.isGhost)
    }

    @Test func moneyFormatting() {
        #expect(Format.usd(3) == "$3.00")
        #expect(Format.usd(0.12, signed: true) == "+$0.12")
        #expect(Format.usd(-1.5, signed: true) == "−$1.50")
    }
}
