import Foundation

/// Public configuration from Info.plist (project.yml). Nothing secret lives
/// in the app: the engine holds every key except Supabase's publishable one.
enum Config {
    static let engineURL = url("BaselandEngineURL")
    static let supabaseURL = url("BaselandSupabaseURL")
    static let supabaseKey = Bundle.main.object(forInfoDictionaryKey: "BaselandSupabaseKey") as! String

    private static func url(_ key: String) -> URL {
        // Launch argument override for testing against a local engine:
        // -BaselandEngineURL http://localhost:8787
        if let override = UserDefaults.standard.string(forKey: key), let u = URL(string: override) { return u }
        return URL(string: Bundle.main.object(forInfoDictionaryKey: key) as! String)!
    }
}
