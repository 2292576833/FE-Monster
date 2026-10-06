import Accelerate
import AppKit
import AVFoundation
import AudioToolbox
import CoreMedia
import CoreVideo
import ScreenCaptureKit
import UniformTypeIdentifiers

/// ScreenCaptureKit supplies screen/system sound on macOS 13; AVAssetWriter
/// encodes directly to disk, so the WebView never owns a recording-sized Blob.
@MainActor
final class MacCaptureService: NSObject, SCStreamDelegate {
    private weak var window: NSWindow?
    private let send: ([String: Any]) -> Void
    private var recordingStream: SCStream?
    private var recordingAudioStream: SCStream?
    private var recordingOutput: MacCaptureOutput?
    private var audioStream: SCStream?
    private var audioOutput: MacCaptureOutput?
    private var microphone: AVAudioEngine?
    private var microphoneOutput: MacCaptureOutput?
    private var operation: Task<Void, Never>?
    private var operationAction = ""
    private var operationRequestID = ""
    private var generation = 0
    private var backendURL: URL?
    private var pcmRequest: URLSessionDataTask?
    private var lastSpectrumTime = 0.0
    private var files: [String: URL] = [:]
    private let preview = MacRecordingPreviewServer()
    private let session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.connectionProxyDictionary = [:]
        configuration.httpCookieStorage = nil
        configuration.timeoutIntervalForRequest = 1
        return URLSession(configuration: configuration)
    }()

    init(window: NSWindow?, send: @escaping ([String: Any]) -> Void) {
        self.window = window
        self.send = send
        super.init()
    }

    func handle(_ payload: [String: Any]) {
        let action = (payload["action"] as? String ?? "").lowercased()
        let requestID = payload["requestId"] as? String ?? ""
        if let raw = payload["backendURL"] as? String, let url = URL(string: raw),
           url.scheme == "http", ["127.0.0.1", "localhost", "::1"].contains(url.host ?? ""),
           url.user == nil, url.password == nil {
            backendURL = URLComponents(url: url, resolvingAgainstBaseURL: false).flatMap { components in
                var root = components
                root.path = "/"; root.query = nil; root.fragment = nil
                return root.url
            }
        }
        if action == "cancel" {
            if operationAction.hasPrefix("recording-") { invalidatePendingOperation() }
            cancelRecording()
            reply(requestID, values: ["mode": "idle"])
            return
        }
        if action == "system-audio-stop" {
            if operationAction == "system-audio-start" { invalidatePendingOperation() }
            stopSystemAudio()
            reply(requestID, values: ["systemAudio": false])
            return
        }
        if action == "microphone-stop" {
            if operationAction == "microphone-start" { invalidatePendingOperation() }
            stopMicrophone()
            reply(requestID, values: ["microphone": false])
            return
        }
        guard operation == nil else {
            reply(requestID, error: CaptureError.busy)
            return
        }
        let operationGeneration = generation
        operationAction = action; operationRequestID = requestID
        operation = Task { [weak self] in
            guard let self else { return }
            defer { if self.generation == operationGeneration { self.operation = nil; self.operationAction = ""; self.operationRequestID = "" } }
            do {
                let values: [String: Any]
                switch action {
                case "recording-start": values = try await self.startRecording(payload, generation: operationGeneration)
                case "recording-pause":
                    guard let output = self.recordingOutput else { throw CaptureError.noRecording }
                    output.setPaused(true)
                    values = ["mode": "paused", "elapsedMs": output.elapsedMilliseconds]
                case "recording-resume":
                    guard let output = self.recordingOutput else { throw CaptureError.noRecording }
                    output.setPaused(false)
                    values = ["mode": "recording", "elapsedMs": output.elapsedMilliseconds]
                case "recording-finish": values = try await self.finishRecording(generation: operationGeneration)
                case "recording-save": values = try await self.saveRecording(payload)
                case "system-audio-start": values = try await self.startSystemAudio(generation: operationGeneration)
                case "microphone-start": values = try await self.startMicrophone(generation: operationGeneration)
                case "permissions": values = self.permissions()
                case "request-permission": values = await self.requestMediaPermission(payload["kind"] as? String ?? "")
                default: throw CaptureError.unknownAction
                }
                guard self.generation == operationGeneration, !Task.isCancelled else { return }
                self.reply(requestID, values: values)
            } catch {
                guard self.generation == operationGeneration else { return }
                self.reply(requestID, error: error)
            }
        }
    }

    /// Called on navigation, renderer crash and application termination. Only
    /// incomplete files owned by this capture session are removed.
    func shutdown() {
        invalidatePendingOperation()
        cancelRecording()
        stopSystemAudio()
        stopMicrophone()
        pcmRequest?.cancel(); pcmRequest = nil
        preview.stop()
        files.removeAll()
        lastSpectrumTime = 0
    }

    private func invalidatePendingOperation() {
        generation += 1
        operation?.cancel(); operation = nil
        if !operationRequestID.isEmpty { reply(operationRequestID, error: CancellationError()) }
        operationAction = ""; operationRequestID = ""
        pcmRequest?.cancel(); pcmRequest = nil
    }

    private func requireScreenPermission() throws {
        guard CGPreflightScreenCaptureAccess() || CGRequestScreenCaptureAccess() else {
            throw CaptureError.screenPermission
        }
    }

    private func startRecording(_ payload: [String: Any], generation token: Int) async throws -> [String: Any] {
        guard recordingOutput == nil else { throw CaptureError.busy }
        try requireScreenPermission()
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        guard generation == token, !Task.isCancelled else { throw CancellationError() }
        guard let number = window?.windowNumber,
              let captureWindow = content.windows.first(where: { $0.windowID == CGWindowID(number) }) else {
            throw CaptureError.windowMissing
        }
        let fps = boundedInteger(payload["fps"], fallback: 60, minimum: 24, maximum: 60)
        let resolution = payload["resolution"] as? [String: Any] ?? [:]
        let scale = window?.screen?.backingScaleFactor ?? 2
        let nativeWidth = Int(captureWindow.frame.width * scale)
        let nativeHeight = Int(captureWindow.frame.height * scale)
        let width = boundedInteger(resolution["width"], fallback: nativeWidth, minimum: 128, maximum: 3840) / 2 * 2
        let height = boundedInteger(resolution["height"], fallback: nativeHeight, minimum: 128, maximum: 2160) / 2 * 2
        let configuration = SCStreamConfiguration()
        configuration.width = width; configuration.height = height
        configuration.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(fps))
        configuration.pixelFormat = kCVPixelFormatType_32BGRA
        configuration.queueDepth = 3
        configuration.showsCursor = true
        let capturesAudio = payload["audio"] as? Bool ?? true
        configuration.capturesAudio = false
        configuration.sampleRate = 48_000; configuration.channelCount = 2
        configuration.excludesCurrentProcessAudio = false
        let root = FileManager.default.urls(for: .moviesDirectory, in: .userDomainMask).first
            ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Movies")
        let directory = root.appendingPathComponent("FE Monster", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let filename = "fe-monster-\(UUID().uuidString.lowercased()).mp4"
        let file = directory.appendingPathComponent(filename)
        let output = try makeOutput(file: file, width: width, height: height, fps: fps,
            bitrate: boundedInteger(payload["bitrate"], fallback: 36_000_000, minimum: 1_000_000, maximum: 80_000_000),
            audio: capturesAudio, source: "recording")
        let stream = SCStream(filter: SCContentFilter(desktopIndependentWindow: captureWindow), configuration: configuration, delegate: self)
        recordingStream = stream; recordingOutput = output
        var soundStream: SCStream?
        do {
            try stream.addStreamOutput(output, type: .screen, sampleHandlerQueue: output.queue)
            if capturesAudio {
                // SCK's single-window audio filter captures only the window's app.
                // CoreAudio playback belongs to our Java child, so use a separate
                // system-audio filter and feed both streams to this writer queue.
                guard let display = content.displays.first else { throw CaptureError.windowMissing }
                let soundConfiguration = SCStreamConfiguration()
                soundConfiguration.width = 16; soundConfiguration.height = 16
                soundConfiguration.minimumFrameInterval = CMTime(value: 1, timescale: 2)
                soundConfiguration.capturesAudio = true
                soundConfiguration.sampleRate = 48_000; soundConfiguration.channelCount = 2
                soundConfiguration.excludesCurrentProcessAudio = false
                let sound = SCStream(filter: SCContentFilter(display: display, excludingApplications: [], exceptingWindows: []),
                    configuration: soundConfiguration, delegate: self)
                soundStream = sound; recordingAudioStream = sound
                try sound.addStreamOutput(output, type: .audio, sampleHandlerQueue: output.queue)
            }
            try await stream.startCapture()
            guard generation == token, !Task.isCancelled else { throw CancellationError() }
            if let soundStream { try await soundStream.startCapture() }
            guard generation == token, !Task.isCancelled else { throw CancellationError() }
            return ["mode": "recording", "fileName": filename, "elapsedMs": 0, "audio": capturesAudio]
        } catch {
            if recordingStream === stream { recordingStream = nil; recordingOutput = nil }
            if recordingAudioStream === soundStream { recordingAudioStream = nil }
            stream.stopCapture { _ in }
            soundStream?.stopCapture { _ in }
            output.cancel()
            throw error
        }
    }

    private func finishRecording(generation token: Int) async throws -> [String: Any] {
        guard let stream = recordingStream, let output = recordingOutput else { throw CaptureError.noRecording }
        // Remove our reference before stop so didStopWithError cannot recursively finish.
        let soundStream = recordingAudioStream
        recordingStream = nil
        recordingAudioStream = nil
        if let soundStream { try? await soundStream.stopCapture() }
        do { try await stream.stopCapture() } catch { /* Finalize buffered frames even when the display disconnected. */ }
        let file: URL
        do { file = try await output.finish() }
        catch {
            if recordingOutput === output { recordingOutput = nil }
            throw error
        }
        if recordingOutput === output { recordingOutput = nil }
        guard generation == token, !Task.isCancelled else { throw CancellationError() }
        let fileToken = UUID().uuidString.lowercased()
        files[fileToken] = file
        // Saving the recording must succeed even if the optional preview listener
        // cannot bind a port. The native Save As action still has the file token.
        let previewURL = try? await preview.register(file: file, token: fileToken)
        return ["mode": "idle", "fileName": file.lastPathComponent, "fileToken": fileToken,
            "previewURL": previewURL?.absoluteString ?? "", "elapsedMs": output.elapsedMilliseconds,
            "saved": true, "location": "Movies/FE Monster"]
    }

    private func saveRecording(_ payload: [String: Any]) async throws -> [String: Any] {
        guard let token = payload["fileToken"] as? String, let source = files[token],
              FileManager.default.fileExists(atPath: source.path) else { throw CaptureError.fileMissing }
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.mpeg4Movie]
        panel.nameFieldStringValue = source.lastPathComponent
        panel.canCreateDirectories = true
        let panelWindow = NSApp.keyWindow ?? (window?.isVisible == true ? window : nil)
        let response = await withCheckedContinuation { continuation in
            if let panelWindow {
                panel.beginSheetModal(for: panelWindow) { continuation.resume(returning: $0) }
            } else { continuation.resume(returning: panel.runModal()) }
        }
        guard response == .OK, let destination = panel.url else { return ["cancelled": true] }
        if destination.standardizedFileURL != source.standardizedFileURL {
            let temporary = destination.deletingLastPathComponent().appendingPathComponent(".fe-monster-\(UUID().uuidString).mp4")
            do {
                try FileManager.default.copyItem(at: source, to: temporary)
                if FileManager.default.fileExists(atPath: destination.path) {
                    _ = try FileManager.default.replaceItemAt(destination, withItemAt: temporary)
                } else { try FileManager.default.moveItem(at: temporary, to: destination) }
            } catch {
                try? FileManager.default.removeItem(at: temporary)
                throw error
            }
        }
        return ["saved": true, "fileName": destination.lastPathComponent]
    }

    private func startSystemAudio(generation token: Int) async throws -> [String: Any] {
        if audioStream != nil { return ["systemAudio": true] }
        try requireScreenPermission()
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        guard generation == token, !Task.isCancelled else { throw CancellationError() }
        guard let display = content.displays.first else { throw CaptureError.windowMissing }
        let configuration = SCStreamConfiguration()
        configuration.width = 16; configuration.height = 16
        configuration.minimumFrameInterval = CMTime(value: 1, timescale: 2)
        configuration.capturesAudio = true
        configuration.sampleRate = 48_000; configuration.channelCount = 2
        configuration.excludesCurrentProcessAudio = false
        let output = try makeOutput(source: "system")
        let stream = SCStream(filter: SCContentFilter(display: display, excludingApplications: [], exceptingWindows: []),
            configuration: configuration, delegate: self)
        try stream.addStreamOutput(output, type: .audio, sampleHandlerQueue: output.queue)
        audioStream = stream; audioOutput = output
        do {
            try await stream.startCapture()
            guard generation == token, !Task.isCancelled else { throw CancellationError() }
            send(["type": "fe-mac-capture-state", "systemAudio": true])
            return ["systemAudio": true]
        } catch {
            if audioStream === stream { audioStream = nil; audioOutput = nil }
            stream.stopCapture { _ in }
            output.cancel()
            throw error
        }
    }

    private func startMicrophone(generation token: Int) async throws -> [String: Any] {
        if microphone != nil { return ["microphone": true] }
        let permission = await requestMediaPermission("microphone")
        guard permission["granted"] as? Bool == true else { throw CaptureError.microphonePermission }
        guard generation == token, !Task.isCancelled else { throw CancellationError() }
        let engine = AVAudioEngine()
        let output = try makeOutput(source: "microphone")
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else { throw CaptureError.noInput }
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in output.consumeMicrophone(buffer) }
        do { try engine.start() } catch { input.removeTap(onBus: 0); throw error }
        microphone = engine; microphoneOutput = output
        return ["microphone": true]
    }

    private func makeOutput(file: URL? = nil, width: Int = 0, height: Int = 0, fps: Int = 60,
        bitrate: Int = 36_000_000, audio: Bool = false, source: String) throws -> MacCaptureOutput {
        try MacCaptureOutput(file: file, width: width, height: height, fps: fps, bitrate: bitrate, audio: audio,
            onAnalysis: { [weak self] spectrum, pcm, frames, channels, rate in
                Task { @MainActor in self?.publishAnalysis(spectrum, pcm: pcm, frames: frames, channels: channels, rate: rate, source: source) }
            }, onFailure: { [weak self] error in
                Task { @MainActor in
                    guard let self, source != "recording" || self.recordingOutput?.recordedFile == file else { return }
                    self.send(["type": "fe-mac-capture-error", "source": source, "error": error.localizedDescription])
                    if source == "recording", self.operation == nil { self.handle(["action": "recording-finish", "requestId": ""]) }
                }
            })
    }

    private func publishAnalysis(_ spectrum: [String: Any], pcm: Data, frames: Int, channels: Int, rate: Int, source: String) {
        guard (source == "system" && audioStream != nil)
            || (source == "recording" && recordingOutput != nil && audioStream == nil)
            || (source == "microphone" && microphone != nil && audioStream == nil && recordingOutput == nil) else { return }
        let now = ProcessInfo.processInfo.systemUptime
        guard now - lastSpectrumTime >= 0.045 else { return }
        lastSpectrumTime = now
        var message = spectrum
        message["type"] = "fe-mac-capture-spectrum"; message["source"] = source
        send(message)
        guard pcmRequest == nil, let base = backendURL,
              var components = URLComponents(url: base.appendingPathComponent("api/audio/native/capture"), resolvingAgainstBaseURL: false) else { return }
        components.queryItems = [URLQueryItem(name: "sampleRate", value: String(rate)),
            URLQueryItem(name: "channels", value: String(channels)), URLQueryItem(name: "frames", value: String(frames))]
        guard let url = components.url else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"; request.httpBody = pcm
        request.setValue("application/octet-stream", forHTTPHeaderField: "Content-Type")
        var origin = URLComponents(url: base, resolvingAgainstBaseURL: false)
        origin?.path = ""; origin?.query = nil; origin?.fragment = nil
        request.setValue(origin?.url?.absoluteString, forHTTPHeaderField: "Origin")
        let token = generation
        let task = session.dataTask(with: request) { [weak self] _, _, _ in
            Task { @MainActor in
                guard let self, self.generation == token else { return }
                self.pcmRequest = nil
            }
        }
        pcmRequest = task; task.resume()
    }

    private func cancelRecording() {
        if let stream = recordingStream { stream.stopCapture { _ in } }
        if let stream = recordingAudioStream { stream.stopCapture { _ in } }
        recordingStream = nil
        recordingAudioStream = nil
        recordingOutput?.cancel(); recordingOutput = nil
    }

    private func stopSystemAudio() {
        if let stream = audioStream { stream.stopCapture { _ in } }
        audioStream = nil; audioOutput?.cancel(); audioOutput = nil
        send(["type": "fe-mac-capture-state", "systemAudio": false])
    }

    private func stopMicrophone() {
        if let microphone { microphone.inputNode.removeTap(onBus: 0); microphone.stop() }
        microphone = nil; microphoneOutput?.cancel(); microphoneOutput = nil
    }

    nonisolated func stream(_ stream: SCStream, didStopWithError error: Error) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            if self.audioStream === stream {
                self.stopSystemAudio()
                self.send(["type": "fe-mac-capture-error", "source": "system", "error": error.localizedDescription])
            } else if self.recordingStream === stream || self.recordingAudioStream === stream {
                self.handle(["action": "recording-finish", "requestId": ""])
                self.send(["type": "fe-mac-capture-error", "source": "recording", "error": error.localizedDescription])
            }
        }
    }

    private func permissions() -> [String: Any] {
        ["screen": CGPreflightScreenCaptureAccess(),
            "microphone": AVCaptureDevice.authorizationStatus(for: .audio) == .authorized,
            "camera": AVCaptureDevice.authorizationStatus(for: .video) == .authorized]
    }

    private func requestMediaPermission(_ kind: String) async -> [String: Any] {
        guard kind == "microphone" || kind == "camera" else { return ["granted": false] }
        let media: AVMediaType = kind == "camera" ? .video : .audio
        let status = AVCaptureDevice.authorizationStatus(for: media)
        let granted: Bool
        if status == .notDetermined {
            granted = await withCheckedContinuation { continuation in
                AVCaptureDevice.requestAccess(for: media) { continuation.resume(returning: $0) }
            }
        } else { granted = status == .authorized }
        return ["kind": kind, "granted": granted]
    }

    private func reply(_ requestID: String, values: [String: Any] = [:], error: Error? = nil) {
        var message = values
        message["type"] = "fe-mac-capture-result"; message["requestId"] = requestID
        message["ok"] = error == nil
        if let error { message["error"] = error.localizedDescription }
        send(message)
    }

    private func boundedInteger(_ value: Any?, fallback: Int, minimum: Int, maximum: Int) -> Int {
        let number = (value as? NSNumber)?.intValue ?? fallback
        return min(max(number > 0 ? number : fallback, minimum), maximum)
    }

    private enum CaptureError: LocalizedError {
        case busy, noRecording, screenPermission, microphonePermission, windowMissing, noInput, fileMissing, unknownAction
        var errorDescription: String? {
            switch self {
            case .busy: return "上一个捕获操作尚未完成，请稍后重试。"
            case .noRecording: return "当前没有正在进行的录制。"
            case .screenPermission: return "请在系统设置 → 隐私与安全性 → 屏幕录制允许 FE Monster，然后重新启动应用。"
            case .microphonePermission: return "请在系统设置 → 隐私与安全性 → 麦克风允许 FE Monster。"
            case .windowMissing: return "找不到可捕获的 FE Monster 窗口或显示器，请恢复窗口后重试。"
            case .noInput: return "未检测到可用的麦克风输入。"
            case .fileMissing: return "录制文件已移动或删除，请从影片/FE Monster查看文件。"
            case .unknownAction: return "未知的 macOS 捕获操作。"
            }
        }
    }
}

