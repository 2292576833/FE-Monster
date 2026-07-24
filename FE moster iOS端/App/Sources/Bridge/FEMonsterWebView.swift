import SwiftUI
import UIKit
import WebKit

struct FEMonsterWebView: UIViewRepresentable {
    let gateway: NodeGatewayController

    func makeCoordinator() -> Coordinator {
        Coordinator(gateway: gateway)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.websiteDataStore = .default()
        configuration.applicationNameForUserAgent = "FE-Monster-iOS/1.1.6"
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true

        let resourceRoot = Bundle.main.resourceURL?
            .appendingPathComponent("Web", isDirectory: true)
            ?? Bundle.main.bundleURL
        let schemeHandler = BundledWebSchemeHandler(rootDirectory: resourceRoot)
        configuration.setURLSchemeHandler(
            schemeHandler,
            forURLScheme: BundledWebSchemeHandler.scheme
        )

        let bootstrap = WKUserScript(
            source: """
            (() => {
              window.__FE_MONSTER_IOS__ = true;
              document.documentElement.dataset.fePlatform = 'ios';
              document.documentElement.dataset.feFormFactor = 'phone';
            })();
            """,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        configuration.userContentController.addUserScript(bootstrap)
        configuration.userContentController.add(
            context.coordinator.bridge,
            name: IOSNativeBridge.handlerName
        )

        let webView = WKWebView(frame: .zero, configuration: configuration)
        context.coordinator.schemeHandler = schemeHandler
        context.coordinator.bridge.webView = webView
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.isOpaque = false
        webView.backgroundColor = UIColor(
            red: 11 / 255,
            green: 15 / 255,
            blue: 21 / 255,
            alpha: 1
        )
        webView.scrollView.backgroundColor = webView.backgroundColor
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.keyboardDismissMode = .interactive
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsLinkPreview = false

        #if DEBUG
        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }
        #endif

        if FileManager.default.fileExists(
            atPath: resourceRoot.appendingPathComponent("index.html").path
        ), let startURL = URL(
            string: "\(BundledWebSchemeHandler.scheme)://\(BundledWebSchemeHandler.host)/index.html?client=ios"
        ) {
            webView.load(URLRequest(url: startURL))
        } else {
            webView.loadHTMLString(
                """
                <!doctype html>
                <meta name="viewport" content="width=device-width,initial-scale=1">
                <style>
                  html,body{height:100%;margin:0;background:#0b0f15;color:#fff;font:15px -apple-system}
                  body{display:grid;place-items:center;text-align:center;padding:24px;box-sizing:border-box}
                </style>
                <main>应用包缺少 Web/index.html。<br>请重新执行 Build/prepare-resources.sh。</main>
                """,
                baseURL: nil
            )
        }

        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.bridge.webView = webView
    }

    static func dismantleUIView(
        _ webView: WKWebView,
        coordinator: Coordinator
    ) {
        webView.stopLoading()
        webView.configuration.userContentController.removeScriptMessageHandler(
            forName: IOSNativeBridge.handlerName
        )
        coordinator.bridge.webView = nil
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        let bridge: IOSNativeBridge
        var schemeHandler: BundledWebSchemeHandler?

        init(gateway: NodeGatewayController) {
            bridge = IOSNativeBridge(gateway: gateway)
            super.init()
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

            let scheme = url.scheme?.lowercased()
            if scheme == BundledWebSchemeHandler.scheme
                || scheme == "about"
                || scheme == "blob"
                || scheme == "data" {
                decisionHandler(.allow)
                return
            }

            if scheme == "https" || scheme == "http" {
                if navigationAction.navigationType == .linkActivated,
                   navigationAction.targetFrame?.isMainFrame != false {
                    UIApplication.shared.open(
                        url,
                        options: [:],
                        completionHandler: nil
                    )
                }
                decisionHandler(.cancel)
                return
            }

            decisionHandler(.cancel)
        }

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            guard
                navigationAction.targetFrame == nil,
                let url = navigationAction.request.url
            else {
                return nil
            }

            let scheme = url.scheme?.lowercased()
            if scheme == BundledWebSchemeHandler.scheme {
                webView.load(navigationAction.request)
            } else if navigationAction.navigationType == .linkActivated,
                      scheme == "https" || scheme == "http" {
                UIApplication.shared.open(
                    url,
                    options: [:],
                    completionHandler: nil
                )
            }
            return nil
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            webView.reload()
        }

        func webView(
            _ webView: WKWebView,
            runJavaScriptAlertPanelWithMessage message: String,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping () -> Void
        ) {
            guard let presenter = UIApplication.shared.feTopViewController else {
                completionHandler()
                return
            }

            let alert = UIAlertController(
                title: "FE Monster",
                message: message,
                preferredStyle: .alert
            )
            alert.addAction(
                UIAlertAction(title: "确定", style: .default) { _ in
                    completionHandler()
                }
            )
            presenter.present(alert, animated: true)
        }

        func webView(
            _ webView: WKWebView,
            runJavaScriptConfirmPanelWithMessage message: String,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping (Bool) -> Void
        ) {
            guard let presenter = UIApplication.shared.feTopViewController else {
                completionHandler(false)
                return
            }

            let alert = UIAlertController(
                title: "FE Monster",
                message: message,
                preferredStyle: .alert
            )
            alert.addAction(
                UIAlertAction(title: "取消", style: .cancel) { _ in
                    completionHandler(false)
                }
            )
            alert.addAction(
                UIAlertAction(title: "确定", style: .default) { _ in
                    completionHandler(true)
                }
            )
            presenter.present(alert, animated: true)
        }

        func webView(
            _ webView: WKWebView,
            requestMediaCapturePermissionFor origin: WKSecurityOrigin,
            initiatedByFrame frame: WKFrameInfo,
            type: WKMediaCaptureType,
            decisionHandler: @escaping (WKPermissionDecision) -> Void
        ) {
            decisionHandler(.deny)
        }
    }
}
