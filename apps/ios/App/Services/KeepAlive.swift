import AVFoundation
import Foundation

/// HACKATHON-ONLY (docs/production-checklist.md, Blocker): plays silence in
/// the background while a Play is live, so iOS doesn't suspend the app and
/// Realtime keeps updating the Live Activity on the lock screen. It mixes with
/// other audio, so it never interrupts the person's music. The real fix is
/// APNs Live Activity pushes, which need a paid developer account.
@MainActor
final class KeepAlive {
    private var player: AVAudioPlayer?
    private(set) var isRunning = false

    func set(_ on: Bool) {
        on ? start() : stop()
    }

    private func start() {
        guard !isRunning else { return }
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, options: [.mixWithOthers])
            try AVAudioSession.sharedInstance().setActive(true)
            let p = try AVAudioPlayer(data: Self.silentWAV())
            p.numberOfLoops = -1
            p.volume = 0
            p.play()
            player = p
            isRunning = true
        } catch {
            isRunning = false
        }
    }

    private func stop() {
        player?.stop()
        player = nil
        isRunning = false
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
    }

    /// One second of 8 kHz mono 16-bit silence, as a WAV.
    private static func silentWAV() -> Data {
        let sampleRate: UInt32 = 8000
        let samples = Data(count: Int(sampleRate) * 2)
        var d = Data()
        func le<T: FixedWidthInteger>(_ v: T) { withUnsafeBytes(of: v.littleEndian) { d.append(contentsOf: $0) } }
        d.append(contentsOf: Array("RIFF".utf8)); le(UInt32(36 + samples.count))
        d.append(contentsOf: Array("WAVEfmt ".utf8)); le(UInt32(16)); le(UInt16(1)); le(UInt16(1))
        le(sampleRate); le(sampleRate * 2); le(UInt16(2)); le(UInt16(16))
        d.append(contentsOf: Array("data".utf8)); le(UInt32(samples.count))
        d.append(samples)
        return d
    }
}
