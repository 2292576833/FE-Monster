import Foundation
import ImageIO
import Photos
import UIKit
import WebKit

@MainActor
final class IOSNativeBridge: NSObject, WKScriptMessageHandler {
    static let handlerName = "feMonsterIOS"

    weak var webView: WKWebView?

    private let gateway: NodeGatewayController
    private let httpClient: BoundedLoopbackHTTPClient
    private let maximumRequestBodySize = 64 * 1024
    private let maximumResponseBodySize = 2 * 1024 * 1024
    private let maximumPathSize = 4 * 1024
    private let maximumHeaderCount = 32
    private let maximumHeaderBytes = 32 * 1024
    private let maximumImageSize = 8 * 1024 * 1024
    private let maximumImageDimension = 2_048

    init(gateway: NodeGatewayController) {
        self.gateway = gateway

        httpClient = BoundedLoopbackHTTPClient()

        super.init()
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard
            message.name == Self.handlerName,
            let trustedWebView = webView,
            message.webView === trustedWebView,
            message.frameInfo.isMainFrame,
            message.frameInfo.request.url?.scheme?.lowercased()
                == BundledWebSchemeHandler.scheme,
            message.frameInfo.request.url?.host?.lowercased()
                == BundledWebSchemeHandler.host,
            let body = message.body as? [String: Any],
            let requestID = body["requestId"] as? String,
            !requestID.isEmpty,
            requestID.utf8.count <= 128,
            let action = body["action"] as? String,
            !action.isEmpty,
            action.utf8.count <= 64
        else {
            return
        }

        let payload = body["payload"] as? [String: Any] ?? [:]

        switch action {
        case "nativeFetch":
            Task { [weak self] in
                guard let self else { return }
                do {
                    let value = try await self.performNativeFetch(payload)
                    self.resolve(requestID, value: value)
                } catch {
                    self.reject(requestID, error: error)
                }
            }

        case "gatewayStatus":
            resolve(requestID, value: gatewayStatus())

        case "saveQrCode":
            Task { [weak self] in
                guard let self else { return }
                do {
                    let image = try await self.loadImage(from: payload)
                    try await self.saveImageToPhotoLibrary(image)
                    self.resolve(requestID, value: ["saved": true])
                } catch {
                    self.reject(requestID, error: error)
                }
            }

        case "shareQrCode":
            Task { [weak self] in
                guard let self else { return }
                do {
                    let image = try await self.loadImage(from: payload)
                    try self.presentShareSheet(for: image)
                    self.resolve(requestID, value: ["presented": true])
                } catch {
                    self.reject(requestID, error: error)
                }
            }

        case "openProviderApp":
            Task { [weak self] in
                guard let self else { return }
                do {
                    let opened = try await self.openProviderApp(payload)
                    self.resolve(requestID, value: ["opened": opened])
                } catch {
                    self.reject(requestID, error: error)
                }
            }

        default:
            reject(
                requestID,
                code: "unsupported_action",
                message: "Unsupported native action: \(action)"
            )
        }
    }

