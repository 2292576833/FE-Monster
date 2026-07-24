import Foundation
import WebKit

final class BundledWebSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "femonster"
    static let host = "app"

    private let rootDirectory: URL
    private let ioQueue = DispatchQueue(
        label: "com.femonster.ios.web-resource-loader",
        qos: .userInitiated,
        attributes: .concurrent
    )
    private let callbackQueue = DispatchQueue.main
    private let callbackQueueKey = DispatchSpecificKey<UInt8>()
    private var activeTasks = Set<ObjectIdentifier>()

    init(rootDirectory: URL) {
        self.rootDirectory = rootDirectory.standardizedFileURL
        super.init()
        callbackQueue.setSpecific(key: callbackQueueKey, value: 1)
    }

    func webView(
        _ webView: WKWebView,
        start urlSchemeTask: any WKURLSchemeTask
    ) {
        let identifier = ObjectIdentifier(urlSchemeTask as AnyObject)
        serialized {
            activeTasks.insert(identifier)
        }

        ioQueue.async { [weak self] in
            self?.serve(urlSchemeTask, identifier: identifier)
        }
    }

    func webView(
        _ webView: WKWebView,
        stop urlSchemeTask: any WKURLSchemeTask
    ) {
        let identifier = ObjectIdentifier(urlSchemeTask as AnyObject)
        serialized {
            activeTasks.remove(identifier)
        }
    }

    private func serve(
        _ task: WKURLSchemeTask,
        identifier: ObjectIdentifier
    ) {
        defer {
            serialized {
                activeTasks.remove(identifier)
            }
        }

        guard isActive(identifier) else {
            return
        }

        do {
            let request = task.request
            let fileURL = try resolve(request.url)
            let attributes = try FileManager.default.attributesOfItem(atPath: fileURL.path)
            guard let fileSizeNumber = attributes[.size] as? NSNumber else {
                throw ResourceError.unreadableResource
            }

            let fileSize = fileSizeNumber.int64Value
            let requestedRange = byteRange(
                from: request.value(forHTTPHeaderField: "Range"),
                fileSize: fileSize
            )
            let range = requestedRange ?? (0...max(0, fileSize - 1))
            let responseLength = fileSize == 0 ? 0 : range.upperBound - range.lowerBound + 1

            var headers = [
                "Content-Type": Self.mimeType(for: fileURL),
                "Content-Length": String(responseLength),
                "Cache-Control": Self.cacheControl(for: fileURL),
                "Accept-Ranges": "bytes",
                "Referrer-Policy": "no-referrer",
                "X-Content-Type-Options": "nosniff"
            ]
            if ["html", "htm"].contains(fileURL.pathExtension.lowercased()) {
                headers["Content-Security-Policy"] = [
                    "default-src 'self'",
                    "script-src 'self'",
                    "style-src 'self' 'unsafe-inline'",
                    "img-src 'self' data: blob: https:",
                    "media-src 'self' blob: https:",
                    "font-src 'self' data:",
                    "connect-src 'self' blob:",
                    "worker-src 'self' blob:",
                    "object-src 'none'",
                    "base-uri 'none'",
                    "frame-src 'none'",
                    "frame-ancestors 'none'",
                    "form-action 'none'"
                ].joined(separator: "; ")
            }
            let statusCode: Int
            if requestedRange != nil {
                statusCode = 206
                headers["Content-Range"] = "bytes \(range.lowerBound)-\(range.upperBound)/\(fileSize)"
            } else {
                statusCode = 200
            }

            guard let response = HTTPURLResponse(
                url: request.url ?? fileURL,
                statusCode: statusCode,
                httpVersion: "HTTP/1.1",
                headerFields: headers
            ) else {
                throw ResourceError.unreadableResource
            }

            guard deliver(identifier, {
                task.didReceive(response)
            }) else {
                return
            }

            if fileSize > 0 {
                try stream(
                    fileURL,
                    range: range,
                    to: task,
                    identifier: identifier
                )
            }

            _ = deliver(identifier) {
                task.didFinish()
            }
        } catch {
            _ = deliver(identifier) {
                task.didFailWithError(error)
            }
        }
    }

    private func resolve(_ url: URL?) throws -> URL {
        guard
            let url,
            url.scheme?.lowercased() == Self.scheme,
            url.host?.lowercased() == Self.host
        else {
            throw ResourceError.invalidURL
        }

        let decodedPath = url.path.removingPercentEncoding ?? url.path
        let relativePath = decodedPath == "/"
            ? "index.html"
            : String(decodedPath.drop(while: { $0 == "/" }))

        guard
            !relativePath.isEmpty,
            !relativePath.contains("\0")
        else {
            throw ResourceError.invalidURL
        }

        let candidate = rootDirectory
            .appendingPathComponent(relativePath, isDirectory: false)
            .standardizedFileURL
        let rootPath = rootDirectory.path.hasSuffix("/")
            ? rootDirectory.path
            : rootDirectory.path + "/"

        guard candidate.path.hasPrefix(rootPath) else {
            throw ResourceError.outsideBundle
        }

        var isDirectory: ObjCBool = false
        guard
            FileManager.default.fileExists(
                atPath: candidate.path,
                isDirectory: &isDirectory
            ),
            !isDirectory.boolValue
        else {
            throw ResourceError.resourceNotFound
        }
        return candidate
    }

    private func stream(
        _ fileURL: URL,
        range: ClosedRange<Int64>,
        to task: WKURLSchemeTask,
        identifier: ObjectIdentifier
    ) throws {
        let handle = try FileHandle(forReadingFrom: fileURL)
        defer {
            try? handle.close()
        }

        try handle.seek(toOffset: UInt64(range.lowerBound))
        var remaining = range.upperBound - range.lowerBound + 1

        while remaining > 0, isActive(identifier) {
            let chunkSize = Int(min(remaining, 256 * 1024))
            guard let chunk = try handle.read(upToCount: chunkSize), !chunk.isEmpty else {
                throw ResourceError.unreadableResource
            }
            guard deliver(identifier, {
                task.didReceive(chunk)
            }) else {
                return
            }
            remaining -= Int64(chunk.count)
        }
    }

    private func byteRange(
        from header: String?,
        fileSize: Int64
    ) -> ClosedRange<Int64>? {
        guard
            fileSize > 0,
            let header,
            header.hasPrefix("bytes="),
            !header.contains(",")
        else {
            return nil
        }

        let value = String(header.dropFirst("bytes=".count))
        let parts = value.split(separator: "-", omittingEmptySubsequences: false)
        guard parts.count == 2 else {
            return nil
        }

        if parts[0].isEmpty, let suffixLength = Int64(parts[1]), suffixLength > 0 {
            let start = max(0, fileSize - suffixLength)
            return start...(fileSize - 1)
        }

        guard
            let start = Int64(parts[0]),
            start >= 0,
            start < fileSize
        else {
            return nil
        }

        let requestedEnd = parts[1].isEmpty
            ? fileSize - 1
            : (Int64(parts[1]) ?? fileSize - 1)
        let end = min(max(start, requestedEnd), fileSize - 1)
        return start...end
    }

    private func isActive(_ identifier: ObjectIdentifier) -> Bool {
        serialized {
            activeTasks.contains(identifier)
        }
    }

    @discardableResult
    private func deliver(
        _ identifier: ObjectIdentifier,
        _ callback: () -> Void
    ) -> Bool {
        serialized {
            guard activeTasks.contains(identifier) else {
                return false
            }
            callback()
            return true
        }
    }

    private func serialized<T>(_ operation: () -> T) -> T {
        if DispatchQueue.getSpecific(key: callbackQueueKey) != nil {
            return operation()
        }
        return callbackQueue.sync(execute: operation)
    }

    private static func mimeType(for fileURL: URL) -> String {
        switch fileURL.pathExtension.lowercased() {
        case "html", "htm": return "text/html; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "js", "mjs", "cjs": return "application/javascript; charset=utf-8"
        case "json", "gltf": return "application/json; charset=utf-8"
        case "wasm": return "application/wasm"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "webp": return "image/webp"
        case "gif": return "image/gif"
        case "ico": return "image/x-icon"
        case "mp3": return "audio/mpeg"
        case "m4a", "aac": return "audio/mp4"
        case "wav": return "audio/wav"
        case "ogg", "oga": return "audio/ogg"
        case "mp4", "m4v": return "video/mp4"
        case "webm": return "video/webm"
        case "glb": return "model/gltf-binary"
        case "bin": return "application/octet-stream"
        case "woff": return "font/woff"
        case "woff2": return "font/woff2"
        case "ttf": return "font/ttf"
        case "otf": return "font/otf"
        default: return "application/octet-stream"
        }
    }

    private static func cacheControl(for fileURL: URL) -> String {
        switch fileURL.pathExtension.lowercased() {
        case "html", "htm", "css", "js", "mjs", "json":
            return "no-cache"
        default:
            return "public, max-age=86400"
        }
    }
}

private enum ResourceError: LocalizedError {
    case invalidURL
    case outsideBundle
    case resourceNotFound
    case unreadableResource

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid bundled resource URL"
        case .outsideBundle:
            return "Bundled resource path escaped its root"
        case .resourceNotFound:
            return "Bundled resource was not found"
        case .unreadableResource:
            return "Bundled resource could not be read"
        }
    }
}
