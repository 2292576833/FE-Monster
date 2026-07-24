import Combine
import Foundation
import Security

enum NodeGatewayState: Equatable {
    case idle
    case starting
    case ready
    case failed(String)
}

struct NodeGatewayConnection: Sendable {
    let baseURL: URL
    let bearerToken: String
}

@MainActor
final class NodeGatewayController: ObservableObject {
    @Published private(set) var state: NodeGatewayState = .idle

    private var didLaunchEngine = false
    private var gatewayPort: UInt16?
    private var bearerToken: String?
    private var engineThread: Thread?
    private let urlSession: URLSession

    init() {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        configuration.timeoutIntervalForRequest = 12
        configuration.timeoutIntervalForResource = 20
        configuration.waitsForConnectivity = false
        urlSession = URLSession(configuration: configuration)
    }

    var connection: NodeGatewayConnection? {
        guard
            let gatewayPort,
            let bearerToken,
            let baseURL = URL(string: "http://127.0.0.1:\(gatewayPort)")
        else {
            return nil
        }

        return NodeGatewayConnection(baseURL: baseURL, bearerToken: bearerToken)
    }

    func startIfNeeded() async {
        guard !didLaunchEngine else {
            if state != .ready {
                await retryReadinessCheck()
            }
            return
        }

        state = .starting

        var pendingReadyFile: URL?
        do {
            let launch = try prepareLaunch()
            pendingReadyFile = launch.readyFile
            didLaunchEngine = true
            gatewayPort = nil
            bearerToken = launch.bearerToken

            let thread = Thread { [weak self] in
                let exitCode = NodeRunner.startEngine(withArguments: launch.arguments)
                Task { @MainActor [weak self] in
                    self?.engineDidExit(exitCode)
                }
            }
            thread.name = "com.femonster.ios.node"
            thread.qualityOfService = .userInitiated
            thread.stackSize = 2 * 1024 * 1024
            engineThread = thread
            thread.start()

            gatewayPort = try await waitForReadyHandshake(
                at: launch.readyFile,
                expectedNonce: launch.launchNonce
            )
            pendingReadyFile = nil
            try await waitUntilHealthy()
            state = .ready
        } catch {
            if let pendingReadyFile {
                try? FileManager.default.removeItem(at: pendingReadyFile)
            }
            state = .failed(Self.userFacingMessage(for: error))
        }
    }

    func retryReadinessCheck() async {
        guard didLaunchEngine else {
            await startIfNeeded()
            return
        }
        guard connection != nil else {
            state = .failed("本机服务没有建立安全端口，请完全退出后重新打开应用。")
            return
        }

        state = .starting
        do {
            try await waitUntilHealthy()
            state = .ready
        } catch {
            state = .failed(Self.userFacingMessage(for: error))
        }
    }

    private func prepareLaunch() throws -> (
        arguments: [String],
        readyFile: URL,
        launchNonce: String,
        bearerToken: String
    ) {
        guard
            let entryURL = Bundle.main.url(
                forResource: "main",
                withExtension: "cjs",
                subdirectory: "NodeGateway"
            )
        else {
            throw GatewayLaunchError.missingGatewayBundle
        }

        let dataDirectory = try Self.gatewayDataDirectory()
        let bearerToken = try SecureRandom.urlSafeString(byteCount: 32)
        let vaultKey = try KeychainVault.loadOrCreateKey()
        let launchNonce = try SecureRandom.urlSafeString(byteCount: 32)
        let readyFile = dataDirectory.appendingPathComponent(
            ".gateway-ready-\(launchNonce).json",
            isDirectory: false
        )

        let arguments = [
            "node",
            entryURL.path,
            "--host", "127.0.0.1",
            "--port", "0",
            "--token", bearerToken,
            "--vault-key", vaultKey,
            "--data-dir", dataDirectory.path,
            "--ready-file", readyFile.path,
            "--launch-nonce", launchNonce
        ]

        return (
            arguments: arguments,
            readyFile: readyFile,
            launchNonce: launchNonce,
            bearerToken: bearerToken
        )
    }

