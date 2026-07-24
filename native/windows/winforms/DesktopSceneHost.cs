using System.Runtime.InteropServices;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace FeMonster.Client;

internal sealed class DesktopSceneHost : IDisposable
{
    private readonly ClientOptions options;
    private DesktopSceneForm? form;

    public DesktopSceneHost(ClientOptions options)
    {
        this.options = options;
    }

    public bool IsEnabled => form is { IsDisposed: false };

    public async Task EnableAsync(CoreWebView2Environment environment, string snapshotJson)
    {
        if (form is null || form.IsDisposed)
        {
            form = new DesktopSceneForm(options, environment);
            form.FormClosed += (_, _) => form = null;
            await form.InitializeAsync();
        }
        form.PostSnapshot(snapshotJson);
    }

    public void Update(string snapshotJson)
    {
        form?.PostSnapshot(snapshotJson);
    }

    public void Disable()
    {
        var active = form;
        form = null;
        if (active is null || active.IsDisposed) return;
        active.Close();
        active.Dispose();
    }

    public void Dispose()
    {
        Disable();
    }
}

internal sealed class DesktopSceneForm : Form
{
    private const int WM_SPAWN_WORKERW = 0x052C;
    private const int GWL_EXSTYLE = -20;
    private const int WS_EX_TRANSPARENT = 0x00000020;
    private const int WS_EX_TOOLWINDOW = 0x00000080;
    private const int WS_EX_NOACTIVATE = 0x08000000;
    private const uint SMTO_NORMAL = 0x0000;
    private const uint SWP_NOACTIVATE = 0x0010;
    private const uint SWP_SHOWWINDOW = 0x0040;
    private static readonly IntPtr HWND_BOTTOM = new(1);

    private readonly ClientOptions options;
    private readonly CoreWebView2Environment environment;
    private readonly WebView2 webView = new() { Dock = DockStyle.Fill };
    private string pendingSnapshot = "{}";
    private bool navigationReady;

    public DesktopSceneForm(ClientOptions options, CoreWebView2Environment environment)
    {
        this.options = options;
        this.environment = environment;
        Text = "FE Monster Desktop Scene";
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        Bounds = SystemInformation.VirtualScreen;
        BackColor = Color.Black;
        Controls.Add(webView);
    }

    protected override bool ShowWithoutActivation => true;

    public async Task InitializeAsync()
    {
        Show();
        webView.DefaultBackgroundColor = Color.FromArgb(255, 0, 0, 0);
        await webView.EnsureCoreWebView2Async(environment);
        webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
        webView.CoreWebView2.Settings.AreDevToolsEnabled = false;
        webView.CoreWebView2.Settings.IsWebMessageEnabled = true;
        webView.CoreWebView2.NavigationCompleted += (_, args) =>
        {
            navigationReady = args.IsSuccess;
            if (navigationReady) SendPendingSnapshot();
        };
        webView.CoreWebView2.Navigate(DesktopSceneUrl(options.Url));
    }

    public void PostSnapshot(string snapshotJson)
    {
        if (!string.IsNullOrWhiteSpace(snapshotJson)) pendingSnapshot = snapshotJson;
        if (navigationReady) SendPendingSnapshot();
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        BeginInvoke(AttachToDesktopWorkerW);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            navigationReady = false;
            webView.Dispose();
        }
        base.Dispose(disposing);
    }

    private void SendPendingSnapshot()
    {
        if (webView.CoreWebView2 is null) return;
        webView.CoreWebView2.PostWebMessageAsJson(
            "{\"type\":\"fe-desktop-scene-state\",\"snapshot\":" + pendingSnapshot + "}"
        );
    }

    private void AttachToDesktopWorkerW()
    {
        if (!IsHandleCreated || IsDisposed) return;
        var workerW = FindDesktopWorkerW();
        if (workerW == IntPtr.Zero) return;

        var exStyle = GetWindowLong(Handle, GWL_EXSTYLE);
        SetWindowLong(
            Handle,
            GWL_EXSTYLE,
            exStyle | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE
        );
        SetParent(Handle, workerW);
        if (!GetClientRect(workerW, out var rect)) return;
        SetWindowPos(
            Handle,
            HWND_BOTTOM,
            0,
            0,
            Math.Max(1, rect.Right - rect.Left),
            Math.Max(1, rect.Bottom - rect.Top),
            SWP_NOACTIVATE | SWP_SHOWWINDOW
        );
    }

    private static IntPtr FindDesktopWorkerW()
    {
        var progman = FindWindow("Progman", null);
        if (progman != IntPtr.Zero)
        {
            SendMessageTimeout(
                progman,
                WM_SPAWN_WORKERW,
                IntPtr.Zero,
                IntPtr.Zero,
                SMTO_NORMAL,
                1000,
                out _
            );
        }

        var workerW = IntPtr.Zero;
        EnumWindows((topLevel, _) =>
        {
            var shellView = FindWindowEx(topLevel, IntPtr.Zero, "SHELLDLL_DefView", null);
            if (shellView == IntPtr.Zero) return true;
            workerW = FindWindowEx(IntPtr.Zero, topLevel, "WorkerW", null);
            return workerW == IntPtr.Zero;
        }, IntPtr.Zero);
        return workerW != IntPtr.Zero ? workerW : progman;
    }

    private static string DesktopSceneUrl(string rawUrl)
    {
        var builder = new UriBuilder(rawUrl);
        var parts = builder.Query
            .TrimStart('?')
            .Split('&', StringSplitOptions.RemoveEmptyEntries)
            .Where(part => !part.StartsWith("client=", StringComparison.OrdinalIgnoreCase))
            .ToList();
        parts.Add("client=desktop-scene");
        builder.Query = string.Join("&", parts);
        return builder.Uri.ToString();
    }

    private delegate bool EnumWindowsCallback(IntPtr window, IntPtr parameter);

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeRect
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr FindWindow(string? className, string? windowName);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr FindWindowEx(IntPtr parent, IntPtr childAfter, string className, string? windowName);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsCallback callback, IntPtr parameter);

    [DllImport("user32.dll")]
    private static extern IntPtr SetParent(IntPtr child, IntPtr newParent);

    [DllImport("user32.dll")]
    private static extern bool GetClientRect(IntPtr window, out NativeRect rect);

    [DllImport("user32.dll")]
    private static extern int GetWindowLong(IntPtr window, int index);

    [DllImport("user32.dll")]
    private static extern int SetWindowLong(IntPtr window, int index, int value);

    [DllImport("user32.dll")]
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
    private static extern IntPtr SendMessageTimeout(
        IntPtr window,
        int message,
        IntPtr wParam,
        IntPtr lParam,
        uint flags,
        uint timeout,
        out IntPtr result
    );
}
