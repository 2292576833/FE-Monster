using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace FeMonster.Client;

internal sealed class FeMonsterForm : Form
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(1) };

    private const int WM_NCLBUTTONDOWN = 0x00A1;
    private const int HTCAPTION = 0x0002;
    private const int DWMWA_WINDOW_CORNER_PREFERENCE = 33;
    private const int DWMWCP_ROUND = 2;
    private readonly ClientOptions options;
    private readonly WebView2 webView = new() { Dock = DockStyle.Fill };
    private RecordingToolbarForm? recordingToolbar;
    private Rectangle restoreBounds;
    private bool fullscreen;
    private bool serverQuitRequested;

    public FeMonsterForm(ClientOptions options)
    {
        this.options = options;
        Text = "FE Monster";
        Width = options.Width;
        Height = options.Height;
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(860, 560);
        BackColor = Color.Black;
        Controls.Add(webView);
    }

    [DllImport("user32.dll")]
    private static extern bool ReleaseCapture();

    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int attributeValue, int attributeSize);

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        ApplyRoundedCorners();
    }

    protected override async void OnShown(EventArgs e)
    {
        base.OnShown(e);
        await InitializeWebViewAsync();
    }

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        ApplyRoundedCorners();
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        recordingToolbar?.Close();
        recordingToolbar = null;
        RequestServerQuitAsync().GetAwaiter().GetResult();
        base.OnFormClosing(e);
    }

    private async Task InitializeWebViewAsync()
    {
        var userDataFolder = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "FE Monster",
            "WebView2"
        );
        Directory.CreateDirectory(userDataFolder);

        var environment = await CoreWebView2Environment.CreateAsync(
            browserExecutableFolder: null,
            userDataFolder: userDataFolder,
            options: new CoreWebView2EnvironmentOptions(BuildBrowserArguments())
        );

        webView.DefaultBackgroundColor = Color.Black;
        await webView.EnsureCoreWebView2Async(environment);
        webView.CoreWebView2.WebMessageReceived += HandleWebMessage;
        webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
        webView.CoreWebView2.Settings.AreDevToolsEnabled = true;
        webView.CoreWebView2.Settings.IsWebMessageEnabled = true;
        webView.CoreWebView2.Navigate(options.Url);
    }

    private string BuildBrowserArguments()
    {
        if (!options.GpuAcceleration) return "--disable-gpu";

        var args = "--enable-gpu-rasterization --enable-accelerated-2d-canvas --force-high-performance-gpu --ignore-gpu-blocklist";
        if (options.DirectX11) args += " --use-gl=angle --use-angle=d3d11";
        return args;
    }

    private void HandleWebMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            using var document = JsonDocument.Parse(e.WebMessageAsJson);
            if (!document.RootElement.TryGetProperty("type", out var type))
            {
                return;
            }

            if (string.Equals(type.GetString(), "fe-recording-toolbar", StringComparison.OrdinalIgnoreCase))
            {
                HandleRecordingToolbarMessage(document.RootElement);
                return;
            }

            if (string.Equals(type.GetString(), "fe-render-capabilities", StringComparison.OrdinalIgnoreCase))
            {
                HandleRenderCapabilitiesMessage(document.RootElement);
                return;
            }

            if (!string.Equals(type.GetString(), "fe-window", StringComparison.OrdinalIgnoreCase)) return;

            var action = document.RootElement.TryGetProperty("action", out var actionElement)
                ? actionElement.GetString()
                : "";
            if (string.Equals(action, "move", StringComparison.OrdinalIgnoreCase))
            {
                MoveWindowBy(ReadInt(document.RootElement, "dx"), ReadInt(document.RootElement, "dy"));
                return;
            }
            ApplyWindowAction(action);
        }
        catch (JsonException)
        {
            ApplyWindowAction(e.TryGetWebMessageAsString());
        }
    }

    private void HandleRecordingToolbarMessage(JsonElement root)
    {
        string action = ReadString(root, "action");
        switch (action.Trim().ToLowerInvariant())
        {
            case "show":
                ShowRecordingToolbar();
                break;
            case "hide":
                HideRecordingToolbar();
                break;
            case "state":
                UpdateRecordingToolbar(
                    ReadString(root, "mode"),
                    ReadString(root, "status"),
                    ReadBool(root, "canSaveAs")
                );
                break;
        }
    }

    private void HandleRenderCapabilitiesMessage(JsonElement root)
    {
        if (webView.CoreWebView2 == null) return;
        string requestId = ReadString(root, "requestId");
        var response = new
        {
            type = "fe-render-capabilities-result",
            requestId,
            host = new
            {
                backend = options.DirectX11 ? "webview2-angle-d3d11" : "webview2-default",
                gpuAcceleration = options.GpuAcceleration,
                ownsNativeRenderTargets = false
            },
            upscalers = new
            {
                adaptiveSpatial = new
                {
                    available = options.GpuAcceleration,
                    backend = "webgl2-fragment-pass"
                },
                fsrNative = new
                {
                    available = false,
                    reason = "native-renderer-required"
                },
                dlss = new
                {
                    available = false,
                    reason = "native-renderer-required"
                }
            },
            rayTracing = new
            {
                realtime = false,
                authoring = "blender-cycles"
            }
        };
        webView.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(response));
    }

    private void ShowRecordingToolbar()
    {
        if (recordingToolbar == null || recordingToolbar.IsDisposed)
        {
            recordingToolbar = new RecordingToolbarForm(InvokeRecordingScript);
            recordingToolbar.FormClosed += (_, _) => recordingToolbar = null;
        }

        recordingToolbar.StartPosition = FormStartPosition.Manual;
        recordingToolbar.Location = InitialRecordingToolbarLocation(recordingToolbar.Size);
        recordingToolbar.UpdateState("idle", "", false);
        if (!recordingToolbar.Visible) recordingToolbar.Show();
        recordingToolbar.Activate();
        _ = webView.CoreWebView2.ExecuteScriptAsync("window.feMonsterRecordingNativeReady && window.feMonsterRecordingNativeReady();");
    }

    private void HideRecordingToolbar()
    {
        if (recordingToolbar == null || recordingToolbar.IsDisposed) return;
        recordingToolbar.Hide();
    }

    private void UpdateRecordingToolbar(string mode, string status, bool canSaveAs)
    {
        if (recordingToolbar == null || recordingToolbar.IsDisposed) return;
        recordingToolbar.UpdateState(mode, status, canSaveAs);
    }

    private Point InitialRecordingToolbarLocation(Size toolbarSize)
    {
        Rectangle screen = Screen.FromControl(this).WorkingArea;
        int left = Math.Max(screen.Left + 8, Math.Min(Location.X + 18, screen.Right - toolbarSize.Width - 8));
        int top = Math.Max(screen.Top + 8, Math.Min(Location.Y + 18, screen.Bottom - toolbarSize.Height - 8));
        return new Point(left, top);
    }

    private void InvokeRecordingScript(string action)
    {
        string method = action.Trim().ToLowerInvariant() switch
        {
            "start" => "start",
            "stop" => "stop",
            "resume" => "resume",
            "finish" => "finish",
            "close" => "close",
            "saveas" => "saveAs",
            _ => ""
        };
        if (method.Length == 0 || webView.CoreWebView2 == null) return;
        _ = webView.CoreWebView2.ExecuteScriptAsync($"window.feMonsterRecording && window.feMonsterRecording.{method} && window.feMonsterRecording.{method}();");
    }

    private void ApplyWindowAction(string? action)
    {
        switch ((action ?? "").Trim().ToLowerInvariant())
        {
            case "fullscreen":
                SetFullscreen(true);
                break;
            case "normal":
            case "restore":
                SetFullscreen(false);
                break;
            case "minimize":
            case "minimise":
                WindowState = FormWindowState.Minimized;
                break;
            case "drag":
                BeginWindowDrag();
                break;
            case "quit":
            case "exit":
                Close();
                break;
            case "close":
                Close();
                break;
        }
    }

    private async Task RequestServerQuitAsync()
    {
        if (serverQuitRequested) return;
        serverQuitRequested = true;
        try
        {
            await Http.GetAsync(new Uri(new Uri(options.Url), "/api/app/window/quit")).ConfigureAwait(false);
        }
        catch
        {
        }
    }

    private void SetFullscreen(bool enabled)
    {
        if (enabled == fullscreen) return;
        if (enabled)
        {
            restoreBounds = Bounds;
            Region = null;
            WindowState = FormWindowState.Normal;
            Bounds = Screen.FromControl(this).Bounds;
            TopMost = true;
            fullscreen = true;
            return;
        }

        TopMost = false;
        WindowState = FormWindowState.Normal;
        if (!restoreBounds.IsEmpty) Bounds = restoreBounds;
        fullscreen = false;
        ApplyRoundedCorners();
    }

    private void BeginWindowDrag()
    {
        if (fullscreen || WindowState == FormWindowState.Minimized) return;
        ReleaseCapture();
        SendMessage(Handle, WM_NCLBUTTONDOWN, new IntPtr(HTCAPTION), IntPtr.Zero);
    }

    private void MoveWindowBy(int dx, int dy)
    {
        if (fullscreen || WindowState == FormWindowState.Minimized || (dx == 0 && dy == 0)) return;
        Location = new Point(Location.X + dx, Location.Y + dy);
    }

    private static int ReadInt(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var value)) return 0;
        return value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var number)
            ? (int)Math.Round(number)
            : 0;
    }

    private static string ReadString(JsonElement element, string propertyName)
    {
        return element.TryGetProperty(propertyName, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString() ?? ""
            : "";
    }

    private static bool ReadBool(JsonElement element, string propertyName)
    {
        return element.TryGetProperty(propertyName, out var value) && value.ValueKind == JsonValueKind.True;
    }

    private void ApplyRoundedCorners()
    {
        if (!IsHandleCreated || fullscreen || WindowState == FormWindowState.Minimized) return;
        Region = null;

        try
        {
            var preference = DWMWCP_ROUND;
            DwmSetWindowAttribute(Handle, DWMWA_WINDOW_CORNER_PREFERENCE, ref preference, sizeof(int));
        }
        catch (DllNotFoundException)
        {
        }
        catch (EntryPointNotFoundException)
        {
        }
    }
}

