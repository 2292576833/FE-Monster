import AppKit

final class AppDelegate: NSObject, NSApplicationDelegate {
    private let options: ClientOptions
    private let backend: BackendServer
    private var mainWindowController: FeMonsterWindowController?

    init(options: ClientOptions) {
        self.options = options
        backend = BackendServer(options: options)
        super.init()
    }

    /// macOS equivalent of Program.Main + FeMonsterForm.OnShown.
    func applicationDidFinishLaunching(_ notification: Notification) {
        let controller = FeMonsterWindowController(options: options)
        mainWindowController = controller
        controller.showWindow(nil)
        NSApplication.shared.activate(ignoringOtherApps: true)

        backend.start { [weak controller] result in
            switch result {
            case .success(let url):
                controller?.loadApplication(at: url)
            case .failure(let error):
                controller?.showStartupFailure(error.localizedDescription)
            }
        }
    }

    /// Borderless windows do not get AppKit's default "quit after close" behavior.
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    /// Direct counterpart of FeMonsterForm.OnFormClosing lifecycle cleanup.
    func applicationWillTerminate(_ notification: Notification) {
        mainWindowController?.prepareForTermination()
        backend.stopSynchronously()
    }
}

let application = NSApplication.shared
let options = ClientOptions.parse(Array(CommandLine.arguments.dropFirst()))
let delegate = AppDelegate(options: options)
application.setActivationPolicy(.regular)
application.delegate = delegate
application.run()
