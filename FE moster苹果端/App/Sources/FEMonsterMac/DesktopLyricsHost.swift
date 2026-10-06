import AppKit

/// Transparent, independent lyrics with native click-through and middle-click
/// lock control, including when the locked window does not receive DOM events.
@MainActor
final class DesktopLyricsHost {
    private let factory: DesktopSceneHost.SurfaceFactory
    private var surface: DesktopWebSurface?
    private var panel: DesktopPanel?
    private var state: [String: Any] = [:]
    private var hotBounds = NSRect.zero
    private var locked = true
    private var capturePointer = false
    private var pointerTimer: Timer?
    private var globalMouseMonitor: Any?
    private var localMouseMonitor: Any?
    private var displayObserver: NSObjectProtocol?
    var stateChanged: (() -> Void)?
    var onError: ((String) -> Void)?
    var isEnabled: Bool { panel?.isVisible == true }
    var isLocked: Bool { locked }

    init(factory: @escaping DesktopSceneHost.SurfaceFactory) {
        self.factory = factory
        displayObserver = NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main) { [weak self] _ in
            DispatchQueue.main.async { [weak self] in
                guard let self, let panel = self.panel, let screen = DesktopGeometry.screen(for: panel.frame) else { return }
                panel.setFrame(DesktopGeometry.clamp(panel.frame, to: screen.visibleFrame), display: true)
            }
        }
    }

    deinit {
        if let displayObserver { NotificationCenter.default.removeObserver(displayObserver) }
        pointerTimer?.invalidate()
    }

    func show(at url: URL, state: [String: Any]) {
        self.state = state
        if panel == nil {
            guard let screen = NSScreen.main else { return }
            let area = screen.visibleFrame, width = min(1220, area.width), height = min(360, area.height)
            let frame = NSRect(x: area.midX - width / 2, y: area.minY + 24, width: width, height: height)
            let window = DesktopPanel(contentRect: frame, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
            window.title = "FE Monster Desktop Lyrics"
            window.isReleasedWhenClosed = false
            window.isOpaque = false
            window.backgroundColor = .clear
            window.hasShadow = false
            window.level = .floating
            window.hidesOnDeactivate = false
            window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]
            window.ignoresMouseEvents = true
            let created = factory(desktopClientURL(url, client: "desktop-lyrics", path: "/desktop-lyrics.html"), true)
            surface = created; panel = window
            hotBounds = NSRect(x: 80, y: 72, width: max(80, width - 160), height: max(100, height - 130))
            created.ready = { [weak self] in self?.sendState() }
            created.failure = { [weak self] error in self?.onError?(error) }
            created.load(in: window)
            startPointerMonitoring()
        }
        locked = state["clickThrough"] as? Bool ?? locked
        panel?.orderFrontRegardless()
        sendState()
        stateChanged?()
    }

    func update(_ state: [String: Any]) {
        self.state = self.state.merging(state) { _, value in value }
        if let clickThrough = state["clickThrough"] as? Bool { locked = clickThrough }
        sendState()
    }

    func setLocked(_ value: Bool) {
        locked = value; capturePointer = false
        state["clickThrough"] = value
        sendState()
        stateChanged?()
    }

    func setPointerCapture(_ value: Bool) { capturePointer = value; updatePointer() }

    func setHotBounds(_ payload: [String: Any]) {
        guard let panel else { return }
        func number(_ key: String) -> CGFloat { CGFloat((payload[key] as? NSNumber)?.doubleValue ?? 0) }
        let left = number("left"), top = number("top"), right = number("right"), bottom = number("bottom")
        guard [left, top, right, bottom].allSatisfy(\.isFinite), right > left, bottom > top else { return }
        hotBounds = NSRect(x: left, y: panel.frame.height - bottom, width: right - left, height: bottom - top)
            .intersection(NSRect(origin: .zero, size: panel.frame.size))
    }

    func moveBy(dx: CGFloat, dy: CGFloat) {
        guard !locked, let panel, dx.isFinite, dy.isFinite else { return }
        var frame = panel.frame
        frame.origin.x += dx; frame.origin.y -= dy
        if let screen = DesktopGeometry.screen(for: frame) { frame = DesktopGeometry.clamp(frame, to: screen.visibleFrame, visible: 80) }
        panel.setFrame(frame, display: false)
    }

    func close() {
        pointerTimer?.invalidate(); pointerTimer = nil
        if let globalMouseMonitor { NSEvent.removeMonitor(globalMouseMonitor) }; globalMouseMonitor = nil
        if let localMouseMonitor { NSEvent.removeMonitor(localMouseMonitor) }; localMouseMonitor = nil
        surface?.close(); surface = nil
        panel?.close(); panel = nil
        stateChanged?()
    }

    func query() -> [String: Any] {
        var result: [String: Any] = ["enabled": isEnabled, "locked": locked, "supported": true]
        if let panel { result["bounds"] = DesktopGeometry.payload(panel.frame) }
        return result
    }

    func post(_ payload: [String: Any]) { surface?.post(payload) }

    private func sendState() {
        var outgoing = state
        outgoing["enabled"] = isEnabled
        outgoing["clickThrough"] = locked
        surface?.post(["type": "fe-desktop-lyrics-state", "state": outgoing])
        updatePointer()
    }

    private func startPointerMonitoring() {
        pointerTimer = Timer.scheduledTimer(withTimeInterval: 0.12, repeats: true) { [weak self] _ in
            DispatchQueue.main.async { [weak self] in self?.updatePointer() }
        }
        if let pointerTimer { RunLoop.main.add(pointerTimer, forMode: .common) }
        globalMouseMonitor = NSEvent.addGlobalMonitorForEvents(matching: .otherMouseDown) { [weak self] event in
            DispatchQueue.main.async { [weak self] in self?.middleClick(event) }
        }
        localMouseMonitor = NSEvent.addLocalMonitorForEvents(matching: .otherMouseDown) { [weak self] event in
            DispatchQueue.main.async { [weak self] in self?.middleClick(event) }
            return event
        }
    }

    @discardableResult private func middleClick(_ event: NSEvent) -> Bool {
        guard event.buttonNumber == 2, isEnabled, pointerInsideHotBounds() else { return false }
        setLocked(!locked)
        return true
    }

    private func pointerInsideHotBounds() -> Bool {
        guard let panel else { return false }
        let pointer = NSEvent.mouseLocation
        return hotBounds.contains(NSPoint(x: pointer.x - panel.frame.minX, y: pointer.y - panel.frame.minY))
    }

    private func updatePointer() {
        guard let panel, panel.isVisible else { return }
        let inside = pointerInsideHotBounds()
        panel.ignoresMouseEvents = locked || !(inside || capturePointer)
        if locked || !inside {
            // The locked surface passes real pointer input through, but its DOM
            // still needs hover coordinates to display the shared unlock hint.
            let point = NSEvent.mouseLocation
            let x = point.x - panel.frame.minX, y = panel.frame.maxY - point.y
            surface?.evaluate("window.dispatchEvent(new MouseEvent('mousemove',{clientX:\(x),clientY:\(y)}));")
        }
    }
}