    private func performNativeFetch(
        _ payload: [String: Any]
    ) async throws -> [String: Any] {
        guard let connection = gateway.connection else {
            throw BridgeError.gatewayUnavailable
        }
        guard
            let rawPath = payload["path"] as? String,
            rawPath.hasPrefix("/"),
            !rawPath.hasPrefix("//"),
            rawPath.utf8.count <= maximumPathSize,
            rawPath == "/health" || rawPath == "/api" || rawPath.hasPrefix("/api/")
        else {
            throw BridgeError.disallowedPath
        }

        guard
            let incomingComponents = URLComponents(string: rawPath),
            incomingComponents.scheme == nil,
            incomingComponents.host == nil,
            incomingComponents.user == nil,
            incomingComponents.password == nil,
            incomingComponents.fragment == nil
        else {
            throw BridgeError.disallowedPath
        }

        var targetComponents = URLComponents()
        targetComponents.scheme = "http"
        targetComponents.host = "127.0.0.1"
        targetComponents.port = connection.baseURL.port
        targetComponents.percentEncodedPath = incomingComponents.percentEncodedPath
        targetComponents.percentEncodedQuery = incomingComponents.percentEncodedQuery

        guard let targetURL = targetComponents.url else {
            throw BridgeError.invalidRequest
        }

        let rawMethod = payload["method"] as? String ?? "GET"
        guard rawMethod.utf8.count <= 16 else {
            throw BridgeError.disallowedMethod
        }
        let method = rawMethod.uppercased()
        let allowedMethods = ["GET", "POST", "DELETE", "HEAD"]
        guard allowedMethods.contains(method) else {
            throw BridgeError.disallowedMethod
        }

        var request = URLRequest(
            url: targetURL,
            cachePolicy: .reloadIgnoringLocalAndRemoteCacheData,
            timeoutInterval: 60
        )
        request.httpMethod = method

        if let headers = payload["headers"] as? [String: Any] {
            guard headers.count <= maximumHeaderCount else {
                throw BridgeError.invalidRequest
            }
            let permittedHeaders = Set([
                "accept",
                "accept-language",
                "cache-control",
                "content-type",
                "if-match",
                "if-none-match"
            ])
            var headerBytes = 0
            for (name, rawValue) in headers {
                guard
                    name.utf8.count <= 128,
                    let value = rawValue as? String,
                    value.utf8.count <= 8 * 1024,
                    !value.contains("\r"),
                    !value.contains("\n")
                else {
                    continue
                }
                headerBytes += name.utf8.count + value.utf8.count
                guard headerBytes <= maximumHeaderBytes else {
                    throw BridgeError.invalidRequest
                }
                let normalizedName = name.lowercased()
                guard permittedHeaders.contains(normalizedName) else {
                    continue
                }
                request.setValue(value, forHTTPHeaderField: name)
            }
        }

        request.setValue(
            "Bearer \(connection.bearerToken)",
            forHTTPHeaderField: "Authorization"
        )

        if let body = payload["body"] as? String {
            let rawEncoding = payload["bodyEncoding"] as? String ?? "utf8"
            guard rawEncoding.utf8.count <= 16 else {
                throw BridgeError.invalidBodyEncoding
            }
            let encoding = rawEncoding.lowercased()
            let data: Data?
            switch encoding {
            case "base64":
                let maximumEncodedSize = ((maximumRequestBodySize + 2) / 3) * 4
                guard body.utf8.count <= maximumEncodedSize else {
                    throw BridgeError.requestBodyTooLarge
                }
                data = Data(base64Encoded: body)
            case "utf8":
                guard body.utf8.count <= maximumRequestBodySize else {
                    throw BridgeError.requestBodyTooLarge
                }
                data = body.data(using: .utf8)
            default:
                throw BridgeError.invalidBodyEncoding
            }

            guard let data else {
                throw BridgeError.invalidRequest
            }
            guard data.count <= maximumRequestBodySize else {
                throw BridgeError.requestBodyTooLarge
            }
            request.httpBody = data
        }

        let result = try await httpClient.data(
            for: request,
            maximumBytes: maximumResponseBodySize
        )
        let data = result.data
        let httpResponse = result.response

        var responseHeaders: [String: String] = [:]
        let exposedHeaders = Set([
            "cache-control",
            "content-length",
            "content-type",
            "date",
            "etag",
            "last-modified"
        ])
        for (rawName, rawValue) in httpResponse.allHeaderFields {
            let name = String(describing: rawName)
            guard exposedHeaders.contains(name.lowercased()) else {
                continue
            }
            responseHeaders[name] = String(describing: rawValue)
        }

        if let text = String(data: data, encoding: .utf8) {
            return [
                "status": httpResponse.statusCode,
                "headers": responseHeaders,
                "body": text,
                "bodyEncoding": "utf8"
            ]
        }

        return [
            "status": httpResponse.statusCode,
            "headers": responseHeaders,
            "body": data.base64EncodedString(),
            "bodyEncoding": "base64"
        ]
    }

