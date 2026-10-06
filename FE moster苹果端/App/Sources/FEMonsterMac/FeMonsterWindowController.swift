import AppKit
import WebKit

private final class BorderlessWindow: NSWindow {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

private final class RoundedContentView: NSView {
    var cornerRadius: CGFloat = 28 {
        didSet { applyCornerRadius() }
    }

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        layer?.backgroundColor = NSColor(calibratedWhite: 0.01, alpha: 1).cgColor
        applyCornerRadius()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    private func applyCornerRadius() {
        layer?.cornerRadius = cornerRadius
        layer?.masksToBounds = true
    }
}

@MainActor
private final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?

    init(target: WKScriptMessageHandler) {
        self.target = target
        super.init()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
    }
}

final class FeMonsterWindowController: NSWindowController,
    NSWindowDelegate,
    WKScriptMessageHandler,
    WKNavigationDelegate,
    WKUIDelegate,
    WKDownloadDelegate {

    private static let bridgeName = "feMonster"
    private let options: ClientOptions
    private let hostView: RoundedContentView
    private let webView: WKWebView
    private var bridgeRemoved = false
    private var trustedOrigin: (scheme: String, host: String, port: Int)?
    private var applicationURL: URL?
    private var webProcessFailures: [Date] = []
    private var desktopTimer: Timer?
    private var playbackTimer: Timer?
    private var snapshotPending = false
    private var playbackProbePending = false
    private var navigationGeneration = 0
    private(set) var systemAudioEnabled = false
    private var playbackActivity: NSObjectProtocol?
    private var latestDesktopSnapshot: [String: Any] = [:]
    private var latestLyricsState: [String: Any] = [:]
    private var latestWallpaperState: [String: Any] = [:]
    private lazy var desktopPet = makeDesktopPet()
    private lazy var desktopScene = makeDesktopScene()
    private lazy var desktopLyrics = makeDesktopLyrics()
    private lazy var macCapture = MacCaptureService(window: window, send: { [weak self] payload in
        if let enabled = payload["systemAudio"] as? Bool { self?.systemAudioEnabled = enabled }
        self?.dispatchBridgeMessage(payload)
    })
    private lazy var recordingToolbar = RecordingToolbarController { [weak self] action in
        self?.invokeRecordingAction(action)
    }

    init(options: ClientOptions) {
        self.options = options

        let userContentController = WKUserContentController()
        userContentController.addUserScript(WKUserScript(
            source: Self.compatibilityBridgeScript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))

        let configuration = WKWebViewConfiguration()
        configuration.userContentController = userContentController
        configuration.websiteDataStore = .default()
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = true
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "dev"
        configuration.applicationNameForUserAgent = "FE-Monster-Mac/\(version)"

        webView = WKWebView(frame: .zero, configuration: configuration)
        hostView = RoundedContentView(frame: NSRect(
            x: 0,
            y: 0,
            width: options.width,
            height: options.height
        ))

        let window = BorderlessWindow(
            contentRect: hostView.bounds,
            styleMask: [.borderless, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        super.init(window: window)

        userContentController.add(WeakScriptMessageHandler(target: self), name: Self.bridgeName)
        configureWindow(window)
        configureWebView()
        showLoadingPage()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    /// Direct counterpart of CoreWebView2.Navigate(options.Url).
    func loadApplication(at url: URL) {
        macCapture.shutdown()
        stopDesktopRuntime()
        applicationURL = url
        trustedOrigin = origin(of: url)
        webView.load(URLRequest(url: url))
        startPlaybackActivityMonitor()
    }

    func reloadApplication() {
        guard let applicationURL, !bridgeRemoved else { return }
        webProcessFailures.removeAll()
        loadApplication(at: applicationURL)
    }

    func showStartupFailure(_ message: String) {
        macCapture.shutdown()
        stopDesktopRuntime()
        trustedOrigin = nil
        let escaped = htmlEscaped(message)
        webView.loadHTMLString(
            """
            <!doctype html>
            <meta charset="utf-8">
            <style>
              html,body{height:100%;margin:0;background:#0b0f15;color:#eef7ff;
                font:15px -apple-system,BlinkMacSystemFont,sans-serif}
              body{display:grid;place-items:center}
              main{max-width:680px;padding:36px;border:1px solid #33404c;border-radius:24px;
                background:#111821;box-shadow:0 24px 80px #0008}
              h1{font-size:22px;margin:0 0 14px}p{line-height:1.65;color:#b9c8d5}
            </style>
            <main><h1>FE Monster 启动失败</h1><p>\(escaped)</p></main>
            """,
            baseURL: nil
        )
    }

    /// Direct counterpart of FeMonsterForm.OnFormClosing.
    func prepareForTermination() {
        macCapture.shutdown()
        stopDesktopRuntime()
        recordingToolbar.close()
        webView.stopLoading()
        removeBridgeHandler()
    }

    private func configureWindow(_ window: NSWindow) {
        window.title = "FE Monster"
        window.minSize = NSSize(width: 860, height: 560)
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = true
        window.isMovableByWindowBackground = true
        window.acceptsMouseMovedEvents = true
        window.collectionBehavior = [.fullScreenPrimary]
        window.delegate = self
        window.contentView = hostView
        window.center()
    }

    /// Direct counterpart of FeMonsterForm.InitializeWebViewAsync.
    private func configureWebView() {
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsMagnification = false
        webView.underPageBackgroundColor = .clear
        webView.wantsLayer = true
        webView.layer?.masksToBounds = true

        hostView.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: hostView.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: hostView.trailingAnchor),
            webView.topAnchor.constraint(equalTo: hostView.topAnchor),
            webView.bottomAnchor.constraint(equalTo: hostView.bottomAnchor)
        ])
        applyWindowCornerPolicy()
    }

    private func showLoadingPage() {
        webView.loadHTMLString(
            """
            <!doctype html>
            <meta charset="utf-8">
            <style>
              html,body{height:100%;margin:0;background:#0b0f15;color:#dcecff;
                font:14px -apple-system,BlinkMacSystemFont,sans-serif}
              body{display:grid;place-items:center}
              div{letter-spacing:.12em;opacity:.82}
            </style>
            <div>FE MONSTER · 正在启动本机服务…</div>
            """,
            baseURL: nil
        )
    }

    /// Direct counterpart of FeMonsterForm.HandleWebMessage.
    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard message.name == Self.bridgeName,
              isTrustedMainFrame(message.frameInfo),
              let payload = messagePayload(message.body),
              let type = payload["type"] as? String else {
            return
        }

        switch type.lowercased() {
        case "fe-window":
            handleWindowMessage(payload)
        case "fe-render-capabilities":
            handleRenderCapabilitiesMessage(payload)
        case "fe-recording-toolbar":
            handleRecordingToolbarMessage(payload)
        case "fe-desktop-scene":
            handleDesktopScene(payload)
        case "fe-pet-desktop":
            handleDesktopPet(payload)
        case "fe-desktop-lyrics":
            handleDesktopLyrics(payload)
        case "fe-wallpaper":
            handleWallpaper(payload)
        case "fe-mac-capture":
            macCapture.handle(payload)
        default:
            break
        }
    }

    private func isTrustedMainFrame(_ frame: WKFrameInfo) -> Bool {
        guard frame.isMainFrame,
              let expected = trustedOrigin,
              let actual = origin(of: frame.request.url),
              ClientOptions.isLoopbackHost(actual.host) else {
            return false
        }
        return actual.scheme == expected.scheme
            && actual.host == expected.host
            && actual.port == expected.port
    }

    private func messagePayload(_ body: Any) -> [String: Any]? {
        if let payload = body as? [String: Any] {
            return payload
        }
        guard let text = body as? String,
              let data = text.data(using: .utf8),
              let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        return payload
    }

    private func makeDesktopSurface(url: URL, transparent: Bool) -> DesktopWebSurface {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = webView.configuration.websiteDataStore
        configuration.processPool = webView.configuration.processPool
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.applicationNameForUserAgent = webView.configuration.applicationNameForUserAgent
        let content = WKUserContentController()
        content.addUserScript(WKUserScript(source: Self.compatibilityBridgeScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        content.add(WeakScriptMessageHandler(target: self), name: Self.bridgeName)
        configuration.userContentController = content
        return DesktopWebSurface(url: url, configuration: configuration, uiDelegate: self, transparent: transparent)
    }

    private func makeDesktopPet() -> DesktopPetHost {
        let host = DesktopPetHost { [unowned self] url, transparent in self.makeDesktopSurface(url: url, transparent: transparent) }
        host.stateChanged = { [weak self] in self?.postDesktopPetResult(requestID: "") }
        host.onError = { [weak self] error in self?.postDesktopPetResult(requestID: "", error: error); self?.showMainWindow() }
        return host
    }

    private func makeDesktopScene() -> DesktopSceneHost {
        let host = DesktopSceneHost { [unowned self] url, transparent in self.makeDesktopSurface(url: url, transparent: transparent) }
        host.onError = { [weak self] error in self?.postDesktopSceneResult(error: error) }
        return host
    }

    private func makeDesktopLyrics() -> DesktopLyricsHost {
        let host = DesktopLyricsHost { [unowned self] url, transparent in self.makeDesktopSurface(url: url, transparent: transparent) }
        host.stateChanged = { [weak self] in self?.postDesktopLyricsResult(requestID: "") }
        host.onError = { [weak self] error in self?.postDesktopLyricsResult(requestID: "", error: error) }
        return host
    }

    var desktopPetVisible: Bool { desktopPet.isVisible }
    var desktopSceneEnabled: Bool { desktopScene.isEnabled && !desktopScene.isWallpaper }
    var desktopLyricsEnabled: Bool { desktopLyrics.isEnabled }
    var desktopLyricsLocked: Bool { desktopLyrics.isLocked }

    func showMainWindow() {
        if window?.isMiniaturized == true { window?.deminiaturize(nil) }
        window?.makeKeyAndOrderFront(nil)
        NSApplication.shared.activate(ignoringOtherApps: true)
    }

    func toggleDesktopPet() { handleDesktopPet(["action": "toggle"]) }
    func toggleDesktopScene() { handleDesktopScene(["action": "toggle", "snapshot": latestDesktopSnapshot]) }
    func toggleDesktopLyrics() { handleDesktopLyrics(["action": "toggle", "state": latestLyricsState]) }
    func toggleDesktopLyricsLock() { desktopLyrics.setLocked(!desktopLyrics.isLocked) }

    func setSystemAudioEnabled(_ enabled: Bool) {
        guard let applicationURL, trustedOrigin != nil else { return }
        var components = URLComponents(url: applicationURL, resolvingAgainstBaseURL: false)
        components?.path = ""; components?.query = nil; components?.fragment = nil
        macCapture.handle(["action": enabled ? "system-audio-start" : "system-audio-stop", "requestId": "", "backendURL": components?.url?.absoluteString ?? ""])
    }

    private func handleDesktopPet(_ payload: [String: Any]) {
        let action = (payload["action"] as? String ?? "query").lowercased()
        let requestID = payload["requestId"] as? String ?? ""
        guard let applicationURL, trustedOrigin != nil else { postDesktopPetResult(requestID: requestID, error: "本机页面尚未就绪。"); return }
        switch action {
        case "enable", "show": desktopPet.show(at: applicationURL); window?.orderOut(nil)
        case "toggle":
            if desktopPet.isVisible { desktopPet.hide(); showMainWindow() }
            else { desktopPet.show(at: applicationURL); window?.orderOut(nil) }
        case "hide": desktopPet.hide()
        case "disable", "show-main": desktopPet.disable(); showMainWindow()
        case "move": desktopPet.moveBy(dx: number(payload["dx"]), dy: number(payload["dy"])); return
        case "move-end": desktopPet.endMove(); return
        case "panel": desktopPet.setPanel(payload); return
        case "bubble": desktopPet.setBubble(payload); return
        case "position-set":
            desktopPet.glideTo(payload) { [weak self] error in self?.postDesktopPetResult(requestID: requestID, error: error ?? "") }
            return
        case "query", "ready", "position-query": break
        default: postDesktopPetResult(requestID: requestID, error: "未知桌面宠物操作：\(action)"); return
        }
        postDesktopPetResult(requestID: requestID)
    }

    private func postDesktopPetResult(requestID: String, error: String = "") {
        let payload: [String: Any] = ["type": "fe-pet-desktop-result", "requestId": requestID,
            "supported": true, "enabled": desktopPet.isEnabled, "visible": desktopPet.isVisible,
            "hostMode": "appkit-transparent-wkwebview", "bounds": desktopPet.queryBounds(), "error": error]
        dispatchBridgeMessage(payload)
    }

    private func handleDesktopScene(_ payload: [String: Any]) {
        let action = (payload["action"] as? String ?? "query").lowercased()
        if let snapshot = payload["snapshot"] as? [String: Any] { latestDesktopSnapshot = snapshot }
        switch action {
        case "hide", "disable": desktopScene.disable()
        case "toggle" where desktopSceneEnabled: desktopScene.disable()
        case "update": if desktopSceneEnabled { desktopScene.update(latestDesktopSnapshot) }
        case "query", "ready": break
        case "enable", "show", "toggle":
            guard let applicationURL, trustedOrigin != nil else { postDesktopSceneResult(error: "本机页面尚未就绪。"); return }
            desktopScene.enable(at: applicationURL, snapshot: latestDesktopSnapshot)
            startDesktopSynchronization()
        default: postDesktopSceneResult(error: "未知桌面场景操作：\(action)"); return
        }
        // Continuous frame updates must not produce repeated UI toast results.
        if action != "update" { postDesktopSceneResult() }
    }

    private func postDesktopSceneResult(error: String = "") {
        dispatchBridgeMessage(["type": "fe-desktop-scene-result", "enabled": desktopSceneEnabled, "supported": true, "error": error])
    }

    private func handleDesktopLyrics(_ payload: [String: Any]) {
        let action = (payload["action"] as? String ?? "query").lowercased()
        let requestID = payload["requestId"] as? String ?? ""
        if let incoming = payload["state"] as? [String: Any] ?? payload["snapshot"] as? [String: Any] {
            latestLyricsState = latestLyricsState.merging(incoming) { _, value in value }
        }
        switch action {
        case "hide", "disable", "close": desktopLyrics.close()
        case "toggle" where desktopLyrics.isEnabled: desktopLyrics.close()
        case "enable", "show", "toggle":
            guard let applicationURL, trustedOrigin != nil else { postDesktopLyricsResult(requestID: requestID, error: "本机页面尚未就绪。"); return }
            desktopLyrics.show(at: applicationURL, state: latestLyricsState)
            startDesktopSynchronization()
        case "update": desktopLyrics.update(latestLyricsState)
        case "lock": desktopLyrics.setLocked(payload["locked"] as? Bool ?? true)
        case "capture": desktopLyrics.setPointerCapture(payload["active"] as? Bool == true)
        case "bounds": desktopLyrics.setHotBounds(payload["bounds"] as? [String: Any] ?? payload)
        case "move": desktopLyrics.moveBy(dx: number(payload["dx"]), dy: number(payload["dy"]))
        case "query", "ready": break
        default: postDesktopLyricsResult(requestID: requestID, error: "未知桌面歌词操作：\(action)"); return
        }
        postDesktopLyricsResult(requestID: requestID)
    }

    private func postDesktopLyricsResult(requestID: String, error: String = "") {
        var payload = desktopLyrics.query()
        payload["type"] = "fe-desktop-lyrics-result"; payload["requestId"] = requestID
        payload["ok"] = error.isEmpty; payload["error"] = error
        dispatchBridgeMessage(payload)
    }

    private func handleWallpaper(_ payload: [String: Any]) {
        let action = (payload["action"] as? String ?? "query").lowercased()
        let requestID = payload["requestId"] as? String ?? ""
        if let state = payload["state"] as? [String: Any] { latestWallpaperState = latestWallpaperState.merging(state) { _, value in value } }
        var error = ""
        switch action {
        case "hide", "disable", "close": desktopScene.disable()
        case "toggle" where desktopScene.isWallpaper: desktopScene.disable()
        case "show", "enable", "toggle":
            if let applicationURL, trustedOrigin != nil { desktopScene.enable(at: applicationURL, snapshot: latestWallpaperState, wallpaper: true); startDesktopSynchronization() }
            else { error = "本机页面尚未就绪。" }
        case "update": if desktopScene.isWallpaper { desktopScene.update(latestWallpaperState) }
        case "query", "ready": break
        default: error = "未知动态壁纸操作：\(action)"
        }
        dispatchBridgeMessage(["type": "fe-wallpaper-result", "requestId": requestID, "ok": error.isEmpty, "supported": true, "enabled": desktopScene.isWallpaper, "error": error])
    }

    private func startDesktopSynchronization() {
        guard desktopTimer == nil else { return }
        desktopTimer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in
            DispatchQueue.main.async { [weak self] in self?.synchronizeDesktopSnapshot() }
        }
        if let desktopTimer { RunLoop.main.add(desktopTimer, forMode: .common) }
        synchronizeDesktopSnapshot()
    }

    private func synchronizeDesktopSnapshot() {
        guard !snapshotPending, !bridgeRemoved, desktopScene.isEnabled || desktopLyrics.isEnabled else {
            if !desktopScene.isEnabled && !desktopLyrics.isEnabled { desktopTimer?.invalidate(); desktopTimer = nil }
            return
        }
        snapshotPending = true
        let generation = navigationGeneration
        webView.evaluateJavaScript("window.feMonsterDesktopSnapshot && window.feMonsterDesktopSnapshot();") { [weak self] result, _ in
            guard let self, self.navigationGeneration == generation else { return }
            self.snapshotPending = false
            guard let envelope = result as? [String: Any], !self.bridgeRemoved else { return }
            if let snapshot = envelope["snapshot"] as? [String: Any] {
                self.latestDesktopSnapshot = snapshot
                if self.desktopSceneEnabled { self.desktopScene.update(snapshot) }
            }
            if let state = envelope["lyrics"] as? [String: Any] { self.latestLyricsState = self.latestLyricsState.merging(state) { _, value in value }; self.desktopLyrics.update(state) }
            if let state = envelope["wallpaper"] as? [String: Any], self.desktopScene.isWallpaper {
                self.latestWallpaperState = self.latestWallpaperState.merging(state) { _, value in value }
                self.desktopScene.update(self.latestWallpaperState)
            }
        }
    }

    private func startPlaybackActivityMonitor() {
        playbackTimer?.invalidate()
        playbackTimer = Timer.scheduledTimer(withTimeInterval: 0.75, repeats: true) { [weak self] _ in
            DispatchQueue.main.async { [weak self] in self?.pollPlaybackActivity() }
        }
        if let playbackTimer { RunLoop.main.add(playbackTimer, forMode: .common) }
    }

    private func pollPlaybackActivity() {
        guard !bridgeRemoved, !playbackProbePending else { return }
        playbackProbePending = true
        let generation = navigationGeneration
        webView.evaluateJavaScript("typeof isPlaybackClockRunning === 'function' && isPlaybackClockRunning();") { [weak self] result, error in
            guard let self, self.navigationGeneration == generation else { return }
            self.playbackProbePending = false
            guard error == nil, let playing = result as? Bool else { return }
            if playing {
                if self.playbackActivity == nil { self.playbackActivity = ProcessInfo.processInfo.beginActivity(options: [.userInitiatedAllowingIdleSystemSleep, .latencyCritical], reason: "FE Monster continuous music playback") }
            } else if let activity = self.playbackActivity {
                ProcessInfo.processInfo.endActivity(activity); self.playbackActivity = nil
            }
        }
    }

    private func stopDesktopRuntime() {
        navigationGeneration += 1
        systemAudioEnabled = false
        desktopTimer?.invalidate(); desktopTimer = nil
        playbackTimer?.invalidate(); playbackTimer = nil
        snapshotPending = false
        playbackProbePending = false
        if let activity = playbackActivity { ProcessInfo.processInfo.endActivity(activity); playbackActivity = nil }
        desktopPet.disable(); desktopScene.disable(); desktopLyrics.close()
    }

    /// Direct counterpart of FeMonsterForm.ApplyWindowAction/MoveWindowBy.
    private func handleWindowMessage(_ payload: [String: Any]) {
        guard let action = (payload["action"] as? String)?.lowercased(),
              let window else {
            return
        }

        switch action {
        case "fullscreen":
            setFullscreen(true)
        case "normal", "restore":
            setFullscreen(false)
            if window.isZoomed {
                window.zoom(nil)
            }
        case "maximize", "maximise":
            if !window.styleMask.contains(.fullScreen), !window.isZoomed {
                window.zoom(nil)
            }
        case "minimize", "minimise":
            window.miniaturize(nil)
        case "drag":
            if let event = NSApplication.shared.currentEvent {
                window.performDrag(with: event)
            }
        case "move":
            moveWindowBy(
                dx: number(payload["dx"]),
                dy: number(payload["dy"])
            )
        case "close", "quit", "exit":
            DispatchQueue.main.async {
                NSApplication.shared.terminate(nil)
            }
        default:
            break
        }
    }

    /// Direct counterpart of FeMonsterForm.SetFullscreen, using native macOS Spaces.
    private func setFullscreen(_ enabled: Bool) {
        guard let window else { return }
        let currentlyFullscreen = window.styleMask.contains(.fullScreen)
        if enabled != currentlyFullscreen {
            window.toggleFullScreen(nil)
        }
    }

    private func moveWindowBy(dx: CGFloat, dy: CGFloat) {
        guard let window,
              !window.styleMask.contains(.fullScreen),
              !window.isMiniaturized,
              dx != 0 || dy != 0 else {
            return
        }
        var origin = window.frame.origin
        origin.x += dx
        origin.y -= dy
        window.setFrameOrigin(origin)
    }

    /// Direct counterpart of FeMonsterForm.HandleRenderCapabilitiesMessage.
    private func handleRenderCapabilitiesMessage(_ payload: [String: Any]) {
        let requestID = payload["requestId"] as? String ?? ""
        let response: [String: Any] = [
            "type": "fe-render-capabilities-result",
            "requestId": requestID,
            "host": [
                "backend": "wkwebview-metal",
                "gpuAcceleration": options.gpuAcceleration,
                "ownsNativeRenderTargets": false
            ],
            "upscalers": [
                "adaptiveSpatial": [
                    "available": options.gpuAcceleration,
                    "backend": "webgl2-fragment-pass"
                ],
                "fsr1": [
                    "available": options.gpuAcceleration,
                    "backend": "webgl2-spatial-compatible",
                    "officialVendorImplementation": false
                ],
                "fsr2": [
                    "available": false,
                    "reason": "motion-vectors-depth-history-required"
                ],
                "fsr3": [
                    "available": false,
                    "reason": "native-temporal-renderer-and-swapchain-required"
                ],
                "fsr4": [
                    "available": false,
                    "reason": "native-fidelityfx-sdk-compatible-gpu-required"
                ],
                "fsrNative": [
                    "available": false,
                    "reason": "native-renderer-required"
                ],
                "dlss": [
                    "available": false,
                    "reason": "nvidia-windows-native-renderer-required"
                ]
            ],
            "rayTracing": [
                "realtime": false,
                "authoring": "blender-cycles"
            ]
        ]
        dispatchBridgeMessage(response)
    }

    /// Direct counterpart of FeMonsterForm.HandleRecordingToolbarMessage.
    private func handleRecordingToolbarMessage(_ payload: [String: Any]) {
        let action = (payload["action"] as? String)?.lowercased() ?? ""
        switch action {
        case "show":
            if let window {
                recordingToolbar.show(relativeTo: window)
            }
            invokeJavaScript(
                "window.feMonsterRecordingNativeReady && window.feMonsterRecordingNativeReady();"
            )
        case "hide":
            recordingToolbar.hide()
        case "state":
            recordingToolbar.updateState(
                mode: payload["mode"] as? String ?? "",
                status: payload["status"] as? String ?? "",
                canSaveAs: payload["canSaveAs"] as? Bool ?? false
            )
        default:
            break
        }
    }

    /// Direct counterpart of FeMonsterForm.InvokeRecordingScript.
    private func invokeRecordingAction(_ action: String) {
        let methods = [
            "start": "start",
            "stop": "stop",
            "resume": "resume",
            "finish": "finish",
            "close": "close",
            "saveas": "saveAs"
        ]
        guard let method = methods[action.lowercased()] else { return }
        invokeJavaScript(
            "window.feMonsterRecording && window.feMonsterRecording.\(method) && " +
                "window.feMonsterRecording.\(method)();"
        )
    }

    private func dispatchBridgeMessage(_ payload: [String: Any]) {
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else {
            return
        }
        invokeJavaScript(
            "window.chrome && window.chrome.webview && " +
                "window.chrome.webview.__dispatch && window.chrome.webview.__dispatch(\(json));"
        )
        desktopPet.post(payload)
        desktopLyrics.post(payload)
        desktopScene.post(payload)
    }

    private func invokeJavaScript(_ source: String) {
        webView.evaluateJavaScript(source, completionHandler: nil)
    }

    /// Direct counterpart of ApplyWindowCornerPolicy; AppKit clips the actual transparent surface.
    private func applyWindowCornerPolicy() {
        let radius: CGFloat = window?.styleMask.contains(.fullScreen) == true ? 0 : 28
        hostView.cornerRadius = radius
        webView.layer?.cornerRadius = radius
        webView.layer?.masksToBounds = true
    }

    func windowDidResize(_ notification: Notification) {
        applyWindowCornerPolicy()
    }

    func windowDidEnterFullScreen(_ notification: Notification) {
        applyWindowCornerPolicy()
    }

    func windowDidExitFullScreen(_ notification: Notification) {
        applyWindowCornerPolicy()
    }

    func windowWillClose(_ notification: Notification) {
        recordingToolbar.close()
    }

    // MARK: - Navigation, external windows and downloads

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        macCapture.shutdown()
        guard let applicationURL, !bridgeRemoved else { return }
        let now = Date()
        webProcessFailures.removeAll { now.timeIntervalSince($0) > 60 }
        webProcessFailures.append(now)
        guard webProcessFailures.count <= 3 else {
            showStartupFailure("页面渲染进程连续退出。可按 ⌘R 重新载入；若仍失败，请重新启动应用。")
            return
        }
        recordingToolbar.hide()
        loadApplication(at: applicationURL)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showNavigationFailure(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        showNavigationFailure(error)
    }

    private func showNavigationFailure(_ error: Error) {
        guard !bridgeRemoved, applicationURL != nil else { return }
        let code = (error as NSError).code
        // Canceled navigations and download hand-offs are expected WebKit events.
        guard code != NSURLErrorCancelled,
              !((error as NSError).domain == "WebKitErrorDomain" && code == 102) else { return }
        showStartupFailure("页面加载失败：\(error.localizedDescription)。可按 ⌘R 重试。")
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        if navigationAction.shouldPerformDownload {
            decisionHandler(.download)
            return
        }
        if navigationAction.targetFrame == nil {
            openExternally(url)
            decisionHandler(.cancel)
            return
        }
        if navigationAction.targetFrame?.isMainFrame == true, shouldOpenExternally(url) {
            openExternally(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationResponse: WKNavigationResponse,
        decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
    ) {
        if !navigationResponse.canShowMIMEType {
            decisionHandler(.download)
        } else {
            decisionHandler(.allow)
        }
    }

    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = navigationAction.request.url {
            openExternally(url)
        }
        return nil
    }

    func webView(
        _ webView: WKWebView,
        requestMediaCapturePermissionFor origin: WKSecurityOrigin,
        initiatedByFrame frame: WKFrameInfo,
        type: WKMediaCaptureType,
        decisionHandler: @escaping (WKPermissionDecision) -> Void
    ) {
        decisionHandler(isTrustedMainFrame(frame) ? .prompt : .deny)
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping () -> Void
    ) {
        guard isTrustedMainFrame(frame) else { completionHandler(); return }
        let alert = pageAlert(message)
        alert.addButton(withTitle: "确定")
        present(alert, in: webView.window) { _ in completionHandler() }
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (Bool) -> Void
    ) {
        guard isTrustedMainFrame(frame) else { completionHandler(false); return }
        let alert = pageAlert(message)
        alert.addButton(withTitle: "确定")
        alert.addButton(withTitle: "取消")
        present(alert, in: webView.window) { completionHandler($0 == .alertFirstButtonReturn) }
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptTextInputPanelWithPrompt prompt: String,
        defaultText: String?,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (String?) -> Void
    ) {
        guard isTrustedMainFrame(frame) else { completionHandler(nil); return }
        let alert = pageAlert(prompt)
        alert.addButton(withTitle: "确定")
        alert.addButton(withTitle: "取消")
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 320, height: 24))
        field.stringValue = defaultText ?? ""
        alert.accessoryView = field
        alert.window.initialFirstResponder = field
        present(alert, in: webView.window) { completionHandler($0 == .alertFirstButtonReturn ? field.stringValue : nil) }
    }

    private func pageAlert(_ message: String) -> NSAlert {
        let alert = NSAlert()
        alert.messageText = "FE Monster"
        alert.informativeText = message
        return alert
    }

    private func present(_ alert: NSAlert, in parent: NSWindow?, completion: @escaping (NSApplication.ModalResponse) -> Void) {
        if let window = parent ?? NSApplication.shared.keyWindow ?? window {
            alert.beginSheetModal(for: window, completionHandler: completion)
        } else {
            completion(alert.runModal())
        }
    }

    func webView(
        _ webView: WKWebView,
        navigationAction: WKNavigationAction,
        didBecome download: WKDownload
    ) {
        download.delegate = self
    }

    func webView(
        _ webView: WKWebView,
        navigationResponse: WKNavigationResponse,
        didBecome download: WKDownload
    ) {
        download.delegate = self
    }

    func download(
        _ download: WKDownload,
        decideDestinationUsing response: URLResponse,
        suggestedFilename: String,
        completionHandler: @escaping (URL?) -> Void
    ) {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = safeSuggestedFilename(suggestedFilename)
        panel.canCreateDirectories = true
        if let window = NSApplication.shared.keyWindow ?? window, window.isVisible {
            panel.beginSheetModal(for: window) { result in
                completionHandler(result == .OK ? panel.url : nil)
            }
        } else {
            completionHandler(panel.runModal() == .OK ? panel.url : nil)
        }
    }

    func downloadDidFinish(_ download: WKDownload) {
    }

    func download(
        _ download: WKDownload,
        didFailWithError error: Error,
        resumeData: Data?
    ) {
        NSSound.beep()
    }

    /// Required by the login page's "导入 API 插件" ZIP file input.
    func webView(
        _ webView: WKWebView,
        runOpenPanelWith parameters: WKOpenPanelParameters,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping ([URL]?) -> Void
    ) {
        guard isTrustedMainFrame(frame) else {
            completionHandler(nil)
            return
        }

        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canCreateDirectories = false

        if let window = webView.window ?? NSApplication.shared.keyWindow ?? window, window.isVisible {
            panel.beginSheetModal(for: window) { response in
                completionHandler(response == .OK ? panel.urls : nil)
            }
        } else {
            completionHandler(panel.runModal() == .OK ? panel.urls : nil)
        }
    }

    private func shouldOpenExternally(_ url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased() else { return false }
        if ["about", "blob", "data"].contains(scheme) {
            return false
        }
        if scheme == "http" || scheme == "https" {
            guard let expected = trustedOrigin, let actual = origin(of: url) else {
                return true
            }
            return actual.scheme != expected.scheme
                || actual.host != expected.host
                || actual.port != expected.port
        }
        return true
    }

    private func openExternally(_ url: URL) {
        guard let scheme = url.scheme?.lowercased(),
              !["about", "blob", "data", "javascript"].contains(scheme) else {
            return
        }
        NSWorkspace.shared.open(url)
    }

    private func safeSuggestedFilename(_ suggestedFilename: String) -> String {
        let safeName = URL(fileURLWithPath: suggestedFilename).lastPathComponent
        return safeName.isEmpty ? "FE-Monster-Download" : safeName
    }

    private func origin(of url: URL?) -> (scheme: String, host: String, port: Int)? {
        guard let url,
              let scheme = url.scheme?.lowercased(),
              let host = url.host?.lowercased() else {
            return nil
        }
        let port = url.port ?? (scheme == "https" ? 443 : 80)
        return (scheme, host, port)
    }

    private func number(_ value: Any?) -> CGFloat {
        let result = (value as? NSNumber)?.doubleValue ?? 0
        return CGFloat(result.isFinite ? result : 0)
    }

    private func htmlEscaped(_ value: String) -> String {
        value
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
    }

    private func removeBridgeHandler() {
        guard !bridgeRemoved else { return }
        bridgeRemoved = true
        webView.configuration.userContentController.removeScriptMessageHandler(
            forName: Self.bridgeName
        )
    }

    /// WebView2 compatibility surface used unchanged by web/app.js.
    private static let compatibilityBridgeScript = #"""
    (() => {
      if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(window.location.hostname)) return;
      window.FE_MONSTER_PLATFORM = 'macos';
      if (window.chrome?.webview?.__feMonsterMac) return;

      const listeners = new Set();
      const replay = new Map();
      const replayTypes = new Set(['fe-desktop-scene-state', 'fe-desktop-lyrics-state', 'fe-wallpaper-state', 'fe-pet-desktop-result']);
      const webview = {
        __feMonsterMac: true,
        postMessage(value) {
          window.webkit.messageHandlers.feMonster.postMessage(value);
        },
        addEventListener(type, listener) {
          if (type === 'message' && typeof listener === 'function') {
            listeners.add(listener);
            for (const data of replay.values()) {
              try { listener.call(webview, Object.freeze({ data })); } catch (error) { console.error(error); }
            }
          }
        },
        removeEventListener(type, listener) {
          if (type === 'message') listeners.delete(listener);
        },
        __dispatch(data) {
          if (replayTypes.has(data?.type)) replay.set(data.type, data);
          const event = Object.freeze({ data });
          for (const listener of [...listeners]) {
            try { listener.call(webview, event); } catch (error) { console.error(error); }
          }
        }
      };

      const chromeObject = window.chrome || {};
      try {
        Object.defineProperty(chromeObject, 'webview', {
          value: webview,
          configurable: false,
          enumerable: true,
          writable: false
        });
        Object.defineProperty(window, 'chrome', {
          value: chromeObject,
          configurable: false,
          enumerable: true,
          writable: false
        });
      } catch (error) {
        chromeObject.webview = webview;
        window.chrome = chromeObject;
      }

      const pending = new Map();
      const prefix = Date.now().toString(36) + Math.random().toString(36).slice(2);
      let sequence = 0;
      function nativeRequest(type, action, payload = {}) {
        const requestId = `mac-desktop-${prefix}-${++sequence}`;
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('桌面窗口未在限定时间内响应')); }, 5000);
          pending.set(requestId, { resolve, reject, timer });
          webview.postMessage({ ...payload, type, action, requestId });
        });
      }
      webview.addEventListener('message', event => {
        const data = event.data;
        const call = pending.get(data?.requestId);
        if (!call || !['fe-desktop-lyrics-result', 'fe-wallpaper-result'].includes(data.type)) return;
        pending.delete(data.requestId); clearTimeout(call.timer);
        if (data.error || data.ok === false) call.reject(new Error(data.error || '桌面操作失败'));
        else call.resolve(data);
      });
      function observe(type, callback) {
        if (typeof callback !== 'function') return () => {};
        const listener = event => { if (event.data?.type === type) callback(event.data.state || {}); };
        webview.addEventListener('message', listener);
        return () => webview.removeEventListener('message', listener);
      }
      window.desktopOverlay = {
        supported: true,
        platform: 'macos',
        onLyricsState: callback => observe('fe-desktop-lyrics-state', callback),
        onWallpaperState: callback => observe('fe-wallpaper-state', callback),
        showLyrics: state => nativeRequest('fe-desktop-lyrics', 'show', { state }),
        openLyrics: state => nativeRequest('fe-desktop-lyrics', 'show', { state }),
        toggleLyrics: state => nativeRequest('fe-desktop-lyrics', 'toggle', { state }),
        closeLyrics: () => nativeRequest('fe-desktop-lyrics', 'close'),
        updateLyrics: state => nativeRequest('fe-desktop-lyrics', 'update', { state }),
        setLyricsState: state => nativeRequest('fe-desktop-lyrics', 'update', { state }),
        getLyricsState: () => nativeRequest('fe-desktop-lyrics', 'query'),
        setLyricsPointerCapture: active => nativeRequest('fe-desktop-lyrics', 'capture', { active: !!active }),
        setLyricsLockState: locked => nativeRequest('fe-desktop-lyrics', 'lock', { locked: !!locked }),
        setLyricsHotBounds: bounds => nativeRequest('fe-desktop-lyrics', 'bounds', { bounds }),
        moveLyricsBy: (dx, dy) => nativeRequest('fe-desktop-lyrics', 'move', { dx, dy }),
        showWallpaper: state => nativeRequest('fe-wallpaper', 'show', { state }),
        toggleWallpaper: state => nativeRequest('fe-wallpaper', 'toggle', { state }),
        closeWallpaper: () => nativeRequest('fe-wallpaper', 'close'),
        updateWallpaper: state => nativeRequest('fe-wallpaper', 'update', { state }),
        setWallpaperState: state => nativeRequest('fe-wallpaper', 'update', { state }),
        getWallpaperState: () => nativeRequest('fe-wallpaper', 'query')
      };

      // Called by the native timer even while the main WebView is minimized.
      window.feMonsterDesktopSnapshot = () => {
        try {
          if (typeof desktopSceneSnapshot !== 'function') return null;
          const snapshot = desktopSceneSnapshot();
          const lyric = snapshot.lyricPlayback || {};
          const song = lyric.song || {};
          const style = window.getComputedStyle?.(document.querySelector('.stage') || document.documentElement);
          function color(key, fallback) {
            const value = style?.getPropertyValue(key)?.trim() || '';
            if (/^#[0-9a-f]{3,8}$/i.test(value)) return value;
            const channels = value.match(/^rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/i);
            return channels ? '#' + channels.slice(1,4).map(v => Math.min(255,Number(v)).toString(16).padStart(2,'0')).join('') : fallback;
          }
          const colors = { primary: color('--lyric-primary','#f6fdff'), secondary: color('--lyric-glow','#a8f6ff'),
            highlight: color('--lyric-highlight','#fff0b8'), glow: color('--lyric-glow','#9cffdf') };
          const lyrics = { text: lyric.displayText || song.title || 'FE Monster', progress: Math.max(0,Math.min(1,(Number(lyric.progressPercent)||0)/100)),
            playing: lyric.playing === true, effectiveLyricTime: lyric.effectiveLyricTime,
            lyricLineStartTime: lyric.lyricLineStartTime, lyricLineEndTime: lyric.lyricLineEndTime,
            colors, playback: { time: lyric.position, duration: lyric.duration, playing: lyric.playing, rate: lyric.playbackRate },
            fontFamily: typeof activeTextFontFamilyStack === 'function' ? activeTextFontFamilyStack() : style?.fontFamily };
          return JSON.parse(JSON.stringify({ snapshot, lyrics,
            wallpaper: { title: song.title || 'FE Monster', artist: song.artist || '', cover: song.cover || '',
              playing: lyric.playing === true, opacity: snapshot.wallpaperOpacity, colors } }));
        } catch (error) { return null; }
      };

      const originalFetch = window.fetch.bind(window);
      window.fetch = function(input, init) {
        try {
          const raw = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
          const target = new URL(raw, window.location.href);
          const quitPaths = new Set([
            '/api/app/quit',
            '/api/app/window/quit',
            '/api/app/window/close'
          ]);
          if (target.origin === window.location.origin && quitPaths.has(target.pathname)) {
            webview.postMessage({ type: 'fe-window', action: 'quit' });
            return Promise.resolve(new Response(
              JSON.stringify({ ok: true, action: 'quit', nativeHost: 'wkwebview' }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            ));
          }
        } catch (error) {
        }
        return originalFetch(input, init);
      };
    })();
    """#
}
