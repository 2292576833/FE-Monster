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
    private static readonly Color WindowSurfaceColor = Color.FromArgb(255, 2, 2, 2);

    private const int WM_NCLBUTTONDOWN = 0x00A1;
    private const int HTCAPTION = 0x0002;
    private const int WindowWorkAreaMargin = 24;
    private readonly ClientOptions options;
    private readonly bool ownsBackendProcess;
    private WebView2 webView;
    private readonly DesktopSceneHost desktopSceneHost;
    private readonly DesktopPetHost desktopPetHost;
    private readonly NotifyIcon trayIcon;
    private readonly ContextMenuStrip trayMenu;
    private readonly ToolStripMenuItem desktopPetShowMenuItem;
    private readonly ToolStripMenuItem desktopPetHideMenuItem;
    private readonly ToolStripMenuItem desktopPetDisableMenuItem;
    private readonly Icon trayDisplayIcon;
    private CoreWebView2Environment? webEnvironment;
    private RecordingToolbarForm? recordingToolbar;
    private Rectangle restoreBounds;
    private bool fullscreen;
    private bool serverQuitRequested;
    private bool trayResourcesDisposed;
    private bool nativeCornerPreferenceApplied;
    private int appliedCornerPreference = -1;
    private int cachedResizeFrameDpi;
    private Size cachedResizeFrameSize;
    private TaskCompletionSource<CoreWebView2NavigationCompletedEventArgs>? pendingStartupNavigation;
    private string webViewUserDataFolder = "";
    private bool startupPageReady;
    private bool runtimeRecoveryStarted;
    private readonly System.Windows.Forms.Timer backgroundMemoryTimer;
    private DateTime lastBackgroundMemoryTrimAt = DateTime.MinValue;

    public FeMonsterForm(ClientOptions options, bool ownsBackendProcess = false)
    {
        this.options = options;
        this.ownsBackendProcess = ownsBackendProcess;
        webView = CreateMainWebView();
        desktopSceneHost = new DesktopSceneHost(options);
        Text = "FE Monster";
        Icon = System.Drawing.Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        Width = options.Width;
        Height = options.Height;
        FormBorderStyle = FormBorderStyle.None;
        Padding = Padding.Empty;
        StartPosition = FormStartPosition.Manual;
        MinimumSize = new Size(860, 560);
        Rectangle initialWorkingArea = Screen.FromPoint(Cursor.Position).WorkingArea;
        Bounds = FitWindowBoundsToWorkingArea(Bounds, initialWorkingArea, center: true);
        BackColor = WindowSurfaceColor;
        Controls.Add(webView);
        desktopPetHost = new DesktopPetHost(() => webView, ShowMainWindow, options.Url);
        desktopPetHost.WebMessageReceived += HandleWebMessage;
        desktopPetHost.StateChanged += HandleDesktopPetStateChanged;
        backgroundMemoryTimer = new System.Windows.Forms.Timer { Interval = 120000 };
        backgroundMemoryTimer.Tick += (_, _) => TrimBackgroundMemoryIfNeeded();

        trayMenu = new ContextMenuStrip();
        trayMenu.Items.Add("显示窗口", null, (_, _) => ShowMainWindow());
        trayMenu.Items.Add("隐藏窗口", null, (_, _) => HideMainWindow());
        trayMenu.Items.Add(new ToolStripSeparator());
        desktopPetShowMenuItem = new ToolStripMenuItem("显示桌宠", null, (_, _) => ShowDesktopPet());
        desktopPetHideMenuItem = new ToolStripMenuItem("隐藏桌宠", null, (_, _) => HideDesktopPet());
        desktopPetDisableMenuItem = new ToolStripMenuItem("桌宠返回主窗口", null, (_, _) => ShowMainWindow());
        trayMenu.Items.Add(desktopPetShowMenuItem);
        trayMenu.Items.Add(desktopPetHideMenuItem);
        trayMenu.Items.Add(desktopPetDisableMenuItem);
        trayMenu.Items.Add(new ToolStripSeparator());
        trayMenu.Items.Add("退出 FE Monster", null, (_, _) => Close());
        trayDisplayIcon = CreateHighContrastTrayIcon();
        trayIcon = new NotifyIcon
        {
            Text = "FE Monster",
            Icon = trayDisplayIcon,
            ContextMenuStrip = trayMenu,
            Visible = true
        };
        trayIcon.MouseClick += (_, eventArgs) =>
        {
            if (eventArgs.Button == MouseButtons.Left) ShowMainWindow();
        };
        trayIcon.DoubleClick += (_, _) => ShowMainWindow();
        SyncDesktopPetTrayMenu();
    }

    protected override CreateParams CreateParams
    {
        get
        {
            CreateParams parameters = base.CreateParams;
            parameters.Style |= NativeWindowChrome.CustomFrameStyle;
            parameters.ClassStyle |= NativeWindowChrome.DropShadowClassStyle;
            return parameters;
        }
    }

    [DllImport("user32.dll")]
    private static extern bool ReleaseCapture();

    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool DestroyIcon(IntPtr handle);

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        nativeCornerPreferenceApplied = false;
        appliedCornerPreference = -1;
        cachedResizeFrameDpi = 0;
        ApplyWindowSurfacePolicy();
        NativeWindowChrome.RefreshFrame(Handle);
        ApplyWindowCornerPolicy();
    }

    protected override void WndProc(ref Message message)
    {
        if (message.Msg == NativeWindowChrome.WmNcCalcSize)
        {
            // The WebView owns the complete HWND surface. Keeping even a 1px
            // non-client strip lets Windows paint a theme-dependent white edge,
            // and becomes 2px after DPI rounding on some displays.
            message.Result = IntPtr.Zero;
            return;
        }

        if (message.Msg == NativeWindowChrome.WmNcHitTest)
        {
            message.Result = new IntPtr(HitTestWindowFrame(message.LParam));
            return;
        }

        base.WndProc(ref message);
    }

    protected override async void OnShown(EventArgs e)
    {
        base.OnShown(e);
        try
        {
            await InitializeWebViewAsync();
        }
        catch (Exception error)
        {
            StartupDiagnostics.Write(error);
            MessageBox.Show(
                this,
                "FE Monster 无法创建应用窗口。\n\n" +
                error.Message +
                "\n\n程序已经尝试了网络重试、浏览器控件重建和软件渲染。" +
                "如果仍然失败，请修复 Microsoft Edge WebView2 Runtime 后重试。\n\n" +
                "诊断日志：\n" +
                StartupDiagnostics.LogPath,
                "FE Monster",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
            BeginInvoke(Close);
        }
    }

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        ApplyWindowSurfacePolicy();
        ApplyWindowCornerPolicy();
        UpdateBackgroundMemoryTimer();
    }

    protected override void OnDpiChanged(DpiChangedEventArgs e)
    {
        base.OnDpiChanged(e);
        cachedResizeFrameDpi = 0;
        ApplyWindowSurfacePolicy();
        ApplyWindowCornerPolicy();
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        base.OnFormClosing(e);
        if (e.Cancel) return;
        RunShutdownStep("desktop pet", desktopPetHost.Dispose);
        RunShutdownStep("desktop scene", desktopSceneHost.Dispose);
        backgroundMemoryTimer.Stop();
        backgroundMemoryTimer.Dispose();
        RunShutdownStep("tray icon", DisposeTrayResources);
        RunShutdownStep("recording toolbar", () =>
        {
            recordingToolbar?.Close();
            recordingToolbar = null;
        });
        if (!ownsBackendProcess)
        {
            RunShutdownStep(
                "external backend",
                () => RequestServerQuitAsync().GetAwaiter().GetResult()
            );
        }
    }

    private static void RunShutdownStep(string name, Action action)
    {
        try
        {
            action();
        }
        catch (Exception error)
        {
            StartupDiagnostics.Write(new InvalidOperationException(
                $"FE Monster could not close its {name} cleanly.",
                error
            ));
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) DisposeTrayResources();
        base.Dispose(disposing);
    }

    private void DisposeTrayResources()
    {
        if (trayResourcesDisposed) return;
        trayResourcesDisposed = true;
        trayIcon.Visible = false;
        trayIcon.Dispose();
        trayMenu.Dispose();
        trayDisplayIcon.Dispose();
    }

    private static Icon CreateHighContrastTrayIcon()
    {
        using Bitmap bitmap = new(32, 32, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        using Graphics graphics = Graphics.FromImage(bitmap);
        graphics.Clear(Color.Transparent);
        graphics.SmoothingMode = SmoothingMode.AntiAlias;
        using SolidBrush disc = new(Color.FromArgb(255, 20, 229, 255));
        using Pen border = new(Color.White, 2.25f);
        using Pen glyph = new(Color.FromArgb(255, 2, 18, 24), 3.5f)
        {
            StartCap = LineCap.Round,
            EndCap = LineCap.Round
        };
        graphics.FillEllipse(disc, 2, 2, 28, 28);
        graphics.DrawEllipse(border, 3, 3, 26, 26);
        graphics.DrawLine(glyph, 11, 9, 11, 23);
        graphics.DrawLine(glyph, 11, 10, 22, 10);
        graphics.DrawLine(glyph, 11, 16, 19, 16);

        IntPtr handle = bitmap.GetHicon();
        try
        {
            return (Icon)Icon.FromHandle(handle).Clone();
        }
        finally
        {
            DestroyIcon(handle);
        }
    }

    internal void ShowMainWindow()
    {
        if (desktopPetHost.IsEnabled) desktopPetHost.Disable();
        ShowInTaskbar = true;
        if (!Visible) Show();
        if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal;
        UpdateBackgroundMemoryTimer();
        Activate();
        BringToFront();
    }

    private void HideMainWindow()
    {
        Hide();
        ShowInTaskbar = false;
        UpdateBackgroundMemoryTimer();
    }

    private void UpdateBackgroundMemoryTimer()
    {
        if (backgroundMemoryTimer == null) return;
        bool shouldRun = !Visible || WindowState == FormWindowState.Minimized;
        if (shouldRun)
        {
            backgroundMemoryTimer.Start();
        }
        else
        {
            backgroundMemoryTimer.Stop();
        }
    }

    private void TrimBackgroundMemoryIfNeeded()
    {
        if (Visible && WindowState != FormWindowState.Minimized)
        {
            backgroundMemoryTimer.Stop();
            return;
        }

        DateTime now = DateTime.UtcNow;
        if (now - lastBackgroundMemoryTrimAt < TimeSpan.FromMinutes(1))
        {
            return;
        }

        lastBackgroundMemoryTrimAt = now;
        MemoryOptimizer.TrimCurrentProcess();
    }

    private void ShowDesktopPet()
    {
        try
        {
            desktopPetHost.Show();
            HideMainWindow();
            PostDesktopPetResult("", "");
        }
        catch (Exception error)
        {
            PostDesktopPetResult("", error.Message);
            MessageBox.Show(
                this,
                "Desktop pet mode could not be opened.\n\n" + error.Message,
                "FE Monster",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning
            );
        }
    }

    private void HideDesktopPet()
    {
        desktopPetHost.Hide();
        PostDesktopPetResult("", "");
    }

    private void HandleDesktopPetStateChanged()
    {
        SyncDesktopPetTrayMenu();
        PostDesktopPetResult("", "");
    }

    private void SyncDesktopPetTrayMenu()
    {
        desktopPetShowMenuItem.Enabled = !desktopPetHost.IsVisible;
        desktopPetHideMenuItem.Enabled = desktopPetHost.IsVisible;
        desktopPetDisableMenuItem.Enabled = desktopPetHost.IsEnabled;
    }

    private static string ResolveWebView2DataRoot()
    {
        string configuredDataRoot = Environment.GetEnvironmentVariable("FE_MONSTER_DATA_DIR")?.Trim() ?? "";
        if (configuredDataRoot.Length != 0)
        {
            string dataRoot = Path.GetFullPath(Environment.ExpandEnvironmentVariables(configuredDataRoot));
            string appDataRoot = Directory.GetParent(dataRoot)?.FullName ?? dataRoot;
            return Path.Combine(appDataRoot, "WebView2");
        }

        return Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "FE Monster",
            "WebView2"
        );
    }

    private static WebView2 CreateMainWebView()
    {
        return new WebView2
        {
            Dock = DockStyle.Fill,
            Margin = Padding.Empty,
            DefaultBackgroundColor = WindowSurfaceColor,
            AllowExternalDrop = true
        };
    }

    private async Task InitializeWebViewAsync()
    {
        string testStorageKey = Program.DesktopPetTestStorageKey();
        string profileFolder = testStorageKey.Length == 0
            ? "DesktopHostV2"
            : "DesktopHostV2-Test-" + testStorageKey;
        string profileRoot = testStorageKey.Length == 0
            ? ResolveWebView2DataRoot()
            : Path.Combine(Path.GetTempPath(), "FE Monster", "WebView2");
        webViewUserDataFolder = Path.Combine(profileRoot, profileFolder);

        try
        {
            await CreateWebViewControllerAsync(options.GpuAcceleration, "startup");
            await NavigateToAppShellWithRecoveryAsync(webView.CoreWebView2, "startup");
        }
        catch (Exception firstFailure)
        {
            StartupDiagnostics.Write(new InvalidOperationException(
                "WebView2 hardware startup did not become ready; rebuilding the browser controller with software rendering.",
                firstFailure
            ));
            await RecreateWebViewControllerAsync(gpuRequested: false, "startup software recovery");
            await NavigateToAppShellWithRecoveryAsync(webView.CoreWebView2, "startup software recovery");
        }
        startupPageReady = true;
    }

    private async Task CreateWebViewControllerAsync(
        bool gpuRequested,
        string phase,
        string? userDataFolder = null)
    {
        string activeUserDataFolder = userDataFolder ?? webViewUserDataFolder;
        Directory.CreateDirectory(activeUserDataFolder);
        CoreWebView2Environment environment = await CoreWebView2Environment.CreateAsync(
            browserExecutableFolder: null,
            userDataFolder: activeUserDataFolder,
            options: new CoreWebView2EnvironmentOptions(
                WebViewStartupPolicy.BrowserArguments(gpuRequested)
            )
        );
        webEnvironment = environment;
        await webView.EnsureCoreWebView2Async(environment);
        CoreWebView2 core = webView.CoreWebView2;
        core.WebMessageReceived += HandleWebMessage;
        core.ProcessFailed += HandleWebViewProcessFailed;
        core.Settings.AreDefaultContextMenusEnabled = false;
        core.Settings.AreDevToolsEnabled = true;
        core.Settings.IsWebMessageEnabled = true;
        StartupDiagnostics.WriteMessage(
            $"WebView2 controller ready: phase={phase}; renderMode={(gpuRequested ? "automatic" : "software")}; " +
            $"browserVersion={environment.BrowserVersionString}; userDataFolder={activeUserDataFolder}; URL={options.Url}"
        );
    }

    private async Task RecreateWebViewControllerAsync(bool gpuRequested, string phase)
    {
        if (IsDisposed) throw new ObjectDisposedException(nameof(FeMonsterForm));
        if (desktopSceneHost.IsEnabled) desktopSceneHost.Disable();
        if (desktopPetHost.IsEnabled) desktopPetHost.Disable();

        WebView2 previous = webView;
        try
        {
            if (previous.CoreWebView2 is not null)
            {
                previous.CoreWebView2.WebMessageReceived -= HandleWebMessage;
                previous.CoreWebView2.ProcessFailed -= HandleWebViewProcessFailed;
            }
        }
        catch (InvalidOperationException)
        {
            // BrowserProcessExited closes the controller before the host can detach events.
        }
        Controls.Remove(previous);
        previous.Dispose();
        await Task.Delay(200);

        Exception? lastFailure = null;
        foreach (string candidateUserDataFolder in new[]
        {
            webViewUserDataFolder,
            webViewUserDataFolder + "-SoftwareRecovery"
        }.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            for (int attempt = 1; attempt <= 3; attempt += 1)
            {
                WebView2 candidate = CreateMainWebView();
                webView = candidate;
                Controls.Add(candidate);
                candidate.BringToFront();
                try
                {
                    await CreateWebViewControllerAsync(
                        gpuRequested,
                        phase,
                        candidateUserDataFolder
                    );
                    return;
                }
                catch (Exception error) when (error is not OutOfMemoryException)
                {
                    webEnvironment = null;
                    Controls.Remove(candidate);
                    candidate.Dispose();
                    lastFailure = error;
                    StartupDiagnostics.Write(new InvalidOperationException(
                        $"WebView2 controller recreation attempt {attempt} failed: phase={phase}; " +
                        $"userDataFolder={candidateUserDataFolder}.",
                        error
                    ));
                    if (attempt < 3) await Task.Delay(attempt * 350);
                }
            }
        }
        webView = CreateMainWebView();
        Controls.Add(webView);
        webView.BringToFront();
        throw new InvalidOperationException(
            $"WebView2 could not recreate its browser controller for {phase}.",
            lastFailure
        );
    }

    private async Task NavigateToAppShellWithRecoveryAsync(CoreWebView2 core, string phase)
    {
        Exception? lastFailure = null;
        for (int attempt = 1; attempt <= WebViewStartupPolicy.NavigationAttemptCount; attempt += 1)
        {
            try
            {
                await NavigateToAppShellOnceAsync(core);
                return;
            }
            catch (Exception error)
            {
                if (error is WebViewProcessFailureException) throw;
                lastFailure = error;
                StartupDiagnostics.Write(new InvalidOperationException(
                    $"WebView2 {phase} navigation attempt {attempt} failed for {options.Url}.",
                    error
                ));
                if (attempt < WebViewStartupPolicy.NavigationAttemptCount)
                {
                    await Task.Delay(WebViewStartupPolicy.RetryDelay(attempt));
                }
            }
        }

        throw new InvalidOperationException(
            "FE Monster 本地应用页面在多次有界恢复后仍未加载完成。" +
            "程序已经尝试了软件渲染浏览器；请检查安全软件是否拦截 localhost。" +
            $"启动阶段：{phase}；地址：{options.Url}",
            lastFailure
        );
    }

    private async Task NavigateToAppShellOnceAsync(CoreWebView2 core)
    {
        TaskCompletionSource<CoreWebView2NavigationCompletedEventArgs> navigation = new(
            TaskCreationOptions.RunContinuationsAsynchronously
        );
        TaskCompletionSource<CoreWebView2ContentLoadingEventArgs> contentLoading = new(
            TaskCreationOptions.RunContinuationsAsynchronously
        );
        ulong navigationId = 0;
        pendingStartupNavigation = navigation;
        void NavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs args)
        {
            navigationId = args.NavigationId;
            StartupDiagnostics.WriteMessage(
                $"WebView2 navigation starting: id={navigationId}; source={args.Uri}; target={options.Url}"
            );
        }

        void ContentLoading(object? sender, CoreWebView2ContentLoadingEventArgs args)
        {
            if (navigationId != 0 && args.NavigationId == navigationId && !args.IsErrorPage)
            {
                contentLoading.TrySetResult(args);
            }
        }

        void NavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs args)
        {
            if (navigationId == 0 || args.NavigationId == navigationId)
            {
                navigation.TrySetResult(args);
            }
        }

        core.NavigationStarting += NavigationStarting;
        core.ContentLoading += ContentLoading;
        core.NavigationCompleted += NavigationCompleted;
        try
        {
            core.Navigate(options.Url);
            Task finished = await Task.WhenAny(
                contentLoading.Task,
                navigation.Task,
                Task.Delay(TimeSpan.FromSeconds(20))
            );
            if (ReferenceEquals(finished, navigation.Task))
            {
                CoreWebView2NavigationCompletedEventArgs result = await navigation.Task;
                if (!result.IsSuccess || result.HttpStatusCode >= 400)
                {
                    throw new InvalidOperationException(
                        $"WebView2 navigation failed: id={result.NavigationId}; " +
                        $"status={result.WebErrorStatus}; http={result.HttpStatusCode}; source={core.Source}."
                    );
                }
                await Task.WhenAny(contentLoading.Task, Task.Delay(TimeSpan.FromSeconds(2)));
            }
            else if (!ReferenceEquals(finished, contentLoading.Task))
            {
                try { core.Stop(); } catch (InvalidOperationException) { }
                throw new TimeoutException(
                    $"WebView2 navigation {navigationId} did not expose the app shell within 20 seconds (source={core.Source})."
                );
            }

            bool shellReady = false;
            string lastPageState = "";
            for (int probeAttempt = 1; probeAttempt <= 20 && !shellReady; probeAttempt += 1)
            {
                string pageStateJson = await core.ExecuteScriptAsync(
                    "JSON.stringify({readyState:document.readyState,hasBody:!!document.body&&document.body.childElementCount>0,hasAppShell:!!document.getElementById('bootScreen'),hasApplication:!!document.querySelector('.app-shell')})"
                );
                lastPageState = pageStateJson;
                shellReady = IsAppShellReady(pageStateJson);
                if (!shellReady && probeAttempt < 20) await Task.Delay(150);
            }
            if (!shellReady)
            {
                throw new InvalidOperationException(
                    $"WebView2 returned a page without the FE Monster app shell: id={navigationId}; " +
                    $"source={core.Source}; state={lastPageState}."
                );
            }
            StartupDiagnostics.WriteMessage(
                $"WebView2 app shell ready: id={navigationId}; source={core.Source}; state={lastPageState}"
            );
        }
        finally
        {
            core.NavigationStarting -= NavigationStarting;
            core.ContentLoading -= ContentLoading;
            core.NavigationCompleted -= NavigationCompleted;
            if (ReferenceEquals(pendingStartupNavigation, navigation)) pendingStartupNavigation = null;
        }
    }

    private static bool IsAppShellReady(string pageStateJson)
    {
        try
        {
            using JsonDocument pageState = JsonDocument.Parse(pageStateJson);
            string serializedState = pageState.RootElement.ValueKind == JsonValueKind.String
                ? pageState.RootElement.GetString() ?? ""
                : pageState.RootElement.GetRawText();
            using JsonDocument state = JsonDocument.Parse(serializedState);
            JsonElement root = state.RootElement;
            bool hasBody = root.TryGetProperty("hasBody", out JsonElement body) && body.GetBoolean();
            bool hasAppShell = root.TryGetProperty("hasAppShell", out JsonElement shell) && shell.GetBoolean();
            // The shell is deliberately near the start of index.html. Once it
            // exists, let the window render while later scripts/fonts continue
            // loading instead of cancelling a healthy slow navigation.
            return hasBody && hasAppShell;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private void HandleWebViewProcessFailed(object? sender, CoreWebView2ProcessFailedEventArgs args)
    {
        StartupDiagnostics.WriteMessage(
            $"WebView2 process failed: kind={args.ProcessFailedKind}; reason={args.Reason}; " +
            $"exitCode={args.ExitCode}; process={args.ProcessDescription}; module={args.FailureSourceModulePath}; " +
            $"startupReady={startupPageReady}."
        );
        if (args.ProcessFailedKind == CoreWebView2ProcessFailedKind.GpuProcessExited)
        {
            // Chromium normally recreates the GPU process itself. Escalate only
            // if the main browser/renderer also fails or the navigation times out.
            return;
        }
        if (!WebViewStartupPolicy.RequiresControllerRecreation(args.ProcessFailedKind.ToString())) return;

        WebViewProcessFailureException failure = new(args.ProcessFailedKind.ToString());
        if (!startupPageReady)
        {
            pendingStartupNavigation?.TrySetException(failure);
            return;
        }

        if (runtimeRecoveryStarted || IsDisposed)
        {
            return;
        }
        runtimeRecoveryStarted = true;
        BeginInvoke(async () =>
        {
            try
            {
                await RecreateWebViewControllerAsync(gpuRequested: false, "runtime software recovery");
                await NavigateToAppShellWithRecoveryAsync(webView.CoreWebView2, "runtime software recovery");
                startupPageReady = true;
            }
            catch (Exception error)
            {
                StartupDiagnostics.Write(error);
                MessageBox.Show(
                    this,
                    "FE Monster's page process stopped and could not be restored.\n\n" +
                    error.Message + "\n\nRestart FE Monster. If this repeats, repair Microsoft Edge WebView2.\n\n" +
                    "Diagnostic log:\n" + StartupDiagnostics.LogPath,
                    "FE Monster",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
            finally
            {
                runtimeRecoveryStarted = false;
            }
        });
    }

    private sealed class WebViewProcessFailureException(string kind)
        : InvalidOperationException($"WebView2 process failed and its controller must be recreated ({kind}).");

    private void HandleWebMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            using var document = JsonDocument.Parse(e.WebMessageAsJson);
            if (document.RootElement.ValueKind != JsonValueKind.Object) return;
            if (!document.RootElement.TryGetProperty("type", out var type))
            {
                return;
            }
            if (type.ValueKind != JsonValueKind.String) return;

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

            if (string.Equals(type.GetString(), "fe-desktop-scene", StringComparison.OrdinalIgnoreCase))
            {
                HandleDesktopSceneMessage(document.RootElement);
                return;
            }

            if (string.Equals(type.GetString(), "fe-pet-desktop", StringComparison.OrdinalIgnoreCase))
            {
                HandleDesktopPetMessage(document.RootElement);
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

    private async void HandleDesktopPetMessage(JsonElement root)
    {
        string action = ReadString(root, "action").Trim().ToLowerInvariant();
        string requestId = ReadString(root, "requestId");
        try
        {
            switch (action)
            {
                case "enable":
                case "show":
                    desktopPetHost.Show();
                    HideMainWindow();
                    break;
                case "toggle":
                    if (desktopPetHost.IsVisible)
                    {
                        desktopPetHost.Hide();
                    }
                    else
                    {
                        desktopPetHost.Show();
                        HideMainWindow();
                    }
                    break;
                case "hide":
                    desktopPetHost.Hide();
                    break;
                case "disable":
                case "show-main":
                    ShowMainWindow();
                    break;
                case "move":
                    desktopPetHost.MoveBy(ReadInt(root, "dx"), ReadInt(root, "dy"));
                    return;
                case "move-end":
                    desktopPetHost.EndMove();
                    return;
                case "panel":
                    JsonElement panelBounds = ReadObject(root, "bounds");
                    JsonElement panelViewport = ReadObject(root, "viewport");
                    float panelRadius = ReadFloat(panelBounds, "radius");
                    if (panelRadius <= 0) panelRadius = ReadFloat(root, "radius");
                    desktopPetHost.SetPanelOpen(
                        ReadBool(root, "open"),
                        new RectangleF(
                            ReadFloat(panelBounds, "left"),
                            ReadFloat(panelBounds, "top"),
                            ReadFloat(panelBounds, "width"),
                            ReadFloat(panelBounds, "height")
                        ),
                        new SizeF(
                            ReadFloat(panelViewport, "width"),
                            ReadFloat(panelViewport, "height")
                        ),
                        panelRadius
                    );
                    return;
                case "bubble":
                    JsonElement bubbleBounds = ReadObject(root, "bounds");
                    JsonElement bubbleViewport = ReadObject(root, "viewport");
                    desktopPetHost.SetBubbleVisible(
                        ReadBool(root, "visible"),
                        new RectangleF(
                            ReadFloat(bubbleBounds, "left"),
                            ReadFloat(bubbleBounds, "top"),
                            ReadFloat(bubbleBounds, "width"),
                            ReadFloat(bubbleBounds, "height")
                        ),
                        new SizeF(
                            ReadFloat(bubbleViewport, "width"),
                            ReadFloat(bubbleViewport, "height")
                        ),
                        ReadFloat(bubbleBounds, "radius")
                    );
                    return;
                case "position-query":
                    break;
                case "position-set":
                    string anchor = ReadString(root, "anchor");
                    double? xPercent = ReadNullableDouble(root, "xPercent");
                    double? yPercent = ReadNullableDouble(root, "yPercent");
                    int requestedDuration = ReadInt(root, "durationMs");
                    await desktopPetHost.GlideToAsync(
                        anchor,
                        xPercent,
                        yPercent,
                        requestedDuration > 0 ? requestedDuration : 500
                    );
                    break;
                case "query":
                case "ready":
                    break;
                default:
                    throw new InvalidOperationException("Unsupported desktop pet action.");
            }
            PostDesktopPetResult(requestId, "");
        }
        catch (Exception error)
        {
            PostDesktopPetResult(requestId, error.Message);
        }
    }

    private void PostDesktopPetResult(string requestId, string error)
    {
        string payload = JsonSerializer.Serialize(new
        {
            type = "fe-pet-desktop-result",
            requestId,
            supported = true,
            enabled = desktopPetHost.IsEnabled,
            visible = desktopPetHost.IsVisible,
            hostMode = "wpf-composition-surface",
            bounds = desktopPetHost.QueryBounds(),
            error
        });
        webView.CoreWebView2?.PostWebMessageAsJson(payload);
        desktopPetHost.PostWebMessageAsJson(payload);
    }

    private async void HandleDesktopSceneMessage(JsonElement root)
    {
        string action = ReadString(root, "action").Trim().ToLowerInvariant();
        string snapshotJson = root.TryGetProperty("snapshot", out var snapshot)
            && snapshot.ValueKind == JsonValueKind.Object
                ? snapshot.GetRawText()
                : "{}";
        try
        {
            if (action == "disable" || action == "hide"
                || (action == "toggle" && desktopSceneHost.IsEnabled))
            {
                desktopSceneHost.Disable();
            }
            else if (action == "update")
            {
                desktopSceneHost.Update(snapshotJson);
            }
            else
            {
                if (webEnvironment is null) throw new InvalidOperationException("WebView2 environment is not ready.");
                await desktopSceneHost.EnableAsync(webEnvironment, snapshotJson);
            }
            PostDesktopSceneResult(desktopSceneHost.IsEnabled, "");
        }
        catch (Exception error)
        {
            desktopSceneHost.Disable();
            PostDesktopSceneResult(false, error.Message);
        }
    }

    private void PostDesktopSceneResult(bool enabled, string error)
    {
        if (webView.CoreWebView2 is null) return;
        webView.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new
        {
            type = "fe-desktop-scene-result",
            enabled,
            error
        }));
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
                backend = "webview2-angle-d3d11",
                gpuAcceleration = true,
                ownsNativeRenderTargets = false
            },
            upscalers = new
            {
                adaptiveSpatial = new
                {
                    available = true,
                    backend = "webgl2-fragment-pass"
                },
                fsr1 = new
                {
                    available = true,
                    backend = "webgl2-spatial-compatible",
                    officialVendorImplementation = false
                },
                fsr2 = new
                {
                    available = false,
                    reason = "motion-vectors-depth-history-required"
                },
                fsr3 = new
                {
                    available = false,
                    reason = "native-temporal-renderer-and-swapchain-required"
                },
                fsr4 = new
                {
                    available = false,
                    reason = "d3d12-fsr-sdk-compatible-gpu-required"
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
                HideMainWindow();
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
            WindowState = FormWindowState.Normal;
            fullscreen = true;
            ApplyWindowSurfacePolicy();
            ApplyWindowCornerPolicy();
            NativeWindowChrome.RefreshFrame(Handle);
            Bounds = Screen.FromControl(this).Bounds;
            TopMost = true;
            return;
        }

        TopMost = false;
        WindowState = FormWindowState.Normal;
        fullscreen = false;
        ApplyWindowSurfacePolicy();
        ApplyWindowCornerPolicy();
        NativeWindowChrome.RefreshFrame(Handle);
        if (!restoreBounds.IsEmpty)
        {
            Rectangle workingArea = Screen.FromRectangle(restoreBounds).WorkingArea;
            Bounds = FitWindowBoundsToWorkingArea(restoreBounds, workingArea, center: false);
        }
    }

    private static Rectangle FitWindowBoundsToWorkingArea(
        Rectangle requestedBounds,
        Rectangle workingArea,
        bool center
    )
    {
        int horizontalMargin = Math.Min(WindowWorkAreaMargin, Math.Max(0, (workingArea.Width - 1) / 2));
        int verticalMargin = Math.Min(WindowWorkAreaMargin, Math.Max(0, (workingArea.Height - 1) / 2));
        Rectangle safeArea = new(
            workingArea.Left + horizontalMargin,
            workingArea.Top + verticalMargin,
            Math.Max(1, workingArea.Width - horizontalMargin * 2),
            Math.Max(1, workingArea.Height - verticalMargin * 2)
        );

        int requestedWidth = Math.Max(1, requestedBounds.Width);
        int requestedHeight = Math.Max(1, requestedBounds.Height);
        double scale = Math.Min(
            1d,
            Math.Min(
                safeArea.Width / (double)requestedWidth,
                safeArea.Height / (double)requestedHeight
            )
        );
        int width = Math.Max(1, Math.Min(safeArea.Width, (int)Math.Floor(requestedWidth * scale)));
        int height = Math.Max(1, Math.Min(safeArea.Height, (int)Math.Floor(requestedHeight * scale)));
        int left = center
            ? safeArea.Left + (safeArea.Width - width) / 2
            : Math.Clamp(requestedBounds.Left, safeArea.Left, safeArea.Right - width);
        int top = center
            ? safeArea.Top + (safeArea.Height - height) / 2
            : Math.Clamp(requestedBounds.Top, safeArea.Top, safeArea.Bottom - height);
        return new Rectangle(left, top, width, height);
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

    private int HitTestWindowFrame(IntPtr packedScreenPoint)
    {
        if (fullscreen || WindowState != FormWindowState.Normal)
        {
            return NativeWindowChrome.HtClient;
        }

        Point clientPoint = PointToClient(NativeWindowChrome.PointFromLParam(packedScreenPoint));
        int dpi = Math.Max(96, DeviceDpi);
        if (cachedResizeFrameDpi != dpi)
        {
            cachedResizeFrameDpi = dpi;
            cachedResizeFrameSize = NativeWindowChrome.GetResizeFrameSize(Handle, dpi);
        }
        Size frame = cachedResizeFrameSize;
        bool left = clientPoint.X < frame.Width;
        bool right = clientPoint.X >= ClientSize.Width - frame.Width;
        bool top = clientPoint.Y < frame.Height;
        bool bottom = clientPoint.Y >= ClientSize.Height - frame.Height;

        if (top && left) return NativeWindowChrome.HtTopLeft;
        if (top && right) return NativeWindowChrome.HtTopRight;
        if (bottom && left) return NativeWindowChrome.HtBottomLeft;
        if (bottom && right) return NativeWindowChrome.HtBottomRight;
        if (left) return NativeWindowChrome.HtLeft;
        if (right) return NativeWindowChrome.HtRight;
        if (top) return NativeWindowChrome.HtTop;
        if (bottom) return NativeWindowChrome.HtBottom;
        return NativeWindowChrome.HtClient;
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

    private void ApplyWindowSurfacePolicy()
    {
        if (!IsHandleCreated || WindowState == FormWindowState.Minimized) return;
        NativeWindowChrome.TryEnableNonClientRendering(Handle);
        NativeWindowChrome.TryForceOpaqueRedirectionBitmap(Handle);
        NativeWindowChrome.TrySuppressVisibleBorder(Handle);
    }

    private static double? ReadNullableDouble(JsonElement element, string propertyName)
    {
        return element.TryGetProperty(propertyName, out var value)
            && value.ValueKind == JsonValueKind.Number
            && value.TryGetDouble(out double number)
            && double.IsFinite(number)
                ? number
                : null;
    }

    private static JsonElement ReadObject(JsonElement element, string propertyName)
    {
        return element.ValueKind == JsonValueKind.Object
            && element.TryGetProperty(propertyName, out var value)
            && value.ValueKind == JsonValueKind.Object
                ? value
                : default;
    }

    private static float ReadFloat(JsonElement element, string propertyName)
    {
        return element.ValueKind == JsonValueKind.Object
            && element.TryGetProperty(propertyName, out var value)
            && value.ValueKind == JsonValueKind.Number
            && value.TryGetSingle(out float number)
                ? number
                : 0;
    }

    private void ApplyWindowCornerPolicy()
    {
        if (!IsHandleCreated || WindowState == FormWindowState.Minimized || ClientSize.Width < 2 || ClientSize.Height < 2) return;

        bool shouldRound = !fullscreen && WindowState == FormWindowState.Normal;
        if (NativeWindowChrome.SupportsSystemRoundedCorners)
        {
            int preference = shouldRound
                ? NativeWindowChrome.DwmWcpRound
                : NativeWindowChrome.DwmWcpDoNotRound;
            bool preferenceApplied = nativeCornerPreferenceApplied
                && appliedCornerPreference == preference;
            if (!preferenceApplied)
            {
                preferenceApplied = NativeWindowChrome.TrySetCornerPreference(Handle, preference);
                nativeCornerPreferenceApplied = preferenceApplied;
                appliedCornerPreference = preferenceApplied ? preference : -1;
            }
        }
    }
}

internal sealed class RecordingToolbarForm : Form
{
    private static readonly Color ToolbarBack = Color.FromArgb(13, 20, 25);
    private const int TOOLBAR_CORNER_RADIUS_DIP = 18;
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

    protected override CreateParams CreateParams
    {
        get
        {
            CreateParams parameters = base.CreateParams;
            parameters.Style |= NativeWindowChrome.CustomFrameStyle;
            parameters.ClassStyle |= NativeWindowChrome.DropShadowClassStyle;
            return parameters;
        }
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

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        NativeWindowChrome.TryEnableNonClientRendering(Handle);
        ApplyWindowCornerPolicy();
    }

    protected override void WndProc(ref Message message)
    {
        if (message.Msg == NativeWindowChrome.WmNcCalcSize)
        {
            NativeWindowChrome.RetainThinNonClientBorder(
                ref message,
                Handle,
                DeviceDpi
            );
            return;
        }

        if (message.Msg == NativeWindowChrome.WmNcHitTest)
        {
            // The toolbar is fixed-size; keep its whole surface in the client area
            // so native resize cursors never leak through its retained frame style.
            message.Result = new IntPtr(NativeWindowChrome.HtClient);
            return;
        }

        base.WndProc(ref message);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        using var path = RoundedRectPath(ClientRectangle, CornerRadiusPixels);
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
        ApplyWindowCornerPolicy();
    }

    protected override void OnDpiChanged(DpiChangedEventArgs e)
    {
        base.OnDpiChanged(e);
        ApplyWindowCornerPolicy();
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

    private int CornerRadiusPixels => Math.Max(
        1,
        (int)Math.Round(TOOLBAR_CORNER_RADIUS_DIP * Math.Max(96, DeviceDpi) / 96d)
    );

    private void ApplyWindowCornerPolicy()
    {
        if (!IsHandleCreated || WindowState == FormWindowState.Minimized || ClientSize.Width < 2 || ClientSize.Height < 2) return;

        if (NativeWindowChrome.SupportsSystemRoundedCorners)
        {
            NativeWindowChrome.TrySetCornerPreference(
                Handle,
                NativeWindowChrome.DwmWcpRound
            );
        }
    }

    private static GraphicsPath RoundedRectPath(Rectangle rect, int radius)
    {
        int safeRadius = Math.Max(1, Math.Min(radius, Math.Min(rect.Width, rect.Height) / 2));
        int diameter = safeRadius * 2;
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

internal static class NativeWindowChrome
{
    internal const int WmNcCalcSize = 0x0083;
    internal const int WmNcHitTest = 0x0084;

    internal const int HtClient = 1;
    internal const int HtLeft = 10;
    internal const int HtRight = 11;
    internal const int HtTop = 12;
    internal const int HtTopLeft = 13;
    internal const int HtTopRight = 14;
    internal const int HtBottom = 15;
    internal const int HtBottomLeft = 16;
    internal const int HtBottomRight = 17;

    internal const int DwmWcpDoNotRound = 1;
    internal const int DwmWcpRound = 2;

    internal const int CustomFrameStyle =
        WsCaption | WsSysMenu | WsThickFrame | WsMinimizeBox | WsMaximizeBox;
    internal const int DropShadowClassStyle = 0x00020000;

    private const int WsCaption = 0x00C00000;
    private const int WsSysMenu = 0x00080000;
    private const int WsThickFrame = 0x00040000;
    private const int WsMinimizeBox = 0x00020000;
    private const int WsMaximizeBox = 0x00010000;
    private const int DwmWaNcRenderingPolicy = 2;
    private const int DwmNcRenderingEnabled = 2;
    private const int DwmWaWindowCornerPreference = 33;
    private const int DwmWaBorderColor = 34;
    private const int DwmWaRedirectionBitmapAlpha = 39;
    private const int DwmColorNone = unchecked((int)0xFFFFFFFE);
    private const int SmCxSizeFrame = 32;
    private const int SmCySizeFrame = 33;
    private const int SmCxPaddedBorder = 92;
    private const uint SwpNoSize = 0x0001;
    private const uint SwpNoMove = 0x0002;
    private const uint SwpNoZOrder = 0x0004;
    private const uint SwpNoActivate = 0x0010;
    private const uint SwpFrameChanged = 0x0020;

    internal static bool SupportsSystemRoundedCorners =>
        OperatingSystem.IsWindowsVersionAtLeast(10, 0, 22000);

    internal static bool SupportsOpaqueRedirectionBitmap =>
        OperatingSystem.IsWindowsVersionAtLeast(10, 0, 26100);

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(
        IntPtr window,
        int attribute,
        ref int attributeValue,
        int attributeSize
    );

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetWindowPos(
        IntPtr window,
        IntPtr insertAfter,
        int x,
        int y,
        int width,
        int height,
        uint flags
    );

    [DllImport("user32.dll")]
    private static extern uint GetDpiForWindow(IntPtr window);

    [DllImport("user32.dll")]
    private static extern int GetSystemMetricsForDpi(int index, uint dpi);

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeRect
    {
        internal int Left;
        internal int Top;
        internal int Right;
        internal int Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct NcCalcSizeParameters
    {
        internal NativeRect ProposedClient;
        internal NativeRect OldWindow;
        internal NativeRect OldClient;
        internal IntPtr WindowPosition;
    }

    internal static void TryEnableNonClientRendering(IntPtr window)
    {
        int policy = DwmNcRenderingEnabled;
        try
        {
            DwmSetWindowAttribute(
                window,
                DwmWaNcRenderingPolicy,
                ref policy,
                sizeof(int)
            );
        }
        catch (DllNotFoundException)
        {
        }
        catch (EntryPointNotFoundException)
        {
        }
    }

    internal static bool TrySetCornerPreference(IntPtr window, int preference)
    {
        try
        {
            return DwmSetWindowAttribute(
                window,
                DwmWaWindowCornerPreference,
                ref preference,
                sizeof(int)
            ) == 0;
        }
        catch (DllNotFoundException)
        {
            return false;
        }
        catch (EntryPointNotFoundException)
        {
            return false;
        }
    }

    internal static bool TryForceOpaqueRedirectionBitmap(IntPtr window)
    {
        if (!SupportsOpaqueRedirectionBitmap) return false;
        int enabled = 0;
        try
        {
            return DwmSetWindowAttribute(
                window,
                DwmWaRedirectionBitmapAlpha,
                ref enabled,
                sizeof(int)
            ) == 0;
        }
        catch (DllNotFoundException)
        {
            return false;
        }
        catch (EntryPointNotFoundException)
        {
            return false;
        }
    }

    internal static bool TrySuppressVisibleBorder(IntPtr window)
    {
        if (!SupportsSystemRoundedCorners) return false;
        int color = DwmColorNone;
        try
        {
            return DwmSetWindowAttribute(
                window,
                DwmWaBorderColor,
                ref color,
                sizeof(int)
            ) == 0;
        }
        catch (DllNotFoundException)
        {
            return false;
        }
        catch (EntryPointNotFoundException)
        {
            return false;
        }
    }

    internal static void RefreshFrame(IntPtr window)
    {
        if (window == IntPtr.Zero) return;
        _ = SetWindowPos(
            window,
            IntPtr.Zero,
            0,
            0,
            0,
            0,
            SwpNoMove | SwpNoSize | SwpNoZOrder | SwpNoActivate | SwpFrameChanged
        );
    }

    internal static void RetainThinNonClientBorder(
        ref Message message,
        IntPtr window,
        int fallbackDpi
    )
    {
        if (message.LParam == IntPtr.Zero)
        {
            message.Result = IntPtr.Zero;
            return;
        }

        uint dpi = ResolveWindowDpi(window, fallbackDpi);
        int border = Math.Max(1, (int)Math.Round(dpi / 96d));
        if (message.WParam != IntPtr.Zero)
        {
            NcCalcSizeParameters parameters =
                Marshal.PtrToStructure<NcCalcSizeParameters>(message.LParam);
            InsetRect(ref parameters.ProposedClient, border);
            Marshal.StructureToPtr(parameters, message.LParam, false);
        }
        else
        {
            NativeRect client = Marshal.PtrToStructure<NativeRect>(message.LParam);
            InsetRect(ref client, border);
            Marshal.StructureToPtr(client, message.LParam, false);
        }
        message.Result = IntPtr.Zero;
    }

    internal static Size GetResizeFrameSize(IntPtr window, int fallbackDpi)
    {
        uint dpi = ResolveWindowDpi(window, fallbackDpi);

        int fallback = Math.Max(6, (int)Math.Ceiling(8d * dpi / 96d));
        try
        {
            int horizontal = GetSystemMetricsForDpi(SmCxSizeFrame, dpi)
                + GetSystemMetricsForDpi(SmCxPaddedBorder, dpi);
            int vertical = GetSystemMetricsForDpi(SmCySizeFrame, dpi)
                + GetSystemMetricsForDpi(SmCxPaddedBorder, dpi);
            return new Size(
                Math.Max(fallback, horizontal),
                Math.Max(fallback, vertical)
            );
        }
        catch (DllNotFoundException)
        {
            return new Size(fallback, fallback);
        }
        catch (EntryPointNotFoundException)
        {
            return new Size(fallback, fallback);
        }
    }

    private static uint ResolveWindowDpi(IntPtr window, int fallbackDpi)
    {
        uint dpi = (uint)Math.Max(96, fallbackDpi);
        try
        {
            uint reportedDpi = GetDpiForWindow(window);
            if (reportedDpi > 0) dpi = reportedDpi;
        }
        catch (DllNotFoundException)
        {
        }
        catch (EntryPointNotFoundException)
        {
        }
        return dpi;
    }

    private static void InsetRect(ref NativeRect rect, int requestedBorder)
    {
        int horizontal = Math.Min(
            requestedBorder,
            Math.Max(0, (rect.Right - rect.Left - 1) / 2)
        );
        int vertical = Math.Min(
            requestedBorder,
            Math.Max(0, (rect.Bottom - rect.Top - 1) / 2)
        );
        rect.Left += horizontal;
        rect.Right -= horizontal;
        rect.Top += vertical;
        rect.Bottom -= vertical;
    }

    internal static Point PointFromLParam(IntPtr packedPoint)
    {
        long value = packedPoint.ToInt64();
        return new Point(
            unchecked((short)(value & 0xffff)),
            unchecked((short)((value >> 16) & 0xffff))
        );
    }
}