internal sealed class RecordingToolbarForm : Form
{
    private static readonly Color ToolbarBack = Color.FromArgb(13, 20, 25);
    private readonly Action<string> invokeAction;
    private readonly ToolbarIconButton startButton;
    private readonly ToolbarIconButton stopButton;
    private readonly ToolbarIconButton resumeButton;
    private readonly ToolbarIconButton finishButton;
    private readonly ToolbarIconButton closeButton;
    private readonly LinkLabel saveAsLink;
    private readonly Label statusLabel;
    private bool dragging;
    private Point dragStartCursor;
    private Point dragStartLocation;

    public RecordingToolbarForm(Action<string> invokeAction)
    {
        this.invokeAction = invokeAction;
        Text = "FE Monster Recording";
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        BackColor = ToolbarBack;
        ForeColor = Color.FromArgb(246, 252, 255);
        ClientSize = new Size(286, 72);
        MinimumSize = Size;
        MaximumSize = Size;
        DoubleBuffered = true;
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);

        startButton = CreateButton("start", "开始录制", Color.FromArgb(255, 93, 108), "start");
        stopButton = CreateButton("stop", "停止录制", Color.FromArgb(232, 249, 255), "stop");
        resumeButton = CreateButton("resume", "继续录制", Color.FromArgb(232, 249, 255), "resume");
        finishButton = CreateButton("finish", "完成录制", Color.FromArgb(184, 255, 226), "finish");
        closeButton = CreateButton("close", "关闭录制窗口", Color.FromArgb(232, 249, 255), "close");
        closeButton.Size = new Size(30, 30);

