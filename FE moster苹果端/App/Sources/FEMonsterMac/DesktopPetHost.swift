import AppKit

/// Transparent independent pet, preserving the shared page's right/bottom anchor
/// while its speech bubble and chat panel expand the interactive native surface.
@MainActor
final class DesktopPetHost {
    private let factory: DesktopSceneHost.SurfaceFactory
    private var surface: DesktopWebSurface?
    private var panel: DesktopPanel?
    private var timer: Timer?
    private var displayObserver: NSObjectProtocol?
    private var panelOpen = false
    private var bubbleVisible = false
    private var panelHit: NSBezierPath?
    private var bubbleHit: NSBezierPath?
    private var moving = false
    private var dockEdge = "none"
    private var autoHidden = false
    private var dockArea = NSRect.zero
    private var dockOrigin = NSPoint.zero
    private var lastInside = Date()
    private var glide: (start: NSPoint, target: NSPoint, began: Date, duration: Double, completion: (String?) -> Void)?
    private let preferences: UserDefaults
    var stateChanged: (() -> Void)?
    var onError: ((String) -> Void)?
    var isEnabled: Bool { panel != nil }
    var isVisible: Bool { panel?.isVisible == true }

    init(factory: @escaping DesktopSceneHost.SurfaceFactory) {
        self.factory = factory
        let requestedSuite = ProcessInfo.processInfo.environment["FE_MONSTER_DESKTOP_TEST_SUITE"] ?? ""
        let suite = requestedSuite.hasPrefix("com.femonster.desktop.test.") ? requestedSuite : "com.femonster.desktop"
        preferences = UserDefaults(suiteName: suite) ?? .standard
        displayObserver = NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main) { [weak self] _ in
            DispatchQueue.main.async { [weak self] in
                guard let self, let panel = self.panel else { return }
                self.dockEdge = "none"
                self.autoHidden = false
                self.clamp(panel)
                self.stateChanged?()
            }
        }
    }

    deinit {
        if let displayObserver { NotificationCenter.default.removeObserver(displayObserver) }
        timer?.invalidate()
    }

    func show(at url: URL) {
        if panel == nil {
            let window = DesktopPanel(contentRect: NSRect(x: 0, y: 0, width: 300, height: 340), styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
            window.title = "FE Monster Desktop Pet"
            window.isReleasedWhenClosed = false
            window.isOpaque = false
            window.backgroundColor = .clear
            window.hasShadow = false
            window.level = .floating
            window.isFloatingPanel = true
            window.hidesOnDeactivate = false
            window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]
            let created = factory(desktopClientURL(url, client: "desktop-pet"), true)
            created.ready = { [weak self] in self?.stateChanged?() }
            created.failure = { [weak self] error in self?.onError?(error) }
            panel = window
            surface = created
            restorePosition(window)
            created.load(in: window)
            scheduleTimer(interval: 0.08)
        }
        guard let panel else { return }
        reveal()
        clamp(panel)
        panel.makeKeyAndOrderFront(nil)
        lastInside = Date()
        stateChanged?()
    }

    func hide() {
        cancelGlide()
        savePosition()
        panel?.orderOut(nil)
        stateChanged?()
    }

    func disable() {
        cancelGlide()
        savePosition()
        timer?.invalidate(); timer = nil
        surface?.close(); surface = nil
        panel?.close(); panel = nil
        panelOpen = false; bubbleVisible = false; panelHit = nil; bubbleHit = nil
        dockEdge = "none"; autoHidden = false; moving = false
        stateChanged?()
    }

    func post(_ payload: [String: Any]) { surface?.post(payload) }

    func setPanel(_ payload: [String: Any]) {
        panelOpen = payload["open"] as? Bool == true
        resizeForContent()
        panelHit = panelOpen ? hitPath(payload) : nil
        if panelOpen { reveal(); panel?.makeKeyAndOrderFront(nil) }
    }

    func setBubble(_ payload: [String: Any]) {
        bubbleVisible = payload["visible"] as? Bool == true
        resizeForContent()
        bubbleHit = bubbleVisible ? hitPath(payload) : nil
    }

    func moveBy(dx: CGFloat, dy: CGFloat) {
        guard let panel, dx.isFinite, dy.isFinite else { return }
        cancelGlide(); reveal(); moving = true; dockEdge = "none"
        var frame = panel.frame
        frame.origin.x += dx; frame.origin.y -= dy
        // Choose the destination display so dragging can cross monitor boundaries.
        if let screen = DesktopGeometry.screen(for: frame) { frame = DesktopGeometry.clamp(frame, to: screen.visibleFrame, visible: 56) }
        panel.setFrame(frame, display: false)
    }

    func endMove() {
        moving = false
        dockIfNearEdge()
        savePosition()
        stateChanged?()
    }

    func queryBounds() -> [String: Any] {
        guard let panel, let screen = DesktopGeometry.screen(for: panel.frame) else { return ["available": false] }
        let frame = panel.frame, area = screen.visibleFrame
        var payload = DesktopGeometry.payload(frame)
        payload["available"] = true
        payload["workingArea"] = DesktopGeometry.payload(area)
        payload["screenId"] = DesktopGeometry.screenID(screen)
        payload["xPercent"] = min(1, max(0, (frame.minX - area.minX) / max(1, area.width - frame.width)))
        payload["yPercent"] = min(1, max(0, (area.maxY - frame.maxY) / max(1, area.height - frame.height)))
        payload["dockEdge"] = dockEdge
        payload["autoHidden"] = autoHidden
        payload["moving"] = moving
        payload["gliding"] = glide != nil
        return payload
    }

    func glideTo(_ payload: [String: Any], completion: @escaping (String?) -> Void) {
        guard let panel else { completion("请先启用桌面宠物。"); return }
        let anchors: [String: (Double, Double)] = [
            "top-left": (0, 0), "top-center": (0.5, 0), "top-right": (1, 0),
            "center-left": (0, 0.5), "center": (0.5, 0.5), "center-right": (1, 0.5),
            "bottom-left": (0, 1), "bottom-center": (0.5, 1), "bottom-right": (1, 1)
        ]
        let anchor = (payload["anchor"] as? String ?? "").lowercased()
        let targetPercent: (Double, Double)
        if let named = anchors[anchor] { targetPercent = named }
        else if anchor.isEmpty, let x = payload["xPercent"] as? NSNumber, let y = payload["yPercent"] as? NSNumber,
                x.doubleValue.isFinite, y.doubleValue.isFinite { targetPercent = (x.doubleValue, y.doubleValue) }
        else { completion("请指定有效的桌面位置或 xPercent/yPercent。"); return }
        cancelGlide(); reveal(); dockEdge = "none"; moving = false
        let requestedScreen = payload["screenId"] as? String
        let screen = NSScreen.screens.first { DesktopGeometry.screenID($0) == requestedScreen }
            ?? DesktopGeometry.screen(for: panel.frame)
        guard let screen else { completion("当前没有可用显示器。"); return }
        let area = screen.visibleFrame
        let x = CGFloat(min(1, max(0, targetPercent.0))), y = CGFloat(min(1, max(0, targetPercent.1)))
        let target = NSPoint(x: area.minX + max(0, area.width - panel.frame.width) * x,
                             y: area.maxY - panel.frame.height - max(0, area.height - panel.frame.height) * y)
        let requestedDuration = (payload["durationMs"] as? NSNumber)?.doubleValue ?? 500
        let milliseconds = requestedDuration.isFinite ? requestedDuration : 500
        glide = (panel.frame.origin, target, Date(), min(1200, max(250, milliseconds)) / 1000, completion)
        scheduleTimer(interval: 1.0 / 60.0)
    }

    private func cancelGlide() {
        let callback = glide?.completion
        glide = nil
        if panel != nil { scheduleTimer(interval: 0.08) }
        callback?("桌面宠物移动已取消。")
    }

    private func scheduleTimer(interval: TimeInterval) {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] _ in
            DispatchQueue.main.async { [weak self] in self?.tick() }
        }
        if let timer { RunLoop.main.add(timer, forMode: .common) }
    }

    private func resizeForContent() {
        guard let panel else { return }
        // Reveal using the collapsed frame before changing its width. Otherwise
        // a chat opened while dock-hidden reuses the old origin and goes offscreen.
        reveal()
        let size = panelOpen || bubbleVisible ? NSSize(width: 720, height: 660) : NSSize(width: 300, height: 340)
        guard panel.frame.size != size else { return }
        // The mascot is anchored to the lower right by the shared CSS.
        let frame = NSRect(x: panel.frame.maxX - size.width, y: panel.frame.minY, width: size.width, height: size.height)
        panel.setFrame(frame, display: true)
        clamp(panel)
        dockEdge = "none"
        if !panelOpen && !bubbleVisible { dockIfNearEdge() }
        stateChanged?()
    }

    private func hitPath(_ payload: [String: Any]) -> NSBezierPath? {
        guard let panel, let bounds = payload["bounds"] as? [String: Any], let viewport = payload["viewport"] as? [String: Any] else { return nil }
        func value(_ object: [String: Any], _ key: String) -> CGFloat { CGFloat((object[key] as? NSNumber)?.doubleValue ?? 0) }
        let vw = value(viewport, "width"), vh = value(viewport, "height")
        guard vw > 0, vh > 0 else { return nil }
        let sx = panel.frame.width / vw, sy = panel.frame.height / vh
        let width = value(bounds, "width") * sx, height = value(bounds, "height") * sy
        let x = value(bounds, "left") * sx, y = panel.frame.height - value(bounds, "top") * sy - height
        guard [x, y, width, height].allSatisfy(\.isFinite), width > 0, height > 0 else { return nil }
        let rectangle = NSRect(x: x, y: y, width: width, height: height).intersection(NSRect(origin: .zero, size: panel.frame.size))
        let radius = min(min(width / 2, height / 2), max(0, value(bounds, "radius")) * min(sx, sy))
        return NSBezierPath(roundedRect: rectangle, xRadius: radius, yRadius: radius)
    }

    private func tick() {
        guard let panel, panel.isVisible else { return }
        if let glide {
            let fraction = min(1, Date().timeIntervalSince(glide.began) / glide.duration)
            let smooth = fraction * fraction * (3 - 2 * fraction)
            panel.setFrameOrigin(NSPoint(x: glide.start.x + (glide.target.x - glide.start.x) * smooth,
                                         y: glide.start.y + (glide.target.y - glide.start.y) * smooth))
            if fraction >= 1 { self.glide = nil; scheduleTimer(interval: 0.08); savePosition(); glide.completion(nil); stateChanged?() }
        }
        let pointer = NSEvent.mouseLocation
        let local = NSPoint(x: pointer.x - panel.frame.minX, y: pointer.y - panel.frame.minY)
        let mascot = NSBezierPath(ovalIn: NSRect(x: panel.frame.width - 300, y: 0, width: 292, height: 292))
        let hit = mascot.contains(local) || panelHit?.contains(local) == true || bubbleHit?.contains(local) == true
        // A small full-window grace region keeps pending DOM resize geometry usable.
        let fallbackPanel = panelOpen && panelHit == nil && panel.frame.contains(pointer)
        panel.ignoresMouseEvents = !(hit || fallbackPanel || moving || (NSEvent.pressedMouseButtons & 1 != 0 && panel.isKeyWindow))
        if hit || fallbackPanel || panelOpen || bubbleVisible || moving || glide != nil { lastInside = Date(); if autoHidden { reveal() }; return }
        guard dockEdge != "none" else { return }
        let near = panel.frame.insetBy(dx: -52, dy: -52).contains(pointer)
        if autoHidden && near { reveal(); lastInside = Date() }
        else if !autoHidden && Date().timeIntervalSince(lastInside) > 0.9 { hideAtEdge() }
    }

    private func dockIfNearEdge() {
        guard let panel, !panelOpen, !bubbleVisible, let screen = DesktopGeometry.screen(for: panel.frame) else { return }
        let area = screen.visibleFrame, frame = panel.frame
        let distances = [("left", abs(frame.minX - area.minX)), ("right", abs(area.maxX - frame.maxX)),
                         ("bottom", abs(frame.minY - area.minY)), ("top", abs(area.maxY - frame.maxY))]
        guard let nearest = distances.min(by: { $0.1 < $1.1 }), nearest.1 <= 42 else { dockEdge = "none"; clamp(panel); return }
        dockEdge = nearest.0; dockArea = area
        var result = DesktopGeometry.clamp(frame, to: area)
        switch dockEdge {
        case "left": result.origin.x = area.minX
        case "right": result.origin.x = area.maxX - result.width
        case "top": result.origin.y = area.maxY - result.height
        default: result.origin.y = area.minY
        }
        dockOrigin = result.origin
        panel.setFrame(result, display: false)
        lastInside = Date()
    }

    private func hideAtEdge() {
        guard let panel else { return }
        var origin = dockOrigin
        switch dockEdge {
        case "left": origin.x = dockArea.minX - panel.frame.width + 24
        case "right": origin.x = dockArea.maxX - 24
        case "top": origin.y = dockArea.maxY - 24
        case "bottom": origin.y = dockArea.minY - panel.frame.height + 24
        default: return
        }
        autoHidden = true
        panel.setFrameOrigin(origin)
        stateChanged?()
    }

    private func reveal() {
        guard autoHidden else { return }
        autoHidden = false
        panel?.setFrameOrigin(dockOrigin)
        lastInside = Date()
        stateChanged?()
    }

    private func clamp(_ panel: NSWindow) {
        if let screen = DesktopGeometry.screen(for: panel.frame) { panel.setFrame(DesktopGeometry.clamp(panel.frame, to: screen.visibleFrame), display: false) }
    }

    private func savePosition() {
        guard let panel, let screen = DesktopGeometry.screen(for: panel.frame) else { return }
        let origin = autoHidden ? dockOrigin : panel.frame.origin
        // Persist the mascot anchor, not the temporary expanded chat viewport.
        preferences.set(["right": origin.x + panel.frame.width, "bottom": origin.y, "screenId": DesktopGeometry.screenID(screen)], forKey: "petPosition")
    }

    private func restorePosition(_ panel: NSWindow) {
        let stored = preferences.dictionary(forKey: "petPosition") ?? [:]
        let screen = NSScreen.screens.first { DesktopGeometry.screenID($0) == stored["screenId"] as? String } ?? NSScreen.main
        guard let screen else { return }
        let right = CGFloat((stored["right"] as? NSNumber)?.doubleValue ?? Double(screen.visibleFrame.maxX - 20))
        let bottom = CGFloat((stored["bottom"] as? NSNumber)?.doubleValue ?? Double(screen.visibleFrame.minY + 20))
        panel.setFrameOrigin(NSPoint(x: right - panel.frame.width, y: bottom))
        clamp(panel)
    }
}
