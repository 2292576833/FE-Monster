import Darwin
import Foundation

final class BackendServer {
    enum StartupError: LocalizedError {
        case projectRootMissing
        case jarMissing
        case javaMissing
        case launchFailed(String)
        case readinessTimeout(String)
        case invalidDevelopmentDataDirectory

        var errorDescription: String? {
            switch self {
            case .projectRootMissing:
                return "找不到完整的 FE Monster 资源目录。请重新安装应用，或在开发模式使用 --root 指定项目目录。"
            case .jarMissing:
                return "找不到 fe-monster-java.jar。请重新安装完整应用，或使用 --jar 指定 Java 服务文件。"
            case .javaMissing:
                return "找不到 Java 运行时。请重新安装完整应用，或使用 --java 指定 Java 可执行文件。"
            case .launchFailed(let detail):
                return "FE Monster Java 服务启动失败：\(detail)"
            case .readinessTimeout(let detail):
                return "FE Monster Java 服务未在限定时间内就绪。\(detail)"
            case .invalidDevelopmentDataDirectory:
                return "开发数据目录必须是资源目录之外的绝对路径。请为 FE_MONSTER_DATA_DIR 设置单独的可写测试目录。"
            }
        }
    }

    private struct JavaCommand {
        let executable: URL
        let argumentPrefix: [String]
    }