        var actionRow = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 42,
            Padding = new Padding(8, 7, 8, 0),
            Margin = Padding.Empty,
            BackColor = ToolbarBack,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = false
        };
        actionRow.Controls.AddRange(new Control[] { startButton, stopButton, resumeButton, finishButton, closeButton });

        statusLabel = new Label
        {
            AutoEllipsis = true,
            Dock = DockStyle.Fill,
            Padding = new Padding(10, 0, 4, 0),
            Text = "只录制程序画面",
            ForeColor = Color.FromArgb(184, 226, 236),
            Font = new Font("Segoe UI", 8.5f, FontStyle.Bold),
            TextAlign = ContentAlignment.MiddleLeft
        };
        AttachDragHandlers(statusLabel);

        saveAsLink = new LinkLabel
        {
            Dock = DockStyle.Right,
            Width = 44,
            Text = "另存",
            Visible = false,
            LinkColor = Color.FromArgb(131, 228, 255),
            ActiveLinkColor = Color.FromArgb(184, 255, 226),
            DisabledLinkColor = Color.FromArgb(102, 126, 134),
            Font = new Font("Segoe UI", 8.5f, FontStyle.Bold),
            TextAlign = ContentAlignment.MiddleCenter
        };
        saveAsLink.LinkClicked += (_, _) => invokeAction("saveas");

        var statusRow = new Panel
        {
            Dock = DockStyle.Fill,
            Padding = Padding.Empty,
            BackColor = ToolbarBack
        };
        AttachDragHandlers(statusRow);
        statusRow.Controls.Add(statusLabel);
        statusRow.Controls.Add(saveAsLink);

        Controls.Add(statusRow);
        Controls.Add(actionRow);
        AttachDragHandlers(this);
        AttachDragHandlers(actionRow);
        UpdateState("idle", "", false);
    }

    public void UpdateState(string mode, string status, bool canSaveAs)
    {
        bool recording = string.Equals(mode, "recording", StringComparison.OrdinalIgnoreCase);
        bool paused = string.Equals(mode, "paused", StringComparison.OrdinalIgnoreCase);
        bool busy = string.Equals(mode, "saving", StringComparison.OrdinalIgnoreCase)
            || string.Equals(mode, "finalizing", StringComparison.OrdinalIgnoreCase);
        bool active = recording || paused || busy;

        startButton.Enabled = !active;
        stopButton.Enabled = recording && !busy;
        resumeButton.Enabled = paused && !busy;
        finishButton.Enabled = (recording || paused) && !busy;
        closeButton.Enabled = !busy;
        saveAsLink.Visible = canSaveAs && !active;
        statusLabel.Text = string.IsNullOrWhiteSpace(status) ? "只录制程序画面" : status;
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        using var path = RoundedRectPath(ClientRectangle, 18);
        using var fill = new SolidBrush(ToolbarBack);
        using var border = new Pen(Color.FromArgb(54, 248, 253, 255), 1f);
        using var glow = new SolidBrush(Color.FromArgb(32, 131, 228, 255));
        e.Graphics.FillPath(fill, path);
        e.Graphics.FillEllipse(glow, 24, -28, 96, 64);
        e.Graphics.DrawPath(border, path);
    }

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        using var path = RoundedRectPath(new Rectangle(Point.Empty, Size), 18);
        Region = new Region(path);
    }

    private ToolbarIconButton CreateButton(string kind, string label, Color accent, string action)
    {
        var button = new ToolbarIconButton(kind, accent, ToolbarBack)
        {
            AccessibleName = label,
            ToolTipText = label,
            Margin = new Padding(0, 0, 8, 0)
        };
        button.Click += (_, _) => invokeAction(action);
        return button;
    }

    private void AttachDragHandlers(Control control)
    {
        control.MouseDown += BeginDrag;
        control.MouseMove += MoveDrag;
        control.MouseUp += EndDrag;
    }

    private void BeginDrag(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left) return;
        dragging = true;
        dragStartCursor = Cursor.Position;
        dragStartLocation = Location;
    }

    private void MoveDrag(object? sender, MouseEventArgs e)
    {
        if (!dragging) return;
        Point cursor = Cursor.Position;
        Location = new Point(
            dragStartLocation.X + cursor.X - dragStartCursor.X,
            dragStartLocation.Y + cursor.Y - dragStartCursor.Y
        );
    }

    private void EndDrag(object? sender, MouseEventArgs e)
    {
        dragging = false;
    }

    private static GraphicsPath RoundedRectPath(Rectangle rect, int radius)
    {
        int diameter = radius * 2;
        var path = new GraphicsPath();
        path.AddArc(rect.Left, rect.Top, diameter, diameter, 180, 90);
        path.AddArc(rect.Right - diameter - 1, rect.Top, diameter, diameter, 270, 90);
        path.AddArc(rect.Right - diameter - 1, rect.Bottom - diameter - 1, diameter, diameter, 0, 90);
        path.AddArc(rect.Left, rect.Bottom - diameter - 1, diameter, diameter, 90, 90);
        path.CloseFigure();
        return path;
    }
}

