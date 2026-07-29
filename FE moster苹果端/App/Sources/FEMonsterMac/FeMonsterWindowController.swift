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
        configuration.applicationNameForUserAgent = "FE-Monster-Mac/1.8.8"

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

        userContentController.add(self, name: Self.bridgeName)
        configureWindow(window)
        configureWebView()
        showLoadingPage()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    deinit {
        removeBridgeHandler()
    }

    /// Direct counterpart of CoreWebView2.Navigate(options.Url).
    func loadApplication(at url: URL) {
        trustedOrigin = origin(of: url)
        webView.load(URLRequest(url: url))
    }

    func showStartupFailure(_ message: String) {
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
        if let window {
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

        if let window {
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
        CGFloat((value as? NSNumber)?.doubleValue ?? 0)
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
      if (window.chrome?.webview?.__feMonsterMac) return;

      const listeners = new Set();
      const webview = {
        __feMonsterMac: true,
        postMessage(value) {
          window.webkit.messageHandlers.feMonster.postMessage(value);
        },
        addEventListener(type, listener) {
          if (type === 'message' && typeof listener === 'function') listeners.add(listener);
        },
        removeEventListener(type, listener) {
          if (type === 'message') listeners.delete(listener);
        },
        __dispatch(data) {
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