    private func gatewayStatus() -> [String: Any] {
        switch gateway.state {
        case .idle:
            return ["ready": false, "state": "idle"]
        case .starting:
            return ["ready": false, "state": "starting"]
        case .ready:
            return ["ready": true, "state": "ready"]
        case .failed(let message):
            return ["ready": false, "state": "failed", "message": message]
        }
    }

    private func loadImage(from payload: [String: Any]) async throws -> UIImage {
        let source = (payload["dataUrl"] as? String)
            ?? (payload["url"] as? String)
        guard let source, !source.isEmpty else {
            throw BridgeError.missingImage
        }

        let data: Data
        if source.hasPrefix("data:") {
            guard
                source.utf8.count <= maximumImageSize * 2,
                let commaIndex = source.firstIndex(of: ",")
            else {
                throw BridgeError.imageTooLarge
            }
            let metadata = source[..<commaIndex]
            let encoded = String(source[source.index(after: commaIndex)...])
            guard metadata.lowercased() == "data:image/png;base64" else {
                throw BridgeError.invalidImage
            }

            guard let decoded = Data(base64Encoded: encoded) else {
                throw BridgeError.invalidImage
            }
            data = decoded
        } else {
            throw BridgeError.invalidImage
        }

        guard data.count <= maximumImageSize else {
            throw BridgeError.imageTooLarge
        }
        guard
            let imageSource = CGImageSourceCreateWithData(
                data as CFData,
                [kCGImageSourceShouldCache: false] as CFDictionary
            ),
            let properties = CGImageSourceCopyPropertiesAtIndex(
                imageSource,
                0,
                [kCGImageSourceShouldCache: false] as CFDictionary
            ) as? [CFString: Any],
            let width = properties[kCGImagePropertyPixelWidth] as? NSNumber,
            let height = properties[kCGImagePropertyPixelHeight] as? NSNumber,
            width.intValue > 0,
            height.intValue > 0,
            width.intValue <= maximumImageDimension,
            height.intValue <= maximumImageDimension,
            Int64(width.intValue) * Int64(height.intValue)
                <= Int64(maximumImageDimension * maximumImageDimension)
        else {
            throw BridgeError.invalidImage
        }

        let thumbnailOptions: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maximumImageDimension,
            kCGImageSourceShouldCacheImmediately: true
        ]
        guard let cgImage = CGImageSourceCreateThumbnailAtIndex(
            imageSource,
            0,
            thumbnailOptions as CFDictionary
        ) else {
            throw BridgeError.invalidImage
        }
        return UIImage(cgImage: cgImage)
    }

    private func saveImageToPhotoLibrary(_ image: UIImage) async throws {
        let authorization = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
        guard authorization == .authorized || authorization == .limited else {
            throw BridgeError.photoAccessDenied
        }

        try await withCheckedThrowingContinuation {
            (continuation: CheckedContinuation<Void, Error>) in
            PHPhotoLibrary.shared().performChanges {
                PHAssetChangeRequest.creationRequestForAsset(from: image)
            } completionHandler: { success, error in
                if let error {
                    continuation.resume(throwing: error)
                } else if success {
                    continuation.resume()
                } else {
                    continuation.resume(throwing: BridgeError.photoSaveFailed)
                }
            }
        }
    }

    private func presentShareSheet(for image: UIImage) throws {
        guard let presenter = UIApplication.shared.feTopViewController else {
            throw BridgeError.presentationUnavailable
        }

        let controller = UIActivityViewController(
            activityItems: [image],
            applicationActivities: nil
        )
        if let popover = controller.popoverPresentationController {
            popover.sourceView = presenter.view
            popover.sourceRect = CGRect(
                x: presenter.view.bounds.midX,
                y: presenter.view.bounds.maxY - 1,
                width: 1,
                height: 1
            )
        }
        presenter.present(controller, animated: true)
    }

    private func openProviderApp(_ payload: [String: Any]) async throws -> Bool {
        guard let rawProvider = payload["provider"] as? String else {
            throw BridgeError.invalidProvider
        }

        let provider = rawProvider
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        let candidates: [String]

        switch provider {
        case "netease", "网易云", "网易云音乐":
            candidates = ["orpheus://", "neteasemusic://"]
        case "qq", "qqmusic", "qq音乐":
            candidates = ["qqmusic://"]
        case "kugou", "酷狗", "酷狗音乐":
            candidates = ["kugouURL://", "kugou://"]
        default:
            throw BridgeError.invalidProvider
        }

        for candidate in candidates {
            guard
                let url = URL(string: candidate),
                UIApplication.shared.canOpenURL(url)
            else {
                continue
            }

            let opened = await withCheckedContinuation {
                (continuation: CheckedContinuation<Bool, Never>) in
                UIApplication.shared.open(
                    url,
                    options: [:],
                    completionHandler: { success in
                        continuation.resume(returning: success)
                    }
                )
            }
            if opened {
                return true
            }
        }
        return false
    }

    private func resolve(_ requestID: String, value: Any) {
        invoke(
            "_resolve",
            requestID: requestID,
            payload: ["ok": true, "value": value]
        )
    }

    private func reject(_ requestID: String, error: Error) {
        if let bridgeError = error as? BridgeError {
            reject(
                requestID,
                code: bridgeError.code,
                message: bridgeError.localizedDescription
            )
        } else {
            reject(
                requestID,
                code: "native_error",
                message: error.localizedDescription
            )
        }
    }

    private func reject(
        _ requestID: String,
        code: String,
        message: String
    ) {
        invoke(
            "_reject",
            requestID: requestID,
            payload: ["code": code, "message": message]
        )
    }

    private func invoke(
        _ method: String,
        requestID: String,
        payload: Any
    ) {
        guard
            let webView,
            let requestJSON = Self.jsonLiteral(requestID),
            let payloadJSON = Self.jsonLiteral(payload)
        else {
            return
        }

        let script = """
        window.FEIOSNativeBridge && \
        window.FEIOSNativeBridge.\(method)(\(requestJSON), \(payloadJSON));
        """
        webView.evaluateJavaScript(script)
    }

    private static func jsonLiteral(_ value: Any) -> String? {
        guard JSONSerialization.isValidJSONObject(["value": value]) else {
            return nil
        }
        guard
            let data = try? JSONSerialization.data(
                withJSONObject: value,
                options: [.fragmentsAllowed]
            )
        else {
            return nil
        }
        return String(data: data, encoding: .utf8)
    }
}

