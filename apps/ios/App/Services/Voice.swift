import AVFoundation
import Foundation
import Speech

/// Hold-to-talk transcription, on device when the iPhone supports it.
@MainActor
@Observable
final class Voice {
    private(set) var transcript = ""
    private(set) var isListening = false
    private(set) var unavailableReason: String?

    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?

    func start() async {
        transcript = ""
        unavailableReason = nil
        let speech = await withCheckedContinuation { c in SFSpeechRecognizer.requestAuthorization { c.resume(returning: $0) } }
        guard speech == .authorized else { unavailableReason = "Speech recognition is off for Baseland in Settings."; return }
        guard await AVAudioApplication.requestRecordPermission() else { unavailableReason = "The microphone is off for Baseland in Settings."; return }
        guard let recognizer, recognizer.isAvailable else { unavailableReason = "Speech recognition isn't available right now."; return }

        do {
            try AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .measurement, options: [.duckOthers, .defaultToSpeaker, .mixWithOthers])
            try AVAudioSession.sharedInstance().setActive(true)
            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }
            self.request = request
            let input = engine.inputNode
            input.installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0)) { buffer, _ in
                request.append(buffer)
            }
            engine.prepare()
            try engine.start()
            isListening = true
            task = recognizer.recognitionTask(with: request) { [weak self] result, _ in
                guard let text = result?.bestTranscription.formattedString else { return }
                Task { @MainActor in self?.transcript = text }
            }
        } catch {
            unavailableReason = "Couldn't start listening."
            stop()
        }
    }

    func stop() {
        engine.stop()
        engine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        task?.finish()
        request = nil
        task = nil
        isListening = false
    }
}