internal sealed class ToolbarIconButton : Button
{
    private readonly string kind;
    private readonly Color accent;
    private readonly Color backColor;

    public ToolbarIconButton(string kind, Color accent, Color backColor)
    {
        this.kind = kind;
        this.accent = accent;
        this.backColor = backColor;
        Size = new Size(36, 36);
        FlatStyle = FlatStyle.Flat;
        FlatAppearance.BorderSize = 0;
        BackColor = backColor;
        ForeColor = accent;
        TabStop = true;
        UseVisualStyleBackColor = false;
        Cursor = Cursors.Hand;
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw | ControlStyles.UserPaint, true);
    }

    public string ToolTipText { get; set; } = "";

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        using var path = new GraphicsPath();
        path.AddEllipse(new Rectangle(Point.Empty, Size));
        Region = new Region(path);
    }

    protected override void OnPaint(PaintEventArgs pevent)
    {
        pevent.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        using var back = new SolidBrush(backColor);
        pevent.Graphics.FillRectangle(back, ClientRectangle);

        Color iconColor = Enabled ? accent : Color.FromArgb(96, 132, 142);
        Color fill = Enabled ? Color.FromArgb(34, 255, 255, 255) : Color.FromArgb(16, 255, 255, 255);
        Color border = Enabled ? Color.FromArgb(58, accent) : Color.FromArgb(28, 255, 255, 255);
        using var fillBrush = new SolidBrush(fill);
        using var borderPen = new Pen(border, 1f);
        pevent.Graphics.FillEllipse(fillBrush, 1, 1, Width - 3, Height - 3);
        pevent.Graphics.DrawEllipse(borderPen, 1, 1, Width - 3, Height - 3);
        DrawIcon(pevent.Graphics, iconColor);
    }

    protected override void OnEnabledChanged(EventArgs e)
    {
        base.OnEnabledChanged(e);
        Invalidate();
    }

    private void DrawIcon(Graphics graphics, Color color)
    {
        using var brush = new SolidBrush(color);
        using var pen = new Pen(color, 2.4f)
        {
            StartCap = LineCap.Round,
            EndCap = LineCap.Round
        };
        float cx = Width / 2f;
        float cy = Height / 2f;

        switch (kind)
        {
            case "start":
                graphics.FillEllipse(brush, cx - 5.5f, cy - 5.5f, 11f, 11f);
                break;
            case "stop":
                graphics.FillRectangle(brush, cx - 5f, cy - 5f, 10f, 10f);
                break;
            case "resume":
                graphics.FillPolygon(brush, new[]
                {
                    new PointF(cx - 3.5f, cy - 7f),
                    new PointF(cx - 3.5f, cy + 7f),
                    new PointF(cx + 7f, cy)
                });
                break;
            case "finish":
                graphics.DrawLines(pen, new[]
                {
                    new PointF(cx - 7f, cy + 0.5f),
                    new PointF(cx - 2f, cy + 5.5f),
                    new PointF(cx + 7f, cy - 6f)
                });
                break;
            case "close":
                graphics.DrawLine(pen, cx - 5f, cy - 5f, cx + 5f, cy + 5f);
                graphics.DrawLine(pen, cx + 5f, cy - 5f, cx - 5f, cy + 5f);
                break;
        }
    }
}