    private func waitForReadyHandshake(
        at readyFile: URL,
        expectedNonce: String
    ) async throws -> UInt16 {
        for _ in 0..<150 {
            try Task.checkCancellation()
            if FileManager.default.fileExists(atPath: readyFile.path) {
                let attributes = try FileManager.default.attributesOfItem(
                    atPath: readyFile.path
                )
                guard
                    let size = attributes[.size] as? NSNumber,
                    size.intValue > 0,
                    size.intValue <= 4 * 1024
                else {
                    throw GatewayLaunchError.invalidConnection
                }

                let data = try Data(contentsOf: readyFile, options: [.mappedIfSafe])
                let handshake = try JSONDecoder().decode(
                    GatewayReadyHandshake.self,
                    from: data
                )
                guard
                    handshake.mode == "ios-on-device",
                    handshake.launchNonce == expectedNonce,
                    handshake.port >= 1024
                else {
                    throw GatewayLaunchError.invalidConnection
                }
                try? FileManager.default.removeItem(at: readyFile)
                return handshake.port
            }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        throw GatewayLaunchError.readyHandshakeTimedOut
    }

    private func waitUntilHealthy() async throws {
        guard let connection else {
            throw GatewayLaunchError.invalidConnection
        }

        for _ in 0..<100 {
            try Task.checkCancellation()

            var request = URLRequest(
                url: connection.baseURL.appendingPathComponent("health"),
                cachePolicy: .reloadIgnoringLocalAndRemoteCacheData,
                timeoutInterval: 2
            )
            request.httpMethod = "GET"
            request.setValue(
                "Bearer \(connection.bearerToken)",
                forHTTPHeaderField: "Authorization"
            )

            do {
                let (_, response) = try await urlSession.data(for: request)
                if let httpResponse = response as? HTTPURLResponse,
                   (200..<300).contains(httpResponse.statusCode) {
                    return
                }
            } catch {
                // Node starts asynchronously; connection failures are expected here.
            }

            try await Task.sleep(nanoseconds: 200_000_000)
        }

        throw GatewayLaunchError.healthCheckTimedOut
    }

    private func engineDidExit(_ exitCode: Int32) {
        engineThread = nil
        guard state != .ready else {
            state = .failed("本机音乐服务已停止（代码 \(exitCode)）。请重新启动应用。")
            return
        }

        if case .starting = state {
            state = .failed("本机音乐服务启动失败（代码 \(exitCode)）。")
        }
    }

    private static func gatewayDataDirectory() throws -> URL {
        let fileManager = FileManager.default
        let applicationSupport = try fileManager.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let directory = applicationSupport
            .appendingPathComponent("FE Monster", isDirectory: true)
            .appendingPathComponent("NodeGateway", isDirectory: true)

        try fileManager.createDirectory(
            at: directory,
            withIntermediateDirectories: true,
            attributes: [
                .protectionKey: FileProtectionType.completeUntilFirstUserAuthentication
            ]
        )

        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var mutableDirectory = directory
        try? mutableDirectory.setResourceValues(values)
        return directory
    }

    private static func userFacingMessage(for error: Error) -> String {
        switch error {
        case GatewayLaunchError.missingGatewayBundle:
            return "应用包缺少 NodeGateway/main.cjs，请重新执行 iOS 资源准备脚本。"
        case GatewayLaunchError.healthCheckTimedOut:
            return "本机服务启动超时。请确认应用资源完整后重试。"
        case GatewayLaunchError.readyHandshakeTimedOut:
            return "本机服务没有返回安全端口。请完全退出后重新打开应用。"
        case GatewayLaunchError.invalidConnection:
            return "无法建立安全的本机连接。"
        default:
            return "启动失败：\(error.localizedDescription)"
        }
    }
}

private enum GatewayLaunchError: LocalizedError {
    case missingGatewayBundle
    case invalidConnection
    case readyHandshakeTimedOut
    case healthCheckTimedOut

    var errorDescription: String? {
        switch self {
        case .missingGatewayBundle:
            return "Missing bundled Node gateway"
        case .invalidConnection:
            return "Invalid loopback gateway connection"
        case .readyHandshakeTimedOut:
            return "Loopback gateway ready handshake timed out"
        case .healthCheckTimedOut:
            return "Loopback gateway health check timed out"
        }
    }
}

private struct GatewayReadyHandshake: Decodable {
    let mode: String
    let launchNonce: String
    let port: UInt16
}

private enum SecureRandom {
    static func urlSafeString(byteCount: Int) throws -> String {
        var bytes = [UInt8](repeating: 0, count: byteCount)
        let status = bytes.withUnsafeMutableBytes { buffer in
            guard let baseAddress = buffer.baseAddress else {
                return errSecParam
            }
            SecRandomCopyBytes(
                kSecRandomDefault,
                buffer.count,
                baseAddress
            )
        }
        guard status == errSecSuccess else {
            throw NSError(
                domain: NSOSStatusErrorDomain,
                code: Int(status),
                userInfo: nil
            )
        }

        return Data(bytes)
            .base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

private enum KeychainVault {
    private static let service = "com.femonster.ios.node-gateway"
    private static let account = "vault-key-v1"

    static func loadOrCreateKey() throws -> String {
        if let existing = try load() {
            return existing
        }

        let key = try SecureRandom.urlSafeString(byteCount: 32)
        guard let data = key.data(using: .utf8) else {
            throw GatewayLaunchError.invalidConnection
        }

        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account,
            kSecAttrAccessible: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
            kSecValueData: data
        ]
        let status = SecItemAdd(query as CFDictionary, nil)

        if status == errSecDuplicateItem, let existing = try load() {
            return existing
        }
        guard status == errSecSuccess else {
            throw keychainError(status)
        }
        return key
    }

    private static func load() throws -> String? {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account,
            kSecMatchLimit: kSecMatchLimitOne,
            kSecReturnData: true
        ]
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        if status == errSecItemNotFound {
            return nil
        }
        guard status == errSecSuccess else {
            throw keychainError(status)
        }
        guard
            let data = result as? Data,
            let value = String(data: data, encoding: .utf8),
            !value.isEmpty
        else {
            throw GatewayLaunchError.invalidConnection
        }
        return value
    }

    private static func keychainError(_ status: OSStatus) -> NSError {
        let message = SecCopyErrorMessageString(status, nil) as String? ?? "Keychain error"
        return NSError(
            domain: NSOSStatusErrorDomain,
            code: Int(status),
            userInfo: [NSLocalizedDescriptionKey: message]
        )
    }
}