private struct BoundedHTTPResult: @unchecked Sendable {
    let data: Data
    let response: HTTPURLResponse
}

private actor BoundedLoopbackHTTPClient {
    private let redirectDelegate: NoRedirectSessionDelegate
    private let session: URLSession

    init() {
        let delegate = NoRedirectSessionDelegate()
        redirectDelegate = delegate

        let configuration = URLSessionConfiguration.ephemeral
        configuration.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        configuration.timeoutIntervalForRequest = 45
        configuration.timeoutIntervalForResource = 90
        configuration.waitsForConnectivity = false
        configuration.httpShouldSetCookies = false
        configuration.httpCookieAcceptPolicy = .never
        configuration.httpCookieStorage = nil
        session = URLSession(
            configuration: configuration,
            delegate: delegate,
            delegateQueue: nil
        )
    }

    func data(
        for request: URLRequest,
        maximumBytes: Int
    ) async throws -> BoundedHTTPResult {
        let (bytes, response) = try await session.bytes(for: request)
        guard
            let httpResponse = response as? HTTPURLResponse,
            httpResponse.url?.scheme?.lowercased() == "http",
            httpResponse.url?.host == "127.0.0.1",
            httpResponse.url?.port == request.url?.port
        else {
            throw BridgeError.invalidResponse
        }
        guard
            httpResponse.expectedContentLength < 0
                || httpResponse.expectedContentLength <= Int64(maximumBytes)
        else {
            throw BridgeError.responseBodyTooLarge
        }

        var data = Data()
        if httpResponse.expectedContentLength > 0 {
            data.reserveCapacity(Int(httpResponse.expectedContentLength))
        }
        for try await byte in bytes {
            guard data.count < maximumBytes else {
                throw BridgeError.responseBodyTooLarge
            }
            data.append(byte)
        }
        return BoundedHTTPResult(data: data, response: httpResponse)
    }
}

