import Foundation
import Supabase

/// Supabase sign-in (anonymous; Sign in with Apple needs a paid developer
/// account) and the Realtime stream of this user's Plays and Tape.
@MainActor
final class Session {
    let client = SupabaseClient(
        supabaseURL: Config.supabaseURL,
        supabaseKey: Config.supabaseKey,
        options: .init(auth: .init(emitLocalSessionAsInitialSession: true))
    )
    private var channel: RealtimeChannelV2?
    private var subscriptions: [RealtimeSubscription] = []

    var userId: String? { client.auth.currentUser?.id.uuidString.lowercased() }

    func signInAnonymously() async throws -> String {
        let session = try await client.auth.signInAnonymously()
        return session.user.id.uuidString.lowercased()
    }

    nonisolated func accessToken() async throws -> String {
        try await client.auth.session.accessToken
    }

    /// Streams row changes for this user's Plays and new Tape rows.
    func listen(userId: String, onPlay: @escaping @Sendable (Play) -> Void, onTape: @escaping @Sendable (TapeRow) -> Void) async {
        await stopListening()
        let channel = client.channel("baseland-\(userId)")
        let decoder = JSONCoding.decoder(snakeCase: true)
        subscriptions = [
            channel.onPostgresChange(AnyAction.self, schema: "public", table: "plays", filter: .eq("user_id", value: userId)) { action in
                switch action {
                case .insert(let a): if let p = try? a.decodeRecord(as: Play.self, decoder: decoder) { onPlay(p) }
                case .update(let a): if let p = try? a.decodeRecord(as: Play.self, decoder: decoder) { onPlay(p) }
                default: break
                }
            },
            channel.onPostgresChange(InsertAction.self, schema: "public", table: "tape", filter: .eq("user_id", value: userId)) { insert in
                if let t = try? insert.decodeRecord(as: TapeRow.self, decoder: decoder) { onTape(t) }
            },
        ]
        self.channel = channel
        try? await channel.subscribeWithError()
    }

    func stopListening() async {
        subscriptions.removeAll()
        if let channel { await client.removeChannel(channel) }
        channel = nil
    }

    func signOut() async {
        await stopListening()
        try? await client.auth.signOut()
    }
}
