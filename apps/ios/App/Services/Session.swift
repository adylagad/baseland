import Foundation
import Supabase

/// Supabase sign-in (anonymous; Sign in with Apple needs a paid developer
/// account). Play and Tape updates stream from SpacetimeDB through the engine.
@MainActor
final class Session {
    let client = SupabaseClient(
        supabaseURL: Config.supabaseURL,
        supabaseKey: Config.supabaseKey,
        options: .init(auth: .init(emitLocalSessionAsInitialSession: true))
    )
    private var eventTask: Task<Void, Never>?

    var userId: String? { client.auth.currentUser?.id.uuidString.lowercased() }

    func signInAnonymously() async throws -> String {
        let session = try await client.auth.signInAnonymously()
        return session.user.id.uuidString.lowercased()
    }

    nonisolated func accessToken() async throws -> String {
        try await client.auth.session.accessToken
    }

    private struct LiveEvent: Decodable {
        let type: String
        let play: Play?
        let tape: TapeRow?
    }

    /// Streams SpacetimeDB transactions through the authenticated engine.
    func listen(userId: String, onPlay: @escaping @Sendable (Play) -> Void, onTape: @escaping @Sendable (TapeRow) -> Void) async {
        await stopListening()
        eventTask = Task { [weak self] in
            while !Task.isCancelled {
                do {
                    guard let self else { return }
                    var req = URLRequest(url: URL(string: "/v1/events", relativeTo: Config.engineURL)!)
                    req.setValue("Bearer \(try await accessToken())", forHTTPHeaderField: "Authorization")
                    req.timeoutInterval = 60 * 60
                    let (bytes, response) = try await URLSession.shared.bytes(for: req)
                    guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
                    for try await line in bytes.lines {
                        if Task.isCancelled { return }
                        guard line.hasPrefix("data: "), let data = String(line.dropFirst(6)).data(using: .utf8),
                              let event = try? JSONCoding.decoder().decode(LiveEvent.self, from: data) else { continue }
                        if event.type == "play", let play = event.play, play.userId == userId { onPlay(play) }
                        if event.type == "tape", let tape = event.tape { onTape(tape) }
                    }
                } catch {
                    if Task.isCancelled { return }
                }
                try? await Task.sleep(for: .seconds(2))
            }
        }
    }

    func stopListening() async {
        eventTask?.cancel()
        eventTask = nil
    }

    func signOut() async {
        await stopListening()
        try? await client.auth.signOut()
    }
}