private final class MacCaptureOutput: NSObject, SCStreamOutput {
    let queue = DispatchQueue(label: "com.femonster.mac.capture.samples", qos: .userInitiated)
    private let file: URL?
    private let writer: AVAssetWriter?
    private let videoInput: AVAssetWriterInput?
    private let audioInput: AVAssetWriterInput?
    private let onAnalysis: ([String: Any], Data, Int, Int, Int) -> Void
    private let onFailure: (Error) -> Void
    private var paused = false
    private var closed = false
    private var pauseStarted: CMTime?
    private var pauseOffset = CMTime.zero
    private var origin: CMTime?
    private var lastWrittenTime = CMTime.zero
    private var lastVideoTime = CMTime.invalid
    private var lastAudioTime = CMTime.invalid
    private var lastVideoSample: CMSampleBuffer?
    private var failureReported = false
    private var lastAnalysis = 0.0
    private let fftSetup = vDSP_create_fftsetup(10, FFTRadix(kFFTRadix2))
    private var monoRing = [Float](repeating: 0, count: 1024)
    private var ringIndex = 0
    private var ringCount = 0

    init(file: URL?, width: Int, height: Int, fps: Int, bitrate: Int, audio: Bool,
        onAnalysis: @escaping ([String: Any], Data, Int, Int, Int) -> Void,
        onFailure: @escaping (Error) -> Void) throws {
        self.file = file; self.onAnalysis = onAnalysis; self.onFailure = onFailure
        if let file {
            let writer = try AVAssetWriter(outputURL: file, fileType: .mp4)
            let video = AVAssetWriterInput(mediaType: .video, outputSettings: [
                AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: width, AVVideoHeightKey: height,
                AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: bitrate, AVVideoExpectedSourceFrameRateKey: fps]])
            video.expectsMediaDataInRealTime = true
            guard writer.canAdd(video) else { throw NSError(domain: "FE Monster Capture", code: 1, userInfo: [NSLocalizedDescriptionKey: "H.264 视频编码器不可用。"]) }
            writer.add(video)
            let sound: AVAssetWriterInput?
            if audio {
                let input = AVAssetWriterInput(mediaType: .audio, outputSettings: [
                    AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 48_000, AVNumberOfChannelsKey: 2, AVEncoderBitRateKey: 192_000])
                input.expectsMediaDataInRealTime = true
                guard writer.canAdd(input) else { throw NSError(domain: "FE Monster Capture", code: 2, userInfo: [NSLocalizedDescriptionKey: "AAC 音频编码器不可用。"]) }
                writer.add(input); sound = input
            } else { sound = nil }
            guard writer.startWriting() else { throw writer.error ?? NSError(domain: "FE Monster Capture", code: 3) }
            self.writer = writer; self.videoInput = video; self.audioInput = sound
        } else { writer = nil; videoInput = nil; audioInput = nil }
        super.init()
    }

    deinit { if let fftSetup { vDSP_destroy_fftsetup(fftSetup) } }

    var elapsedMilliseconds: Double { queue.sync { max(0, lastWrittenTime.seconds * 1000) } }
    var recordedFile: URL? { file }

    func setPaused(_ value: Bool) {
        queue.sync {
            guard !closed, value != paused else { return }
            let now = CMClockGetTime(CMClockGetHostTimeClock())
            if value { pauseStarted = now }
            else if let pauseStarted { pauseOffset = CMTimeAdd(pauseOffset, CMTimeSubtract(now, pauseStarted)); self.pauseStarted = nil }
            paused = value
        }
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sample: CMSampleBuffer, of type: SCStreamOutputType) {
        guard !closed, sample.isValid else { return }
        if type == .audio { analyzeAudio(sample) }
        guard let writer, !paused, writer.status == .writing else { return }
        if type == .screen {
            guard let attachments = CMSampleBufferGetSampleAttachmentsArray(sample, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
                  let status = attachments.first?[.status] as? Int, status == SCFrameStatus.complete.rawValue else { return }
            if origin == nil { origin = CMSampleBufferGetPresentationTimeStamp(sample); pauseOffset = .zero; writer.startSession(atSourceTime: .zero) }
        }
        guard let origin else { return }
        let shift = CMTimeAdd(origin, pauseOffset)
        guard let adjusted = retime(sample, subtracting: shift) else { return }
        let timestamp = CMSampleBufferGetPresentationTimeStamp(adjusted)
        guard timestamp >= .zero else { return }
        let input = type == .screen ? videoInput : (type == .audio ? audioInput : nil)
        let previous = type == .screen ? lastVideoTime : lastAudioTime
        guard let input, input.isReadyForMoreMediaData, !previous.isValid || timestamp > previous else { return }
        if input.append(adjusted) {
            if type == .screen { lastVideoTime = timestamp; lastVideoSample = sample } else { lastAudioTime = timestamp }
            if timestamp > lastWrittenTime { lastWrittenTime = timestamp }
        } else if let error = writer.error, !failureReported { failureReported = true; onFailure(error) }
    }

    private func retime(_ sample: CMSampleBuffer, subtracting offset: CMTime) -> CMSampleBuffer? {
        var count: CMItemCount = 0
        guard CMSampleBufferGetSampleTimingInfoArray(sample, entryCount: 0, arrayToFill: nil, entriesNeededOut: &count) == noErr, count > 0 else { return nil }
        var timing = [CMSampleTimingInfo](repeating: CMSampleTimingInfo(duration: .invalid, presentationTimeStamp: .invalid, decodeTimeStamp: .invalid), count: count)
        let status = timing.withUnsafeMutableBufferPointer {
            CMSampleBufferGetSampleTimingInfoArray(sample, entryCount: count, arrayToFill: $0.baseAddress, entriesNeededOut: &count)
        }
        guard status == noErr else { return nil }
        for index in timing.indices {
            timing[index].presentationTimeStamp = CMTimeSubtract(timing[index].presentationTimeStamp, offset)
            if timing[index].decodeTimeStamp.isValid { timing[index].decodeTimeStamp = CMTimeSubtract(timing[index].decodeTimeStamp, offset) }
        }
        var result: CMSampleBuffer?
        let copyStatus = timing.withUnsafeBufferPointer {
            CMSampleBufferCreateCopyWithNewTiming(allocator: kCFAllocatorDefault, sampleBuffer: sample,
                sampleTimingEntryCount: count, sampleTimingArray: $0.baseAddress!, sampleBufferOut: &result)
        }
        return copyStatus == noErr ? result : nil
    }

    func finish() async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            queue.async {
                guard !self.closed, let writer = self.writer, let file = self.file else {
                    continuation.resume(throwing: NSError(domain: "FE Monster Capture", code: 4)); return
                }
                self.closed = true
                guard self.origin != nil else {
                    writer.cancelWriting(); try? FileManager.default.removeItem(at: file)
                    continuation.resume(throwing: NSError(domain: "FE Monster Capture", code: 5, userInfo: [NSLocalizedDescriptionKey: "没有录制到画面。"])); return
                }
                guard writer.status == .writing else {
                    try? FileManager.default.removeItem(at: file)
                    continuation.resume(throwing: writer.error ?? NSError(domain: "FE Monster Capture", code: 6)); return
                }
                if let origin = self.origin {
                    let now = CMClockGetTime(CMClockGetHostTimeClock())
                    let pausedTail = self.pauseStarted.map { CMTimeSubtract(now, $0) } ?? .zero
                    let endTime = CMTimeSubtract(CMTimeSubtract(now, origin), CMTimeAdd(self.pauseOffset, pausedTail))
                    // ScreenCaptureKit emits idle frames for static content. A
                    // final duplicate preserves the full visible recording duration.
                    if let last = self.lastVideoSample, endTime > self.lastVideoTime,
                       self.videoInput?.isReadyForMoreMediaData == true,
                       let tail = self.retime(last, subtracting: CMTimeSubtract(CMSampleBufferGetPresentationTimeStamp(last), endTime)) {
                        _ = self.videoInput?.append(tail)
                    }
                    if endTime > self.lastWrittenTime { self.lastWrittenTime = endTime }
                    writer.endSession(atSourceTime: self.lastWrittenTime)
                }
                self.videoInput?.markAsFinished(); self.audioInput?.markAsFinished()
                writer.finishWriting {
                    if writer.status == .completed { continuation.resume(returning: file) }
                    else {
                        try? FileManager.default.removeItem(at: file)
                        continuation.resume(throwing: writer.error ?? NSError(domain: "FE Monster Capture", code: 6))
                    }
                }
            }
        }
    }

    func cancel() {
        queue.async {
            guard !self.closed else { return }
            self.closed = true
            self.writer?.cancelWriting()
            if let file = self.file { try? FileManager.default.removeItem(at: file) }
        }
    }

    private func analyzeAudio(_ sample: CMSampleBuffer) {
        guard let description = CMSampleBufferGetFormatDescription(sample),
              let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(description)?.pointee,
              asbd.mFormatID == kAudioFormatLinearPCM, asbd.mBitsPerChannel == 32,
              asbd.mFormatFlags & kAudioFormatFlagIsFloat != 0 else { return }
        var size = 0
        var block: CMBlockBuffer?
        CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(sample, bufferListSizeNeededOut: &size,
            bufferListOut: nil, bufferListSize: 0, blockBufferAllocator: nil, blockBufferMemoryAllocator: nil,
            flags: 0, blockBufferOut: nil)
        guard size >= MemoryLayout<AudioBufferList>.size, size <= 4096 else { return }
        let memory = UnsafeMutableRawPointer.allocate(byteCount: size, alignment: MemoryLayout<AudioBufferList>.alignment)
        defer { memory.deallocate() }
        let list = memory.bindMemory(to: AudioBufferList.self, capacity: 1)
        guard CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(sample, bufferListSizeNeededOut: nil,
            bufferListOut: list, bufferListSize: size, blockBufferAllocator: kCFAllocatorDefault,
            blockBufferMemoryAllocator: kCFAllocatorDefault, flags: 0, blockBufferOut: &block) == noErr else { return }
        let buffers = UnsafeMutableAudioBufferListPointer(list)
        let channels = min(2, Int(asbd.mChannelsPerFrame))
        let frames = min(4096, CMSampleBufferGetNumSamples(sample))
        guard channels > 0, frames > 0 else { return }
        let planar = asbd.mFormatFlags & kAudioFormatFlagIsNonInterleaved != 0
        var interleaved = [Float](repeating: 0, count: frames * channels)
        for channel in 0..<channels {
            let bufferIndex = planar ? channel : 0
            guard bufferIndex < buffers.count, let pointer = buffers[bufferIndex].mData?.assumingMemoryBound(to: Float.self) else { return }
            let stride = planar ? 1 : Int(asbd.mChannelsPerFrame)
            guard Int(buffers[bufferIndex].mDataByteSize) / 4 >= (frames - 1) * stride + (planar ? 0 : channel) + 1 else { return }
            for frame in 0..<frames { interleaved[frame * channels + channel] = pointer[frame * stride + (planar ? 0 : channel)] }
        }
        analyze(interleaved, channels: channels, rate: Int(asbd.mSampleRate))
    }

    func consumeMicrophone(_ buffer: AVAudioPCMBuffer) {
        guard let samples = buffer.floatChannelData else { return }
        let channels = min(2, Int(buffer.format.channelCount)), frames = min(4096, Int(buffer.frameLength))
        guard channels > 0, frames > 0 else { return }
        var copied = [Float](repeating: 0, count: frames * channels)
        for frame in 0..<frames {
            for channel in 0..<channels {
                copied[frame * channels + channel] = buffer.format.isInterleaved
                    ? samples[0][frame * Int(buffer.format.channelCount) + channel] : samples[channel][frame]
            }
        }
        let rate = Int(buffer.format.sampleRate)
        queue.async { if !self.closed { self.analyze(copied, channels: channels, rate: rate) } }
    }

    private func analyze(_ samples: [Float], channels: Int, rate: Int) {
        let frames = samples.count / channels
        for frame in 0..<frames {
            var value: Float = 0
            for channel in 0..<channels { value += samples[frame * channels + channel] }
            monoRing[ringIndex] = value.isFinite ? value / Float(channels) : 0
            ringIndex = (ringIndex + 1) % monoRing.count; ringCount = min(monoRing.count, ringCount + 1)
        }
        let now = ProcessInfo.processInfo.systemUptime
        guard ringCount == monoRing.count, now - lastAnalysis >= 0.05, let fftSetup else { return }
        lastAnalysis = now
        var real = [Float](repeating: 0, count: 512), imaginary = real
        var squareSum: Float = 0
        for index in 0..<1024 {
            let sample = monoRing[(ringIndex + index) % 1024]
            squareSum += sample * sample
            let value = sample * Float(0.5 - 0.5 * cos(2 * Double.pi * Double(index) / 1023))
            if index % 2 == 0 { real[index / 2] = value } else { imaginary[index / 2] = value }
        }
        var bins = [Int](repeating: 0, count: 512)
        real.withUnsafeMutableBufferPointer { real in
            imaginary.withUnsafeMutableBufferPointer { imaginary in
                var split = DSPSplitComplex(realp: real.baseAddress!, imagp: imaginary.baseAddress!)
                vDSP_fft_zrip(fftSetup, &split, 1, 10, FFTDirection(FFT_FORWARD))
                for index in 1..<512 {
                    let magnitude = sqrt(real[index] * real[index] + imaginary[index] * imaginary[index]) / 1024
                    let db = 20 * log10(max(magnitude, 0.000001))
                    bins[index] = min(255, max(0, Int((db + 90) / 80 * 255)))
                }
            }
        }
        let rms = min(1, Double(sqrt(squareSum / 1024)))
        let recentFrames = min(1024, frames)
        let recent = Array(samples.suffix(recentFrames * channels))
        let pcm = recent.withUnsafeBytes { Data($0) } // macOS arm64/x86_64 use little-endian float32.
        onAnalysis(["bins": bins, "fftSize": 1024, "sampleRate": rate, "rms": rms], pcm, recentFrames, channels, rate)
    }
}
