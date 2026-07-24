import AppKit

/// Direct AppKit translation of native/windows/winforms/RecordingToolbarForm.
final class RecordingToolbarController: NSObject {
    private let invokeAction: (String) -> Void
    private let panel: NSPanel
    private let startButton = NSButton()
    private let stopButton = NSButton()
    private let resumeButton = NSButton()
    private let finishButton = NSButton()
    private let closeButton = NSButton()
    private let saveAsButton = NSButton()
    private let statusLabel = NSTextField(labelWithString: "只录制程序画面")

    init(invokeAction: @escaping (String) -> Void) {
        self.invokeAction = invokeAction
        panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 306, height: 78),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        super.init()
        configurePanel()
    }

    /// Direct counterpart of FeMonsterForm.ShowRecordingToolbar.
    func show(relativeTo parent: NSWindow) {
        updateState(mode: "idle", status: "", canSaveAs: false)
        let visibleFrame = parent.screen?.visibleFrame ?? NSScreen.main?.visibleFrame ?? parent.frame
        let size = panel.frame.size
        let proposedX = parent.frame.minX + 18
        let proposedY = parent.frame.maxY - size.height - 18
        let x = min(max(proposedX, visibleFrame.minX + 8), visibleFrame.maxX - size.width - 8)
        let y = min(max(proposedY, visibleFrame.minY + 8), visibleFrame.maxY - size.height - 8)
        panel.setFrameOrigin(NSPoint(x: x, y: y))
        panel.orderFrontRegardless()
    }

    func hide() {
        panel.orderOut(nil)
    }

    func close() {
        panel.orderOut(nil)
    }

    /// Direct counterpart of RecordingToolbarForm.UpdateState.
    func updateState(mode: String, status: String, canSaveAs: Bool) {
        let normalized = mode.lowercased()
        let recording = normalized == "recording"
        let paused = normalized == "paused"
        let busy = normalized == "saving" || normalized == "finalizing"
        let active = recording || paused || busy

        startButton.isEnabled = !active
        stopButton.isEnabled = recording && !busy
        resumeButton.isEnabled = paused && !busy
        finishButton.isEnabled = (recording || paused) && !busy
        closeButton.isEnabled = !busy
        saveAsButton.isHidden = !canSaveAs || active
        statusLabel.stringValue =
            status.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                ? "只录制程序画面"
                : status
    }

    private func configurePanel() {
        panel.title = "FE Monster Recording"
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.isMovableByWindowBackground = true
        panel.hidesOnDeactivate = false
        panel.becomesKeyOnlyIfNeeded = true

        let surface = NSVisualEffectView(frame: panel.contentView?.bounds ?? .zero)
        surface.material = .hudWindow
        surface.blendingMode = .behindWindow
        surface.state = .active
        surface.wantsLayer = true
        surface.layer?.cornerRadius = 18
        surface.layer?.masksToBounds = true
        surface.layer?.borderWidth = 1
        surface.layer?.borderColor = NSColor.white.withAlphaComponent(0.16).cgColor

        configureButton(startButton, title: "●", toolTip: "开始录制", action: #selector(start(_:)))
        configureButton(stopButton, title: "■", toolTip: "停止录制", action: #selector(stop(_:)))
        configureButton(resumeButton, title: "▶", toolTip: "继续录制", action: #selector(resume(_:)))
        configureButton(finishButton, title: "✓", toolTip: "完成录制", action: #selector(finish(_:)))
        configureButton(closeButton, title: "×", toolTip: "关闭录制窗口", action: #selector(closeAction(_:)))

        let actionRow = NSStackView(views: [
            startButton,
            stopButton,
            resumeButton,
            finishButton,
            closeButton
        ])
        actionRow.orientation = .horizontal
        actionRow.alignment = .centerY
        actionRow.spacing = 8
        actionRow.distribution = .fillEqually

        statusLabel.textColor = NSColor(calibratedRed: 0.72, green: 0.89, blue: 0.94, alpha: 1)
        statusLabel.font = .systemFont(ofSize: 11.5, weight: .semibold)
        statusLabel.lineBreakMode = .byTruncatingTail

        saveAsButton.title = "另存"
        saveAsButton.isBordered = false
        saveAsButton.font = .systemFont(ofSize: 11.5, weight: .semibold)
        saveAsButton.contentTintColor = NSColor(calibratedRed: 0.51, green: 0.89, blue: 1, alpha: 1)
        saveAsButton.target = self
        saveAsButton.action = #selector(saveAs(_:))

        let statusRow = NSStackView(views: [statusLabel, saveAsButton])
        statusRow.orientation = .horizontal
        statusRow.alignment = .centerY
        statusRow.spacing = 6
        statusLabel.setContentHuggingPriority(.defaultLow, for: .horizontal)
        saveAsButton.setContentHuggingPriority(.required, for: .horizontal)

        let rows = NSStackView(views: [actionRow, statusRow])
        rows.translatesAutoresizingMaskIntoConstraints = false
        rows.orientation = .vertical
        rows.alignment = .leading
        rows.spacing = 3
        rows.distribution = .fill
        surface.addSubview(rows)

        NSLayoutConstraint.activate([
            rows.leadingAnchor.constraint(equalTo: surface.leadingAnchor, constant: 10),
            rows.trailingAnchor.constraint(equalTo: surface.trailingAnchor, constant: -10),
            rows.topAnchor.constraint(equalTo: surface.topAnchor, constant: 7),
            rows.bottomAnchor.constraint(equalTo: surface.bottomAnchor, constant: -6),
            actionRow.widthAnchor.constraint(equalTo: rows.widthAnchor),
            statusRow.widthAnchor.constraint(equalTo: rows.widthAnchor),
            actionRow.heightAnchor.constraint(equalToConstant: 40)
        ])

        panel.contentView = surface
        updateState(mode: "idle", status: "", canSaveAs: false)
    }

    private func configureButton(
        _ button: NSButton,
        title: String,
        toolTip: String,
        action: Selector
    ) {
        button.title = title
        button.toolTip = toolTip
        button.target = self
        button.action = action
        button.isBordered = false
        button.font = .systemFont(ofSize: 17, weight: .bold)
        button.contentTintColor = .white
        button.setButtonType(.momentaryPushIn)
        button.widthAnchor.constraint(equalToConstant: 42).isActive = true
        button.heightAnchor.constraint(equalToConstant: 36).isActive = true
    }

    @objc private func start(_ sender: Any?) {
        invokeAction("start")
    }

    @objc private func stop(_ sender: Any?) {
        invokeAction("stop")
    }

    @objc private func resume(_ sender: Any?) {
        invokeAction("resume")
    }

    @objc private func finish(_ sender: Any?) {
        invokeAction("finish")
    }

    @objc private func closeAction(_ sender: Any?) {
        invokeAction("close")
    }

    @objc private func saveAs(_ sender: Any?) {
        invokeAction("saveas")
    }
}
