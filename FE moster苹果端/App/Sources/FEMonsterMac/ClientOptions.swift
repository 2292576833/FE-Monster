import Foundation

/// Direct macOS translation of native/windows/winforms/ClientOptions.cs.
struct ClientOptions {
    let url: URL
    let width: CGFloat
    let height: CGFloat
    let gpuAcceleration: Bool
    let startServer: Bool
    let rootOverride: URL?
    let jarOverride: URL?
    let javaOverride: URL?

    var serverBaseURL: URL {
        var components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        components?.path = "/"
        components?.query = nil
        components?.fragment = nil
        return components?.url ?? URL(string: "http://127.0.0.1:3000/")!
    }

    var isLoopbackServer: Bool {
        Self.isLoopbackHost(url.host)
    }

    /// Mirrors ClientOptions.Parse, with --root/--jar/--java/--no-server for macOS packaging.
    static func parse(
        _ arguments: [String],
        environment: [String: String] = ProcessInfo.processInfo.environment
    ) -> ClientOptions {
        var values: [String: String] = [:]
        var flags = Set<String>()
        var index = 0
        while index < arguments.count {
            let argument = arguments[index]
            if argument.hasPrefix("--") {
                if index + 1 < arguments.count, !arguments[index + 1].hasPrefix("--") {
                    values[argument.lowercased()] = arguments[index + 1]
                    index += 2
                    continue
                }
                flags.insert(argument.lowercased())
            }
            index += 1
        }

        let defaultURL = "http://127.0.0.1:3000/?client=embedded&render=webkit&audio=webaudio"
        let rawURL = nonEmpty(values["--url"]) ?? defaultURL
        let parsedURL = URL(string: rawURL) ?? URL(string: defaultURL)!
        let root = fileURL(
            nonEmpty(values["--root"])
                ?? nonEmpty(environment["FE_MONSTER_ROOT"])
        )
        let jar = fileURL(
            nonEmpty(values["--jar"])
                ?? nonEmpty(environment["FE_MONSTER_JAR"])
        )
        let java = fileURL(
            nonEmpty(values["--java"])
                ?? nonEmpty(environment["FE_MONSTER_JAVA"])
        )

        return ClientOptions(
            url: parsedURL,
            width: CGFloat(max(860, integer(values["--width"], fallback: 1600))),
            height: CGFloat(max(560, integer(values["--height"], fallback: 900))),
            gpuAcceleration: boolean(values["--gpu"], fallback: true),
            startServer: !flags.contains("--no-server"),
            rootOverride: root,
            jarOverride: jar,
            javaOverride: java
        )
    }

    static func isLoopbackHost(_ host: String?) -> Bool {
        guard let host = host?.lowercased() else { return false }
        return host == "127.0.0.1" || host == "localhost" || host == "::1"
    }

    private static func nonEmpty(_ value: String?) -> String? {
        guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines),
              !value.isEmpty else {
            return nil
        }
        return value
    }

    private static func integer(_ value: String?, fallback: Int) -> Int {
        guard let value, let parsed = Int(value) else { return fallback }
        return parsed
    }

    private static func boolean(_ value: String?, fallback: Bool) -> Bool {
        guard let value else { return fallback }
        return ["1", "true", "yes", "on"].contains(value.lowercased())
    }

    private static func fileURL(_ path: String?) -> URL? {
        guard let path = nonEmpty(path) else { return nil }
        return URL(fileURLWithPath: NSString(string: path).expandingTildeInPath)
            .standardizedFileURL
    }
}
