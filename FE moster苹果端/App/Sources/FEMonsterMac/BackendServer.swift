import Darwin
import Foundation

final class BackendServer {
    enum StartupError: LocalizedError {
        case projectRootMissing
        case jarMissing
        case javaMissing
        case launchFailed(String)
        case readinessTimeout(String)

        var errorDescription: String? {
            switch self {
            case .projectRootMissing:
                return "找不到 FE Monster 资源目录。请设置 FE_MONSTER_ROOT。"
            case .jarMissing:
                return "找不到 fe-monster-java.jar。请设置 FE_MONSTER_JAR。"
            case .javaMissing:
                return "找不到 Java 运行时。请设置 FE_MONSTER_JAVA。"
            case .launchFailed(let detail):
                return "FE Monster Java 服务启动失败：\(detail)"
            case .readinessTimeout(let detail):
                return "FE Monster Java 服务未在限定时间内就绪。\(detail)"
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
    private var runtimeBaseURL: URL
    private var completion: ((Result<URL, Error>) -> Void)?
    private var completed = false
    private var stopping = false

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

            self.probeHealth(at: self.runtimeBaseURL) { healthy in
                if healthy {
                    self.finish(.success(self.applicationURL(for: self.runtimeBaseURL)))
                } else {
                    self.launchJavaServer()
                }
            }
        }
    }

    /// Direct counterpart of FeMonsterForm.RequestServerQuitAsync plus process fallback cleanup.
    func stopSynchronously() {
        let snapshot: (URL, Process?, Bool) = queue.sync {
            stopping = true
            return (runtimeBaseURL, process, options.startServer && options.isLoopbackServer)
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
        environment["FE_MONSTER_PORT"] = String(runtimeBaseURL.port ?? 3000)
        environment["FE_MONSTER_ROOT"] = root.path
        environment["FE_MONSTER_WEB_ROOT"] =
            environment["FE_MONSTER_WEB_ROOT"] ?? root.appendingPathComponent("web").path
        environment["FE_MONSTER_DATA_DIR"] =
            environment["FE_MONSTER_DATA_DIR"] ?? applicationSupportDirectory().path
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
                guard let self, !self.stopping, !self.completed else { return }
                self.finish(.failure(StartupError.launchFailed(
                    "进程退出码 \(terminatedProcess.terminationStatus)。\(self.outputTail())"
                )))
            }
        }

        do {
            try FileManager.default.createDirectory(
                at: applicationSupportDirectory(),
                withIntermediateDirectories: true
            )
            try process.run()
            self.process = process
            outputPipe = pipe
            pollUntilReady(attempt: 0)
        } catch {
            pipe.fileHandleForReading.readabilityHandler = nil
            finish(.failure(StartupError.launchFailed(error.localizedDescription)))
        }
    }

    private func pollUntilReady(attempt: Int) {
        guard !completed, !stopping else { return }
        let baseURL = runtimeBaseURL
        probeHealth(at: baseURL) { healthy in
            guard !self.completed, !self.stopping else { return }
            if healthy {
                self.finish(.success(self.applicationURL(for: baseURL)))
                return
            }
            guard attempt < 79 else {
                self.finish(.failure(StartupError.readinessTimeout(self.outputTail())))
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
        URLSession.shared.dataTask(with: request) { data, response, _ in
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            var healthy = (200..<300).contains(status)
            if healthy, let data,
               let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let ok = object["ok"] as? Bool {
                healthy = ok
            }
            self.queue.async {
                completion(healthy)
            }
        }.resume()
    }

    private func consumeProcessOutput(_ data: Data) {
        guard let text = String(data: data, encoding: .utf8) else { return }
        outputText += text
        if outputText.count > 32_000 {
            outputText = String(outputText.suffix(32_000))
        }

        let pattern = #"URL:\s+(http://(?:127\.0\.0\.1|localhost|\[::1\]):\d+/)"#
        guard let expression = try? NSRegularExpression(pattern: pattern),
              let match = expression.firstMatch(
                in: outputText,
                range: NSRange(outputText.startIndex..., in: outputText)
              ),
              let range = Range(match.range(at: 1), in: outputText),
              let discoveredURL = URL(string: String(outputText[range])) else {
            return
        }
        runtimeBaseURL = discoveredURL
    }

    private func finish(_ result: Result<URL, Error>) {
        guard !completed else { return }
        completed = true
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
        let candidates: [URL?] = [
            options.rootOverride,
            Bundle.main.resourceURL?.appendingPathComponent("App", isDirectory: true),
            URL(fileURLWithPath: fileManager.currentDirectoryPath, isDirectory: true)
        ]
        for candidate in candidates.compactMap({ $0?.standardizedFileURL }) {
            let hasWeb = fileManager.fileExists(
                atPath: candidate.appendingPathComponent("web", isDirectory: true).path
            )
            if hasWeb || resolveJar(in: candidate) != nil {
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

    private func applicationSupportDirectory() -> URL {
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
        URLSession.shared.dataTask(with: request) { _, _, _ in
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