private final class NoRedirectSessionDelegate:
    NSObject,
    URLSessionTaskDelegate,
    @unchecked Sendable
{
    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        completionHandler(nil)
    }
}

private enum BridgeError: LocalizedError {
    case gatewayUnavailable
    case disallowedPath
    case disallowedMethod
    case invalidRequest
    case invalidBodyEncoding
    case requestBodyTooLarge
    case responseBodyTooLarge
    case invalidResponse
    case missingImage
    case invalidImage
    case imageTooLarge
    case photoAccessDenied
    case photoSaveFailed
    case presentationUnavailable
    case invalidProvider

    var code: String {
        switch self {
        case .gatewayUnavailable: return "gateway_unavailable"
        case .disallowedPath: return "disallowed_path"
        case .disallowedMethod: return "disallowed_method"
        case .invalidRequest: return "invalid_request"
        case .invalidBodyEncoding: return "invalid_body_encoding"
        case .requestBodyTooLarge: return "request_body_too_large"
        case .responseBodyTooLarge: return "response_body_too_large"
        case .invalidResponse: return "invalid_response"
        case .missingImage: return "missing_image"
        case .invalidImage: return "invalid_image"
        case .imageTooLarge: return "image_too_large"
        case .photoAccessDenied: return "photo_access_denied"
        case .photoSaveFailed: return "photo_save_failed"
        case .presentationUnavailable: return "presentation_unavailable"
        case .invalidProvider: return "invalid_provider"
        }
    }

    var errorDescription: String? {
        switch self {
        case .gatewayUnavailable:
            return "本机音乐服务尚未就绪。"
        case .disallowedPath:
            return "该请求不允许通过本机桥接发送。"
        case .disallowedMethod:
            return "不支持的请求方法。"
        case .invalidRequest:
            return "请求格式无效。"
        case .invalidBodyEncoding:
            return "请求正文编码无效。"
        case .requestBodyTooLarge:
            return "音乐接口请求超过 64 KB，已拒绝发送。"
        case .responseBodyTooLarge:
            return "音乐接口响应超过 2 MB，已停止接收。"
        case .invalidResponse:
            return "本机音乐服务返回了无效响应。"
        case .missingImage:
            return "没有可保存的二维码。"
        case .invalidImage:
            return "二维码图像无效。"
        case .imageTooLarge:
            return "二维码图像过大。"
        case .photoAccessDenied:
            return "未获得添加照片权限。"
        case .photoSaveFailed:
            return "二维码保存失败。"
        case .presentationUnavailable:
            return "当前无法打开系统分享面板。"
        case .invalidProvider:
            return "无法识别音乐平台。"
        }
    }
}

extension UIApplication {
    var feTopViewController: UIViewController? {
        let keyWindow = connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .filter { $0.activationState == .foregroundActive }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)

        var controller = keyWindow?.rootViewController
        while let presented = controller?.presentedViewController {
            controller = presented
        }

        if let navigation = controller as? UINavigationController {
            return navigation.visibleViewController
        }
        if let tabs = controller as? UITabBarController {
            return tabs.selectedViewController
        }
        return controller
    }
}
