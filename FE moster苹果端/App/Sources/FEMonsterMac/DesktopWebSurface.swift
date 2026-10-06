import AppKit
import WebKit

func desktopJSON(_ value: Any) -> String {
    guard JSONSerialization.isValidJSONObject(value),
          let data = try? JSONSerialization.data(withJSONObject: value),
          let json = String(data: data, encoding: .utf8) else { return "{}" }
    return json
}

func desktopClientURL(_ applicationURL: URL, client: String, path: String? = nil) -> URL {
    var components = URLComponents(url: applicationURL, resolvingAgainstBaseURL: false)!
    if let path { components.path = path }
    var query = (components.queryItems ?? []).filter { $0.name.lowercased() != "client" }
    query.append(URLQueryItem(name: "client", value: client))
    components.queryItems = query
    return components.url ?? applicationURL
}

@MainActor
enum DesktopGeometry {
    static func screen(for frame: NSRect) -> NSScreen? {
        let intersecting = NSScreen.screens.filter { $0.frame.intersects(frame) }
        if let screen = intersecting.max(by: { left, right in
            let a = left.frame.intersection(frame), b = right.frame.intersection(frame)
            return max(0, a.width) * max(0, a.height) < max(0, b.width) * max(0, b.height)
        }) { return screen }
        // A removed monitor can leave a saved window outside every display.
        // Restore to the closest remaining screen rather than an arbitrary one.
        return NSScreen.screens.min { left, right in
            func distance(_ screen: NSScreen) -> CGFloat {
                let dx = max(max(screen.frame.minX - frame.midX, 0), frame.midX - screen.frame.maxX)
                let dy = max(max(screen.frame.minY - frame.midY, 0), frame.midY - screen.frame.maxY)
                return dx * dx + dy * dy
            }
            return distance(left) < distance(right)
        } ?? NSScreen.main
    }

    static func screenID(_ screen: NSScreen) -> String {
        String((screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value ?? 0)
    }

    static func clamp(_ frame: NSRect, to area: NSRect, visible: CGFloat = 0) -> NSRect {
        var result = frame
        let xMin = visible > 0 ? area.minX - frame.width + visible : area.minX
        let yMin = visible > 0 ? area.minY - frame.height + visible : area.minY
        let xMax = visible > 0 ? area.maxX - visible : max(area.minX, area.maxX - frame.width)
        let yMax = visible > 0 ? area.maxY - visible : max(area.minY, area.maxY - frame.height)
        result.origin.x = min(max(result.minX, xMin), xMax)
        result.origin.y = min(max(result.minY, yMin), yMax)
        return result
    }

    // The shared browser protocol measures Y down from the top of the desktop.
    // AppKit coordinates measure Y upwards; use the primary screen as origin.
    static var desktopTop: CGFloat { NSScreen.screens.first?.frame.maxY ?? 0 }
    static func payload(_ frame: NSRect) -> [String: Any] {
        ["left": frame.minX, "top": desktopTop - frame.maxY, "width": frame.width, "height": frame.height]
    }
}

final class DesktopPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

/// A persistent WK surface sharing the main application's cookies/storage.
/// Each surface keeps its latest snapshot across navigation and renderer recovery.
@MainActor
final class DesktopWebSurface: NSObject, WKNavigationDelegate {
    let webView: WKWebView
    let url: URL
    var ready: (() -> Void)?
    var failure: ((String) -> Void)?
    private var crashDates: [Date] = []
    private var closed = false
    private weak var downloadDelegate: WKDownloadDelegate?

    init(url: URL, configuration: WKWebViewConfiguration, uiDelegate: WKUIDelegate?, transparent: Bool) {
        self.url = url
        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init()
        webView.navigationDelegate = self
        webView.uiDelegate = uiDelegate
        downloadDelegate = uiDelegate as? WKDownloadDelegate
        webView.autoresizingMask = [.width, .height]
        webView.underPageBackgroundColor = transparent ? .clear : .black
        webView.allowsMagnification = false
        webView.wantsLayer = true
    }

    func load(in window: NSWindow) {
        webView.frame = NSRect(origin: .zero, size: window.contentLayoutRect.size)
        window.contentView = webView
        webView.load(URLRequest(url: url))
    }

    func post(_ payload: [String: Any]) {
        guard !closed else { return }
        webView.evaluateJavaScript("window.chrome?.webview?.__dispatch(\(desktopJSON(payload)));", completionHandler: nil)
    }

    func evaluate(_ script: String) {
        guard !closed else { return }
        webView.evaluateJavaScript(script, completionHandler: nil)
    }

    func close() {
        closed = true
        webView.stopLoading()
        webView.navigationDelegate = nil
        webView.uiDelegate = nil
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "feMonster")
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { ready?() }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        guard !closed else { return }
        let now = Date()
        crashDates.removeAll { now.timeIntervalSince($0) > 60 }
        crashDates.append(now)
        guard crashDates.count <= 3 else { failure?("桌面页面渲染进程连续退出，请重新打开该桌面功能。"); return }
        webView.load(URLRequest(url: url))
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code != NSURLErrorCancelled { failure?(error.localizedDescription) }
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let target = action.request.url else { decisionHandler(.cancel); return }
        if action.shouldPerformDownload { decisionHandler(.download); return }
        if action.targetFrame?.isMainFrame == true || action.targetFrame == nil {
            let allowed = target.scheme == url.scheme && target.host == url.host && target.port == url.port
            if !allowed {
                if ["http", "https", "mailto"].contains(target.scheme?.lowercased() ?? "") { NSWorkspace.shared.open(target) }
                decisionHandler(.cancel)
                return
            }
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = downloadDelegate }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = downloadDelegate }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        decisionHandler(response.canShowMIMEType ? .allow : .download)
    }
}