    private let options: ClientOptions
    private let queue = DispatchQueue(label: "com.femonster.mac.backend")
    private var process: Process?
    private var outputPipe: Pipe?
    private var outputText = ""
    private var pendingOutput = Data()
    private var runtimeBaseURL: URL
    private var didDiscoverServerURL = false
    private var completion: ((Result<URL, Error>) -> Void)?
    private var completed = false
    private var ready = false
    private var stopping = false
    private var startupDeadline = Date.distantPast
    var onUnexpectedExit: ((String) -> Void)?
    private let localSession: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.connectionProxyDictionary = [:]
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.httpCookieStorage = nil
        return URLSession(configuration: configuration)
    }()

    init(options: ClientOptions) {
        self.options = options
        runtimeBaseURL = options.serverBaseURL
    }

    /// macOS counterpart of scripts/launch-fe-monster.ps1 and FeMonsterJavaApp startup.
    func start(completion: @escaping (Result<URL, Error>) -> Void) {
        queue.async {
            self.completion = completion

            guard self.options.startServer, self.options.isLoopbackServer else {
                self.finish(.success(self.options.url))
                return
            }

            // Each client owns its Java process and an OS-assigned port. Reusing an
            // arbitrary service on port 3000 can connect to an old installation or
            // another user session, then accidentally stop it when this app closes.
            self.launchJavaServer()
        }
    }

    /// Direct counterpart of FeMonsterForm.RequestServerQuitAsync plus process fallback cleanup.
    func stopSynchronously() {
        let snapshot: (URL, Process?, Bool) = queue.sync {
            stopping = true
            return (runtimeBaseURL, process, process?.isRunning == true && didDiscoverServerURL)
        }

        if snapshot.2 {
            requestServerQuit(at: snapshot.0)
        }

        guard let process = snapshot.1, process.isRunning else {
            queue.sync {
                outputPipe?.fileHandleForReading.readabilityHandler = nil
                outputPipe = nil
            }
            return
        }

        let gracefulDeadline = Date().addingTimeInterval(1.2)
        while process.isRunning, Date() < gracefulDeadline {
            Thread.sleep(forTimeInterval: 0.04)
        }
        if process.isRunning {
            process.terminate()
        }

        let terminateDeadline = Date().addingTimeInterval(0.7)
        while process.isRunning, Date() < terminateDeadline {
            Thread.sleep(forTimeInterval: 0.04)
        }
        if process.isRunning {
            Darwin.kill(process.processIdentifier, SIGKILL)
        }

        queue.sync {
            outputPipe?.fileHandleForReading.readabilityHandler = nil
            outputPipe = nil
            self.process = nil
        }
    }

    private func launchJavaServer() {
        guard let root = resolveProjectRoot() else {
            finish(.failure(StartupError.projectRootMissing))
            return
        }
        guard let jar = resolveJar(in: root) else {
            finish(.failure(StartupError.jarMissing))
            return
        }
        guard let java = resolveJava(in: root) else {
            finish(.failure(StartupError.javaMissing))
            return
        }
        let dataDirectory: URL
        do {
            dataDirectory = try applicationSupportDirectory(in: root)
        } catch {
            finish(.failure(error))
            return
        }

        let process = Process()
        let pipe = Pipe()
        process.executableURL = java.executable
        process.arguments = java.argumentPrefix + [
            "--enable-native-access=ALL-UNNAMED",
            "-jar",
            jar.path,
            "--no-client"
        ]
        process.currentDirectoryURL = root
        process.standardOutput = pipe
        process.standardError = pipe

        var environment = ProcessInfo.processInfo.environment
        environment["FE_MONSTER_BIND"] = "127.0.0.1"
        environment["FE_MONSTER_PORT"] = "0"
        environment["FE_MONSTER_ROOT"] = root.path
        environment["FE_MONSTER_WEB_ROOT"] = root.appendingPathComponent("web").path
        environment["FE_MONSTER_DATA_DIR"] = dataDirectory.path
        environment["FE_MONSTER_MAIN_PID"] = String(ProcessInfo.processInfo.processIdentifier)
        if Bundle.main.bundleURL.pathExtension.lowercased() == "app" {
            environment.removeValue(forKey: "FE_MONSTER_DEV")
            environment.removeValue(forKey: "FE_MONSTER_COREAUDIO_LIBRARY")
            environment["FE_MONSTER_BUNDLE_PATH"] = Bundle.main.bundleURL.resolvingSymlinksInPath().path
        } else {
            environment.removeValue(forKey: "FE_MONSTER_BUNDLE_PATH")
        }
        let bundledNode = root.appendingPathComponent("runtime/node/node")
        if FileManager.default.isExecutableFile(atPath: bundledNode.path) {
            environment["FE_MONSTER_NODE"] = bundledNode.path
        } else if Bundle.main.bundleURL.pathExtension.lowercased() == "app" {
            environment.removeValue(forKey: "FE_MONSTER_NODE")
        }
        process.environment = environment

        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty else { return }
            self?.queue.async {
                self?.consumeProcessOutput(data)
            }
        }
        process.terminationHandler = { [weak self] terminatedProcess in
            self?.queue.async {
                guard let self, !self.stopping else { return }
                let error = StartupError.launchFailed(
                    "进程退出码 \(terminatedProcess.terminationStatus)。\(self.outputTail())"
                )
                if !self.completed {
                    self.finish(.failure(error))
                } else if self.ready {
                    let callback = self.onUnexpectedExit
                    DispatchQueue.main.async { callback?(error.localizedDescription) }
                }
            }
        }

        do {
            try FileManager.default.createDirectory(
                at: dataDirectory,
                withIntermediateDirectories: true
            )
            try process.run()
            self.process = process
            outputPipe = pipe
            startupDeadline = Date().addingTimeInterval(45)
            pollUntilReady(attempt: 0)
        } catch {
            pipe.fileHandleForReading.readabilityHandler = nil
            finish(.failure(StartupError.launchFailed(error.localizedDescription)))
        }
    }

    private func pollUntilReady(attempt: Int) {
        guard !completed, !stopping else { return }
        guard Date() < startupDeadline else {
            finish(.failure(StartupError.readinessTimeout(outputTail())))
            return
        }
        // Wait for the address printed by our child; never probe the default port
        // before it is known, even if another FE Monster instance responds there.
        guard didDiscoverServerURL else {
            queue.asyncAfter(deadline: .now() + 0.15) {
                self.pollUntilReady(attempt: attempt + 1)
            }
            return
        }
        let baseURL = runtimeBaseURL
        probeHealth(at: baseURL) { healthy in
            guard !self.completed, !self.stopping else { return }
            if healthy {
                self.finish(.success(self.applicationURL(for: baseURL)))
                return
            }
            self.queue.asyncAfter(deadline: .now() + 0.15) {
                self.pollUntilReady(attempt: attempt + 1)
            }
        }
    }

    private func probeHealth(at baseURL: URL, completion: @escaping (Bool) -> Void) {
        let healthURL = URL(string: "api/app/version", relativeTo: baseURL)!.absoluteURL
        var request = URLRequest(url: healthURL)
        request.timeoutInterval = 0.9
        localSession.dataTask(with: request) { data, response, _ in
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            let object = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
            let healthy = (200..<300).contains(status)
                && (object?["ok"] as? Bool) == true
                && (object?["name"] as? String) == "FE Monster Java"
                && !(object?["version"] as? String ?? "").isEmpty
            guard healthy else {
                self.queue.async { completion(false) }
                return
            }
            self.probeAppShell(at: baseURL) { ready in
                self.queue.async { completion(ready) }
            }
        }.resume()
    }

    private func probeAppShell(at baseURL: URL, completion: @escaping (Bool) -> Void) {
        var request = URLRequest(url: baseURL)
        request.timeoutInterval = 0.9
        localSession.dataTask(with: request) { data, response, _ in
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            let html = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
            completion((200..<300).contains(status) && html.contains("FE Monster") && html.contains("bootScreen"))
        }.resume()
    }

    private func consumeProcessOutput(_ data: Data) {
        pendingOutput.append(data)
        // Read complete UTF-8 lines: a Pipe callback may split a multibyte Chinese
        // character or the URL itself across chunks.
        while let newline = pendingOutput.firstIndex(of: 0x0A) {
            let line = String(decoding: pendingOutput.prefix(through: newline), as: UTF8.self)
            pendingOutput.removeSubrange(...newline)
            outputText += line
            discoverServerURL(in: line)
        }
        if pendingOutput.count > 64_000 {
            outputText += String(decoding: pendingOutput, as: UTF8.self)
            pendingOutput.removeAll(keepingCapacity: true)
        }
        if outputText.count > 32_000 {
            outputText = String(outputText.suffix(32_000))
        }
    }

    private func discoverServerURL(in text: String) {
        guard !didDiscoverServerURL else { return }
        let pattern = #"^URL:\s+(http://(?:127\.0\.0\.1|localhost|\[::1\]):\d+/)\s*$"#
        guard let expression = try? NSRegularExpression(pattern: pattern),
              let match = expression.firstMatch(
                in: text,
                range: NSRange(text.startIndex..., in: text)
              ),
              let range = Range(match.range(at: 1), in: text),
              let discoveredURL = URL(string: String(text[range])),
              let port = discoveredURL.port, (1...65535).contains(port) else {
            return
        }
        runtimeBaseURL = discoveredURL
        didDiscoverServerURL = true
    }

    private func finish(_ result: Result<URL, Error>) {
        guard !completed, !stopping else { return }
        completed = true
        if case .success = result { ready = true }
        if case .failure = result, let process, process.isRunning {
            process.terminate()
            // Keep cleanup tied to this exact child rather than a broad process name.
            self.queue.asyncAfter(deadline: .now() + 1.5) {
                if process.isRunning { Darwin.kill(process.processIdentifier, SIGKILL) }
            }
        }
        let callback = completion
        completion = nil
        DispatchQueue.main.async {
            callback?(result)
        }
    }

    private func applicationURL(for baseURL: URL) -> URL {
        var target = URLComponents(url: options.url, resolvingAgainstBaseURL: false)
        target?.scheme = baseURL.scheme
        target?.host = baseURL.host
        target?.port = baseURL.port
        return target?.url ?? options.url
    }

    private func resolveProjectRoot() -> URL? {
        let fileManager = FileManager.default
        var candidates: [URL?] = [
            options.rootOverride,
            Bundle.main.resourceURL?.appendingPathComponent("App", isDirectory: true)
        ]
        if Bundle.main.bundleURL.pathExtension.lowercased() != "app" {
            candidates.append(URL(fileURLWithPath: fileManager.currentDirectoryPath, isDirectory: true))
        }
        for candidate in candidates.compactMap({ $0?.standardizedFileURL }) {
            let hasWeb = fileManager.fileExists(
                atPath: candidate.appendingPathComponent("web/index.html").path
            )
            if hasWeb && resolveJar(in: candidate) != nil {
                return candidate
            }
        }
        return nil
    }

    private func resolveJar(in root: URL) -> URL? {
        let fileManager = FileManager.default
        let directCandidates = [
            options.jarOverride,
            root.appendingPathComponent("fe-monster-java.jar"),
            root.appendingPathComponent("out/fe-monster-java.jar")
        ]
        for candidate in directCandidates.compactMap({ $0?.standardizedFileURL })
            where fileManager.isReadableFile(atPath: candidate.path) {
            return candidate
        }

        let outputDirectory = root.appendingPathComponent("out", isDirectory: true)
        guard let entries = try? fileManager.contentsOfDirectory(
            at: outputDirectory,
            includingPropertiesForKeys: [.contentModificationDateKey],
            options: [.skipsHiddenFiles]
        ) else {
            return nil
        }
        return entries
            .filter { $0.lastPathComponent.hasPrefix("fe-monster-java-") && $0.pathExtension == "jar" }
            .sorted {
                let left = try? $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate
                let right = try? $1.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate
                return (left ?? .distantPast) > (right ?? .distantPast)
            }
            .first
    }

    private func resolveJava(in root: URL) -> JavaCommand? {
        let fileManager = FileManager.default
        let bundledCandidates = [
            options.javaOverride,
            root.appendingPathComponent("runtime/java/bin/java"),
            Bundle.main.resourceURL?.appendingPathComponent("App/runtime/java/bin/java"),
            root.appendingPathComponent("runtime/Contents/Home/bin/java"),
            Bundle.main.resourceURL?.appendingPathComponent("runtime/Contents/Home/bin/java"),
            URL(fileURLWithPath: "/usr/bin/java")
        ]
        for candidate in bundledCandidates.compactMap({ $0?.standardizedFileURL })
            where fileManager.isExecutableFile(atPath: candidate.path) {
            return JavaCommand(executable: candidate, argumentPrefix: [])
        }

        let env = URL(fileURLWithPath: "/usr/bin/env")
        if fileManager.isExecutableFile(atPath: env.path) {
            return JavaCommand(executable: env, argumentPrefix: ["java"])
        }
        return nil
    }

    private func applicationSupportDirectory(in root: URL) throws -> URL {
        let environment = ProcessInfo.processInfo.environment
        if Bundle.main.bundleURL.pathExtension.lowercased() != "app",
           environment["FE_MONSTER_DEV"] == "1",
           let requested = environment["FE_MONSTER_DATA_DIR"]?.trimmingCharacters(in: .whitespacesAndNewlines),
           !requested.isEmpty {
            guard NSString(string: requested).isAbsolutePath else {
                throw StartupError.invalidDevelopmentDataDirectory
            }
            let candidate = URL(fileURLWithPath: requested, isDirectory: true)
                .standardizedFileURL.resolvingSymlinksInPath()
            let resourceRoots = [root, Bundle.main.resourceURL].compactMap { $0 }
                .map { $0.standardizedFileURL.resolvingSymlinksInPath().path }
            guard !resourceRoots.contains(where: { candidate.path == $0 || candidate.path.hasPrefix($0 + "/") }) else {
                throw StartupError.invalidDevelopmentDataDirectory
            }
            return candidate
        }
        let base = FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first ?? FileManager.default.homeDirectoryForCurrentUser
        return base.appendingPathComponent("FE Monster", isDirectory: true)
    }

    private func requestServerQuit(at baseURL: URL) {
        guard let url = URL(string: "api/app/window/quit", relativeTo: baseURL)?.absoluteURL else {
            return
        }
        var request = URLRequest(url: url)
        request.timeoutInterval = 1.0
        let semaphore = DispatchSemaphore(value: 0)
        localSession.dataTask(with: request) { _, _, _ in
            semaphore.signal()
        }.resume()
        _ = semaphore.wait(timeout: .now() + 1.1)
    }

    private func outputTail() -> String {
        let tail = outputText
            .split(whereSeparator: \.isNewline)
            .suffix(8)
            .joined(separator: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return tail.isEmpty ? "" : "\n\(tail)"
    }
}
