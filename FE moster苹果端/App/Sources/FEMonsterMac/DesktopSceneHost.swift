import AppKit
import CoreGraphics
import WebKit

/// One noninteractive wallpaper surface per physical display, below desktop icons.
@MainActor
final class DesktopSceneHost {
    typealias SurfaceFactory = @MainActor (URL, Bool) -> DesktopWebSurface
    private let factory: SurfaceFactory
    private var windows: [String: (NSWindow, DesktopWebSurface)] = [:]
    private var applicationURL: URL?
    private var wallpaperMode = false
    private var snapshot: [String: Any] = [:]
    private var displayObserver: NSObjectProtocol?
    var stateChanged: (() -> Void)?
    var onError: ((String) -> Void)?
    var isEnabled: Bool { !windows.isEmpty }
    var isWallpaper: Bool { isEnabled && wallpaperMode }

    init(factory: @escaping SurfaceFactory) {
        self.factory = factory
        displayObserver = NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main) { [weak self] _ in
            DispatchQueue.main.async { [weak self] in
                guard let self, self.isEnabled else { return }
                self.rebuildDisplays()
            }
        }
    }

    deinit {
        if let displayObserver { NotificationCenter.default.removeObserver(displayObserver) }
        // The controller closes all surfaces on navigation/termination. A
        // deinitializer has no guaranteed actor and must not call AppKit here.
    }

    func enable(at url: URL, snapshot: [String: Any], wallpaper: Bool = false) {
        if applicationURL != url || wallpaperMode != wallpaper { disable() }
        applicationURL = url
        wallpaperMode = wallpaper
        self.snapshot = snapshot
        rebuildDisplays()
        stateChanged?()
    }

    func update(_ snapshot: [String: Any]) {
        self.snapshot = snapshot
        for (_, surface) in windows.values { sendSnapshot(to: surface) }
    }

    func post(_ payload: [String: Any]) { for (_, surface) in windows.values { surface.post(payload) } }

    func disable() {
        let active = Array(windows.values)
        windows.removeAll()
        for (window, surface) in active { surface.close(); window.close() }
        stateChanged?()
    }

    private func rebuildDisplays() {
        guard let applicationURL else { return }
        let available = Set(NSScreen.screens.map(DesktopGeometry.screenID))
        for key in Array(windows.keys) where !available.contains(key) {
            if let (window, surface) = windows.removeValue(forKey: key) { surface.close(); window.close() }
        }
        for screen in NSScreen.screens {
            let key = DesktopGeometry.screenID(screen)
            if let existing = windows[key] { existing.0.setFrame(screen.frame, display: true); continue }
            let window = NSWindow(contentRect: screen.frame, styleMask: [.borderless], backing: .buffered, defer: false)
            window.title = wallpaperMode ? "FE Monster Wallpaper" : "FE Monster Desktop Scene"
            window.isReleasedWhenClosed = false
            window.isOpaque = true
            window.backgroundColor = .black
            window.hasShadow = false
            window.ignoresMouseEvents = true
            window.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.desktopWindow)) + 1)
            window.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle]
            let url = desktopClientURL(applicationURL, client: "desktop-scene", path: wallpaperMode ? "/wallpaper.html" : nil)
            let surface = factory(url, false)
            surface.ready = { [weak self, weak surface] in if let surface { self?.sendSnapshot(to: surface) } }
            surface.failure = { [weak self] error in self?.onError?(error) }
            windows[key] = (window, surface)
            surface.load(in: window)
            window.orderFrontRegardless()
        }
    }

    private func sendSnapshot(to surface: DesktopWebSurface) {
        if wallpaperMode {
            surface.post(["type": "fe-wallpaper-state", "state": snapshot.merging(["enabled": true]) { _, value in value }])
        } else {
            surface.post(["type": "fe-desktop-scene-state", "snapshot": snapshot])
        }
    }
}
