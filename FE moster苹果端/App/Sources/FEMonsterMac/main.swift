import AppKit
import Darwin

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuItemValidation {
    private let options: ClientOptions
    private let backend: BackendServer
    private var mainWindowController: FeMonsterWindowController?
    private var statusItem: NSStatusItem?
    private var terminationSignal: DispatchSourceSignal?
    private var smokeDeadline: Timer?
    private var smokeEvidence: [String: Any]?

    init(options: ClientOptions) {
        self.options = options
        backend = BackendServer(options: options)
        super.init()
    }

    /// macOS equivalent of Program.Main + FeMonsterForm.OnShown.
    func applicationDidFinishLaunching(_ notification: Notification) {
        installTerminationSignal()
        installMenu()
        let controller = FeMonsterWindowController(options: options)
        mainWindowController = controller
        if options.ciSmokeReport != nil {
            controller.onSmokeResult = { [weak self] result in
                switch result {
                case .success(let evidence): self?.finishSmoke(evidence)
                case .failure(let error): self?.finishSmoke(["ok": false, "error": error.localizedDescription])
                }
            }
            let timer = Timer(timeInterval: 120, repeats: false) { [weak self] _ in
                DispatchQueue.main.async { self?.finishSmoke(["ok": false, "error": "Native UI smoke timed out."]) }
            }
            smokeDeadline = timer
            RunLoop.main.add(timer, forMode: .common)
        }
        controller.showWindow(nil)
        installStatusMenu()
        NSApplication.shared.activate(ignoringOtherApps: true)
        backend.onUnexpectedExit = { [weak self, weak controller] message in
            controller?.showStartupFailure(message)
            self?.finishSmoke(["ok": false, "error": message])
        }

        backend.start { [weak self, weak controller] result in
            switch result {
            case .success(let url):
                controller?.loadApplication(at: url)
            case .failure(let error):
                controller?.showStartupFailure(error.localizedDescription)
                self?.finishSmoke(["ok": false, "error": error.localizedDescription])
            }
        }
    }

    /// Borderless windows do not get AppKit's default "quit after close" behavior.
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    /// Direct counterpart of FeMonsterForm.OnFormClosing lifecycle cleanup.
    func applicationWillTerminate(_ notification: Notification) {
        smokeDeadline?.invalidate()
        terminationSignal?.cancel()
        terminationSignal = nil
        mainWindowController?.prepareForTermination()
        backend.stopSynchronously()
        writeSmokeReportAfterShutdown()
        if let statusItem { NSStatusBar.system.removeStatusItem(statusItem) }
    }

    private func finishSmoke(_ evidence: [String: Any]) {
        guard options.ciSmokeReport != nil, smokeEvidence == nil else { return }
        smokeEvidence = evidence
        smokeDeadline?.invalidate()
        NSApplication.shared.terminate(nil)
    }

    private func writeSmokeReportAfterShutdown() {
        guard let report = options.ciSmokeReport else { return }
        var evidence = smokeEvidence ?? ["ok": false, "error": "The app terminated before UI verification."]
        let javaPID = backend.ownedProcessIdentifier ?? 0
        evidence["mainPID"] = Int(ProcessInfo.processInfo.processIdentifier)
        evidence["javaPID"] = Int(javaPID)
        evidence["javaExited"] = javaPID > 0 && Darwin.kill(javaPID, 0) != 0 && errno == ESRCH
        evidence["gracefulJavaShutdown"] = backend.didShutDownGracefully
        evidence["dataDirectory"] = report.deletingLastPathComponent().appendingPathComponent("data").path
        evidence["bundlePath"] = Bundle.main.bundleURL.resolvingSymlinksInPath().path
        evidence["ok"] = evidence["didFinish"] as? Bool == true
            && evidence["bootstrapResolved"] as? Bool == true
            && evidence["bridgeRoundTrip"] as? Bool == true
            && evidence["javaExited"] as? Bool == true && backend.didShutDownGracefully
        do {
            let data = try JSONSerialization.data(withJSONObject: evidence, options: [.prettyPrinted, .sortedKeys])
            try data.write(to: report, options: .atomic)
        } catch {
            fputs("Native UI smoke report failed: \(error.localizedDescription)\n", stderr)
        }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        mainWindowController?.showMainWindow()
        return true
    }

    @objc private func reloadApplication(_ sender: Any?) {
        mainWindowController?.reloadApplication()
    }

    @objc private func showMainWindow(_ sender: Any?) { mainWindowController?.showMainWindow() }
    @objc private func toggleDesktopPet(_ sender: Any?) { mainWindowController?.toggleDesktopPet() }
    @objc private func toggleDesktopScene(_ sender: Any?) { mainWindowController?.toggleDesktopScene() }
    @objc private func toggleDesktopLyrics(_ sender: Any?) { mainWindowController?.toggleDesktopLyrics() }
    @objc private func toggleDesktopLyricsLock(_ sender: Any?) { mainWindowController?.toggleDesktopLyricsLock() }
    @objc private func toggleSystemAudio(_ sender: Any?) {
        mainWindowController?.setSystemAudioEnabled(mainWindowController?.systemAudioEnabled != true)
    }

    func validateMenuItem(_ menuItem: NSMenuItem) -> Bool {
        switch menuItem.action {
        case #selector(toggleDesktopPet(_:)): menuItem.state = mainWindowController?.desktopPetVisible == true ? .on : .off
        case #selector(toggleDesktopScene(_:)): menuItem.state = mainWindowController?.desktopSceneEnabled == true ? .on : .off
        case #selector(toggleDesktopLyrics(_:)): menuItem.state = mainWindowController?.desktopLyricsEnabled == true ? .on : .off
        case #selector(toggleDesktopLyricsLock(_:)):
            menuItem.state = mainWindowController?.desktopLyricsLocked == true ? .on : .off
            return mainWindowController?.desktopLyricsEnabled == true
        case #selector(toggleSystemAudio(_:)): menuItem.state = mainWindowController?.systemAudioEnabled == true ? .on : .off
        default: break
        }
        return mainWindowController != nil
    }

    // The verified updater terminates this owned app before moving its bundle.
    // Handle TERM on the main queue so capture, windows, and Java are closed by
    // the same lifecycle as Command-Q instead of leaving the backend running.
    private func installTerminationSignal() {
        signal(SIGTERM, SIG_IGN)
        let source = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
        source.setEventHandler { DispatchQueue.main.async { NSApplication.shared.terminate(nil) } }
        terminationSignal = source
        source.resume()
    }

    private func installStatusMenu() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item.button?.image = NSImage(systemSymbolName: "waveform.circle.fill", accessibilityDescription: "FE Monster")
        if item.button?.image == nil { item.button?.title = "FE" }
        let menu = desktopMenu()
        menu.addItem(.separator())
        menu.addItem(withTitle: "退出 FE Monster", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        item.menu = menu
        statusItem = item
    }

    private func desktopMenu() -> NSMenu {
        let menu = NSMenu(title: "桌面")
        let items: [(String, Selector, String)] = [
            ("显示主窗口", #selector(showMainWindow(_:)), "0"),
            ("独立桌面宠物", #selector(toggleDesktopPet(_:)), "p"),
            ("桌面场景映射", #selector(toggleDesktopScene(_:)), "d"),
            ("桌面歌词", #selector(toggleDesktopLyrics(_:)), "l"),
            ("锁定桌面歌词", #selector(toggleDesktopLyricsLock(_:)), "k"),
            ("系统音频可视化", #selector(toggleSystemAudio(_:)), "")
        ]
        for (title, action, shortcut) in items {
            let item = menu.addItem(withTitle: title, action: action, keyEquivalent: shortcut)
            item.target = self
            if shortcut != "0" { item.keyEquivalentModifierMask = [.command, .shift] }
        }
        return menu
    }

    // AppKit dispatches Cmd+C/V/Q and other editing shortcuts through the main
    // menu. A programmatically-created borderless window has no default menu.
    private func installMenu() {
        let menu = NSMenu()
        let applicationItem = NSMenuItem()
        let applicationMenu = NSMenu(title: "FE Monster")
        applicationMenu.addItem(withTitle: "关于 FE Monster", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        applicationMenu.addItem(.separator())
        applicationMenu.addItem(withTitle: "隐藏 FE Monster", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        applicationMenu.addItem(.separator())
        applicationMenu.addItem(withTitle: "退出 FE Monster", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        applicationItem.submenu = applicationMenu
        menu.addItem(applicationItem)

        let editItem = NSMenuItem()
        let editMenu = NSMenu(title: "编辑")
        editMenu.addItem(withTitle: "撤销", action: Selector(("undo:")), keyEquivalent: "z")
        let redoItem = editMenu.addItem(withTitle: "重做", action: Selector(("redo:")), keyEquivalent: "z")
        redoItem.keyEquivalentModifierMask = [.command, .shift]
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "剪切", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "复制", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "粘贴", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "全选", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = editMenu
        menu.addItem(editItem)

        let desktopItem = NSMenuItem()
        desktopItem.submenu = desktopMenu()
        menu.addItem(desktopItem)

        let windowItem = NSMenuItem()
        let windowMenu = NSMenu(title: "窗口")
        windowMenu.addItem(withTitle: "最小化", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        let reloadItem = windowMenu.addItem(withTitle: "重新载入", action: #selector(reloadApplication(_:)), keyEquivalent: "r")
        reloadItem.target = self
        windowItem.submenu = windowMenu
        menu.addItem(windowItem)
        NSApplication.shared.mainMenu = menu
        NSApplication.shared.windowsMenu = windowMenu
    }
}

@main
@MainActor
enum FeMonsterApplication {
    static func main() {
        let application = NSApplication.shared
        let options = ClientOptions.parse(Array(CommandLine.arguments.dropFirst()))
        if CommandLine.arguments.contains(where: { $0.lowercased() == "--ci-smoke-report" }), options.ciSmokeReport == nil {
            fputs("--ci-smoke-report requires a fresh fe-monster-native-ui.* directory below the OS temporary directory.\n", stderr)
            if let index = CommandLine.arguments.firstIndex(where: { $0.lowercased() == "--ci-smoke-report" }),
               index + 1 < CommandLine.arguments.count {
                fputs("Native UI smoke path diagnostic: \(ClientOptions.smokeReportPathDiagnostics(CommandLine.arguments[index + 1]))\n", stderr)
            }
            exit(64)
        }
        let delegate = AppDelegate(options: options)
        application.setActivationPolicy(.regular)
        application.delegate = delegate

        // NSApplication's delegate is weak; retain it for the entire event loop.
        withExtendedLifetime(delegate) {
            application.run()
        }
    }
}
