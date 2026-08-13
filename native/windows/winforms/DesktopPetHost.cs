using System.ComponentModel;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;
using Microsoft.Win32;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using WinFormsWebView2 = Microsoft.Web.WebView2.WinForms.WebView2;
using Forms = System.Windows.Forms;
using Wpf = System.Windows;
using WpfInput = System.Windows.Input;
using WpfInterop = System.Windows.Interop;
using WpfMedia = System.Windows.Media;
using WpfThreading = System.Windows.Threading;

namespace FeMonster.Client;

// A windowed WinForms WebView2 leaves an opaque child HWND behind a transparent
// top-level window; after a Region/DPI change that HWND is composed as a black
// disc. The main player therefore stays in its proven WinForms host while the
// desktop-only companion uses WebView2CompositionControl in a per-pixel WPF
// window. Both controllers share one WebView2 environment/profile, so account,
// preferences and conversation storage remain shared without color-key hacks.
internal sealed class DesktopPetHost : IDisposable
{
    private readonly WinFormsWebView2 mainWebView;
    private readonly Action showMainWindow;
    private readonly string appUrl;
    private DesktopPetWindow? window;
    private bool disabling;
    private int generation;

    public DesktopPetHost(
        WinFormsWebView2 mainWebView,
        Action showMainWindow,
        string appUrl)
    {
        this.mainWebView = mainWebView;
        this.showMainWindow = showMainWindow;
        this.appUrl = appUrl;
    }

    public event Action? StateChanged;

    public event EventHandler<CoreWebView2WebMessageReceivedEventArgs>? WebMessageReceived;

    public bool IsEnabled => window is { IsClosed: false };

    public bool IsVisible => window is { IsClosed: false, IsVisible: true };

    public void Enable()
    {
        if (mainWebView.CoreWebView2 is null)
        {
            throw new InvalidOperationException("WebView2 is not ready.");
        }

        if (window is null || window.IsClosed)
        {
            var created = new DesktopPetWindow();
            created.HideRequested += Hide;
            created.Closed += (_, _) =>
            {
                if (ReferenceEquals(window, created)) window = null;
                StateChanged?.Invoke();
                if (!disabling && !mainWebView.IsDisposed) showMainWindow();
            };
            window = created;
            int currentGeneration = ++generation;
            created.ShowPet();
            _ = InitializePetWebViewAsync(created, currentGeneration);
        }
        else
        {
            window.ShowPet();
        }
        StateChanged?.Invoke();
    }

    public void Show()
    {
        if (window is null || window.IsClosed)
        {
            Enable();
            return;
        }
        window.ShowPet();
        StateChanged?.Invoke();
    }

    public void Hide()
    {
        if (window is null || window.IsClosed) return;
        window.HidePet();
        StateChanged?.Invoke();
    }

    public void MoveBy(int dx, int dy) => window?.MoveBy(dx, dy);

    public void EndMove() => window?.EndMove();

    public object QueryBounds() => window?.QueryBounds() ?? new { available = false };

    public Task GlideToAsync(string anchor, double? xPercent, double? yPercent, int durationMs)
    {
        return window?.GlideToAsync(anchor, xPercent, yPercent, durationMs)
            ?? Task.FromException(new InvalidOperationException("Desktop pet mode is not enabled."));
    }

    public void SetPanelOpen(
        bool open,
        RectangleF boundsCss,
        SizeF viewportCss,
        float radiusCss)
    {
        window?.SetPanelOpen(open, boundsCss, viewportCss, radiusCss);
    }

    public void SetBubbleVisible(bool visible, RectangleF boundsCss, SizeF viewportCss, float radiusCss)
    {
        window?.SetBubbleVisible(visible, boundsCss, viewportCss, radiusCss);
    }

    public void SavePosition() => window?.SavePosition();

    public void Disable()
    {
        DesktopPetWindow? active = window;
        window = null;
        disabling = true;
        try
        {
            generation++;
            if (active is not null && !active.IsClosed) active.Close();
        }
        finally
        {
            disabling = false;
        }
        StateChanged?.Invoke();
    }

    public void Dispose() => Disable();

    public void PostWebMessageAsJson(string json)
    {
        window?.PetWebView.CoreWebView2?.PostWebMessageAsJson(json);
    }

    private async Task InitializePetWebViewAsync(DesktopPetWindow target, int currentGeneration)
    {
        try
        {
            CoreWebView2Environment environment = mainWebView.CoreWebView2?.Environment
                ?? throw new InvalidOperationException("WebView2 environment is not ready.");
            WebView2CompositionControl petWebView = target.PetWebView;
            petWebView.DefaultBackgroundColor = Color.FromArgb(0, 0, 0, 0);
            petWebView.AllowExternalDrop = false;
            await petWebView.EnsureCoreWebView2Async(environment);
            if (currentGeneration != generation || target.IsClosed) return;
            petWebView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            petWebView.CoreWebView2.Settings.AreDevToolsEnabled = true;
            petWebView.CoreWebView2.Settings.IsWebMessageEnabled = true;
            petWebView.CoreWebView2.WebMessageReceived += HandlePetWebMessage;
            petWebView.CoreWebView2.Navigate(DesktopPetUrl(appUrl));
        }
        catch (Exception error)
        {
            StartupDiagnostics.Write(new InvalidOperationException(
                "FE Monster could not initialize its transparent desktop pet surface.",
                error));
            if (currentGeneration == generation && !target.IsClosed)
            {
                target.Close();
            }
        }
    }

    private void HandlePetWebMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        WebMessageReceived?.Invoke(sender, e);
    }

    private static string DesktopPetUrl(string rawUrl)
    {
        var builder = new UriBuilder(rawUrl);
        var query = builder.Query.TrimStart('?')
            .Split('&', StringSplitOptions.RemoveEmptyEntries)
            .Where(pair => !string.Equals(
                Uri.UnescapeDataString(pair.Split('=', 2)[0]),
                "client",
                StringComparison.OrdinalIgnoreCase))
            .ToList();
        query.Add("client=desktop-pet");
        builder.Query = string.Join('&', query);
        return builder.Uri.AbsoluteUri;
    }
}

internal sealed class DesktopPetWindow : Wpf.Window
{
    [StructLayout(LayoutKind.Sequential)]
    private struct NativeRect
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;

        public readonly Rectangle ToRectangle() => Rectangle.FromLTRB(Left, Top, Right, Bottom);
    }

    private enum PetDockEdge
    {
        None,
        Left,
        Right,
        Top,
        Bottom
    }

    private const int ClosedWidth = 300;
    private const int ClosedHeight = 340;
    private const int PanelWidth = 720;
    private const int PanelHeight = 660;
    private const int DefaultPanelHitWidth = 320;
    private const int DefaultPanelHitHeight = 148;
    private const int DefaultPanelHitRadius = 22;
    private const int MascotRenderSize = 276;
    private const int MascotHaloOverscan = 8;
    private const int EdgeMargin = 20;
    private const int EdgeSnapDistance = 42;
    private const int EdgeRevealSize = 24;
    private const int EdgeRevealProximity = 52;
    private const int EdgeHideDelayMs = 900;
    private const int BaseDpi = 96;
    private const int WM_DPICHANGED = 0x02E0;
    private const uint SWP_NOZORDER = 0x0004;
    private const uint SWP_NOACTIVATE = 0x0010;
    private const string DefaultPositionRegistryPath = @"Software\FE Monster\DesktopPet";

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr window, out NativeRect bounds);

    [DllImport("user32.dll")]
    private static extern bool GetClientRect(IntPtr window, out NativeRect bounds);

    [DllImport("user32.dll")]
    private static extern bool SetWindowPos(
        IntPtr window,
        IntPtr insertAfter,
        int x,
        int y,
        int width,
        int height,
        uint flags);

    [DllImport("user32.dll")]
    private static extern int SetWindowRgn(IntPtr window, IntPtr region, bool redraw);

    [DllImport("user32.dll")]
    private static extern uint GetDpiForWindow(IntPtr window);

    [DllImport("gdi32.dll")]
    private static extern bool DeleteObject(IntPtr value);

    private readonly WebView2CompositionControl webView = new();
    private readonly Forms.Timer edgeTimer;
    private readonly Region characterHitRegionDip = BuildCharacterHitRegion();
    private WpfInterop.HwndSource? source;
    private IntPtr handle;
    private bool panelOpen;
    private RectangleF panelBoundsCss = RectangleF.Empty;
    private SizeF panelViewportCss = SizeF.Empty;
    private float panelRadiusCss;
    private bool bubbleVisible;
    private RectangleF bubbleBoundsCss = RectangleF.Empty;
    private SizeF bubbleViewportCss = SizeF.Empty;
    private float bubbleRadiusCss;
    private bool moving;
    private bool autoHidden;
    private PetDockEdge dockEdge;
    private Rectangle dockWorkingArea = Rectangle.Empty;
    private int dockOffset;
    private Point? animationTarget;
    private Point? glideStart;
    private Point? glideTarget;
    private long glideStartedAt;
    private int glideDurationMs;
    private TaskCompletionSource<bool>? glideCompletion;
    private long pointerOutsideSince;
    private int appliedDpi = BaseDpi;
    private bool preserveLegacyDockOffsetOnFirstDpiApply;

    public DesktopPetWindow()
    {
        Title = "FE Monster Desktop Pet";
        WindowStyle = Wpf.WindowStyle.None;
        ResizeMode = Wpf.ResizeMode.NoResize;
        AllowsTransparency = true;
        Background = WpfMedia.Brushes.Transparent;
        ShowInTaskbar = false;
        Topmost = true;
        WindowStartupLocation = Wpf.WindowStartupLocation.Manual;
        Width = ClosedWidth;
        Height = ClosedHeight;
        MinWidth = 0;
        MinHeight = 0;
        SizeToContent = Wpf.SizeToContent.Manual;
        SnapsToDevicePixels = true;
        UseLayoutRounding = true;
        Content = webView;

        SourceInitialized += HandleSourceInitialized;
        SizeChanged += (_, _) => UpdateInteractiveRegion();
        Closing += HandleClosing;
        Closed += HandleClosed;
        KeyDown += HandleKeyDown;
        // Pointer gestures inside the tight native region belong to the WebView.
        // In particular, do not handle a double-click at the WPF window: it is
        // a routed event and would also consume the mascot's web double-click.

        edgeTimer = new Forms.Timer { Interval = 80 };
        edgeTimer.Tick += HandleEdgeTimerTick;
        edgeTimer.Start();
        SystemEvents.DisplaySettingsChanged += HandleDisplaySettingsChanged;
    }

    public bool IsClosed { get; private set; }

    public WebView2CompositionControl PetWebView => webView;

    public event Action? HideRequested;

    private static string PositionRegistryPath
    {
        get
        {
            string? testPath = Environment.GetEnvironmentVariable("FE_MONSTER_DESKTOP_PET_TEST_REGISTRY_PATH");
            return !string.IsNullOrWhiteSpace(testPath)
                && testPath.StartsWith(@"Software\FE Monster\DesktopPetTest\", StringComparison.OrdinalIgnoreCase)
                    ? testPath
                    : DefaultPositionRegistryPath;
        }
    }

    public void ShowPet()
    {
        if (IsClosed) return;
        if (!IsVisible) Show();
        if (dockEdge != PetDockEdge.None) SetAutoHidden(false, false);
        ClampToVisibleScreen();
        Topmost = true;
        Activate();
        webView.Focus();
        pointerOutsideSince = Environment.TickCount64 + 700;
    }

    public void HidePet()
    {
        SavePosition();
        Hide();
    }

    public void SetPanelOpen(
        bool open,
        RectangleF boundsCss,
        SizeF viewportCss,
        float radiusCss)
    {
        bool hasGeometry = open
            && boundsCss.Width > 0
            && boundsCss.Height > 0
            && viewportCss.Width > 0
            && viewportCss.Height > 0;
        panelBoundsCss = hasGeometry ? boundsCss : RectangleF.Empty;
        panelViewportCss = hasGeometry ? viewportCss : SizeF.Empty;
        panelRadiusCss = hasGeometry
            ? (radiusCss > 0 ? radiusCss : DefaultPanelHitRadius)
            : 0;
        if (panelOpen == open)
        {
            UpdateInteractiveRegion();
            return;
        }
        if (handle == IntPtr.Zero)
        {
            panelOpen = open;
            return;
        }
        if (open && dockEdge != PetDockEdge.None) SetAutoHidden(false, false);
        panelOpen = open;
        Rectangle current = WindowBounds();
        int width = Dip(open ? PanelWidth : ClosedWidth);
        int height = Dip(open ? PanelHeight : ClosedHeight);
        Rectangle area = Forms.Screen.FromRectangle(current).WorkingArea;
        int right = Math.Min(area.Right - Dip(EdgeMargin), current.Right);
        int bottom = Math.Min(area.Bottom - Dip(EdgeMargin), current.Bottom);
        SetBounds(new Rectangle(
            Math.Max(area.Left, right - width),
            Math.Max(area.Top, bottom - height),
            width,
            height));
        UpdateInteractiveRegion();
        if (!open && dockEdge != PetDockEdge.None)
        {
            SetLocation(DockedLocation(area, false));
            autoHidden = false;
            pointerOutsideSince = Environment.TickCount64 + 700;
        }
        if (open)
        {
            Activate();
            webView.Focus();
        }
    }

    public void SetBubbleVisible(bool visible, RectangleF boundsCss, SizeF viewportCss, float radiusCss)
    {
        bool nextVisible = visible
            && boundsCss.Width > 0
            && boundsCss.Height > 0
            && viewportCss.Width > 0
            && viewportCss.Height > 0;
        bubbleVisible = nextVisible;
        bubbleBoundsCss = nextVisible ? boundsCss : RectangleF.Empty;
        bubbleViewportCss = nextVisible ? viewportCss : SizeF.Empty;
        bubbleRadiusCss = nextVisible ? Math.Max(0, radiusCss) : 0;
        UpdateInteractiveRegion();
    }

    public void MoveBy(int dx, int dy)
    {
        CancelGlide();
        if ((dx == 0 && dy == 0) || WindowState == Wpf.WindowState.Minimized || handle == IntPtr.Zero) return;
        if (autoHidden) SetAutoHidden(false, false);
        animationTarget = null;
        moving = true;
        dockEdge = PetDockEdge.None;
        dockWorkingArea = Rectangle.Empty;
        Rectangle bounds = WindowBounds();
        Rectangle area = Forms.Screen.FromRectangle(bounds).WorkingArea;
        int minimumVisible = Dip(56);
        int left = Math.Max(area.Left - bounds.Width + minimumVisible,
            Math.Min(bounds.Left + dx, area.Right - minimumVisible));
        int top = Math.Max(area.Top - bounds.Height + minimumVisible,
            Math.Min(bounds.Top + dy, area.Bottom - minimumVisible));
        SetLocation(new Point(left, top));
    }

    public object QueryBounds()
    {
        if (handle == IntPtr.Zero) return new { available = false };
        Rectangle bounds = WindowBounds();
        Rectangle WorkingArea = WorkingAreaForDock(bounds);
        double xPercent = WorkingArea.Width <= bounds.Width
            ? 0
            : Math.Clamp((double)(bounds.Left - WorkingArea.Left) / (WorkingArea.Width - bounds.Width), 0, 1);
        double yPercent = WorkingArea.Height <= bounds.Height
            ? 0
            : Math.Clamp((double)(bounds.Top - WorkingArea.Top) / (WorkingArea.Height - bounds.Height), 0, 1);
        return new
        {
            available = true,
            left = bounds.Left,
            top = bounds.Top,
            width = bounds.Width,
            height = bounds.Height,
            workingArea = new
            {
                left = WorkingArea.Left,
                top = WorkingArea.Top,
                width = WorkingArea.Width,
                height = WorkingArea.Height
            },
            xPercent,
            yPercent,
            dockEdge = dockEdge.ToString().ToLowerInvariant(),
            autoHidden,
            moving,
            gliding = glideTarget.HasValue
        };
    }

    public Task GlideToAsync(string anchor, double? xPercent, double? yPercent, int durationMs)
    {
        if (handle == IntPtr.Zero || IsClosed) return Task.FromException(new InvalidOperationException("Desktop pet window is unavailable."));
        (double X, double Y) targetPercent = anchor.Trim().ToLowerInvariant() switch
        {
            "top-left" => (0, 0), "top-center" => (0.5, 0), "top-right" => (1, 0),
            "center-left" => (0, 0.5), "center" => (0.5, 0.5), "center-right" => (1, 0.5),
            "bottom-left" => (0, 1), "bottom-center" => (0.5, 1), "bottom-right" => (1, 1),
            "" when xPercent.HasValue && yPercent.HasValue => (xPercent.Value, yPercent.Value),
            _ => throw new ArgumentException("Provide a supported anchor or both xPercent and yPercent.")
        };
        Rectangle bounds = WindowBounds();
        Rectangle WorkingArea = WorkingAreaForDock(bounds);
        double clampedX = Math.Clamp(targetPercent.X, 0, 1);
        double clampedY = Math.Clamp(targetPercent.Y, 0, 1);
        Point target = new(
            WorkingArea.Left + (int)Math.Round(Math.Max(0, WorkingArea.Width - bounds.Width) * clampedX),
            WorkingArea.Top + (int)Math.Round(Math.Max(0, WorkingArea.Height - bounds.Height) * clampedY)
        );
        CancelGlide();
        if (autoHidden) SetAutoHidden(false, false);
        animationTarget = null;
        moving = false;
        dockEdge = PetDockEdge.None;
        dockWorkingArea = Rectangle.Empty;
        glideStart = bounds.Location;
        glideTarget = target;
        glideStartedAt = Environment.TickCount64;
        glideDurationMs = Math.Clamp(durationMs, 250, 1_200);
        glideCompletion = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        edgeTimer.Interval = 15;
        if (target == bounds.Location) CompleteGlide(target);
        return glideCompletion?.Task ?? Task.CompletedTask;
    }

    private void CancelGlide()
    {
        glideStart = null;
        glideTarget = null;
        glideCompletion?.TrySetCanceled();
        glideCompletion = null;
    }

    private void CompleteGlide(Point target)
    {
        SetLocation(target);
        glideStart = null;
        glideTarget = null;
        edgeTimer.Interval = 80;
        SavePosition();
        TaskCompletionSource<bool>? completion = glideCompletion;
        glideCompletion = null;
        completion?.TrySetResult(true);
    }

    private static double EaseInOutCubic(double value)
    {
        double progress = Math.Clamp(value, 0, 1);
        return progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.Pow(-2 * progress + 2, 3) / 2;
    }

    public void EndMove()
    {
        moving = false;
        animationTarget = null;
        if (!panelOpen) DockToNearestEdge();
        SavePosition();
    }

    public void SavePosition()
    {
        if (handle == IntPtr.Zero) return;
        try
        {
            Rectangle bounds = WindowBounds();
            Rectangle area = WorkingAreaForDock(bounds);
            Point persistedLocation = dockEdge == PetDockEdge.None
                ? bounds.Location
                : DockedLocation(area, false);
            using RegistryKey key = Registry.CurrentUser.CreateSubKey(PositionRegistryPath);
            key.SetValue("AnchorRight", persistedLocation.X + bounds.Width, RegistryValueKind.DWord);
            key.SetValue("AnchorBottom", persistedLocation.Y + bounds.Height, RegistryValueKind.DWord);
            key.SetValue("DockEdge", dockEdge.ToString(), RegistryValueKind.String);
            key.SetValue("DockOffset", dockOffset, RegistryValueKind.DWord);
            key.SetValue("Dpi", appliedDpi, RegistryValueKind.DWord);
        }
        catch
        {
        }
    }

    private void HandleSourceInitialized(object? sender, EventArgs e)
    {
        handle = new WpfInterop.WindowInteropHelper(this).Handle;
        source = WpfInterop.HwndSource.FromHwnd(handle);
        if (source?.CompositionTarget is not null)
        {
            source.CompositionTarget.BackgroundColor = WpfMedia.Colors.Transparent;
            source.AddHook(WindowMessageHook);
        }
        appliedDpi = Math.Max(BaseDpi, (int)GetDpiForWindow(handle));
        RestorePosition();
        ApplyDpiGeometry(appliedDpi, WindowBounds());
        UpdateInteractiveRegion();
    }

    private IntPtr WindowMessageHook(IntPtr hwnd, int message, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (message == WM_DPICHANGED)
        {
            NativeRect suggested = Marshal.PtrToStructure<NativeRect>(lParam);
            Rectangle anchor = suggested.ToRectangle();
            Dispatcher.BeginInvoke(
                WpfThreading.DispatcherPriority.Loaded,
                new Action(() => ApplyDpiGeometry(Math.Max(BaseDpi, (int)GetDpiForWindow(handle)), anchor)));
        }
        return IntPtr.Zero;
    }

    private void HandleClosing(object? sender, CancelEventArgs e) => SavePosition();

    private void HandleClosed(object? sender, EventArgs e)
    {
        IsClosed = true;
        CancelGlide();
        edgeTimer.Stop();
        edgeTimer.Tick -= HandleEdgeTimerTick;
        edgeTimer.Dispose();
        SystemEvents.DisplaySettingsChanged -= HandleDisplaySettingsChanged;
        if (source is not null)
        {
            source.RemoveHook(WindowMessageHook);
            source = null;
        }
        characterHitRegionDip.Dispose();
        Content = null;
        webView.Dispose();
        handle = IntPtr.Zero;
    }

    private static Region BuildCharacterHitRegion()
    {
        using var path = new GraphicsPath();
        path.AddEllipse(
            -MascotHaloOverscan,
            -MascotHaloOverscan,
            MascotRenderSize + MascotHaloOverscan * 2,
            MascotRenderSize + MascotHaloOverscan * 2);
        return new Region(path);
    }

    private static GraphicsPath RoundedRectangle(Rectangle bounds, int radius)
    {
        int diameter = Math.Max(2, radius * 2);
        var path = new GraphicsPath();
        path.AddArc(bounds.Left, bounds.Top, diameter, diameter, 180, 90);
        path.AddArc(bounds.Right - diameter, bounds.Top, diameter, diameter, 270, 90);
        path.AddArc(bounds.Right - diameter, bounds.Bottom - diameter, diameter, diameter, 0, 90);
        path.AddArc(bounds.Left, bounds.Bottom - diameter, diameter, diameter, 90, 90);
        path.CloseFigure();
        return path;
    }

    private void UpdateInteractiveRegion()
    {
        if (handle == IntPtr.Zero || !GetClientRect(handle, out NativeRect client)) return;
        int clientWidth = Math.Max(0, client.Right - client.Left);
        int clientHeight = Math.Max(0, client.Bottom - client.Top);
        if (clientWidth <= 0 || clientHeight <= 0) return;

        int assistantLeft = clientWidth - Dip(8) - Dip(292);
        int assistantTop = clientHeight - Dip(8) - Dip(324);
        int mascotLeft = assistantLeft + Dip(8);
        int mascotTop = assistantTop + Dip(48);
        using var next = new Region();
        next.MakeEmpty();
        using (Region character = characterHitRegionDip.Clone())
        {
            using var scale = new Matrix();
            float dpiScale = appliedDpi / (float)BaseDpi;
            scale.Scale(dpiScale, dpiScale);
            character.Transform(scale);
            character.Translate(mascotLeft, mascotTop);
            next.Union(character);
        }

        if (panelOpen)
        {
            if (!UnionCssRoundedRegion(
                    next,
                    panelBoundsCss,
                    panelViewportCss,
                    panelRadiusCss,
                    clientWidth,
                    clientHeight))
            {
                int panelWidth = Math.Min(
                    Dip(DefaultPanelHitWidth),
                    Math.Max(Dip(160), assistantLeft - Dip(16)));
                int panelHeight = Math.Min(Dip(DefaultPanelHitHeight), clientHeight);
                int panelRight = assistantLeft - Dip(8);
                int panelBottom = Math.Min(clientHeight, assistantTop + Dip(324) - Dip(12));
                var panelBounds = new Rectangle(
                    Math.Max(0, panelRight - panelWidth),
                    Math.Max(0, panelBottom - panelHeight),
                    panelWidth,
                    panelHeight);
                using GraphicsPath panelPath = RoundedRectangle(
                    panelBounds,
                    Dip(DefaultPanelHitRadius));
                next.Union(panelPath);
            }
        }
        else if (bubbleVisible && bubbleViewportCss.Width > 0 && bubbleViewportCss.Height > 0)
        {
            UnionCssRoundedRegion(
                next,
                bubbleBoundsCss,
                bubbleViewportCss,
                bubbleRadiusCss,
                clientWidth,
                clientHeight);
        }

        using Graphics graphics = Graphics.FromHwnd(handle);
        IntPtr regionHandle = next.GetHrgn(graphics);
        if (SetWindowRgn(handle, regionHandle, true) == 0) DeleteObject(regionHandle);
    }

    private static bool UnionCssRoundedRegion(
        Region target,
        RectangleF boundsCss,
        SizeF viewportCss,
        float radiusCss,
        int clientWidth,
        int clientHeight)
    {
        if (boundsCss.Width <= 0
            || boundsCss.Height <= 0
            || viewportCss.Width <= 0
            || viewportCss.Height <= 0)
        {
            return false;
        }

        float scaleX = clientWidth / viewportCss.Width;
        float scaleY = clientHeight / viewportCss.Height;
        var bounds = Rectangle.FromLTRB(
            Math.Max(0, (int)Math.Floor(boundsCss.Left * scaleX)),
            Math.Max(0, (int)Math.Floor(boundsCss.Top * scaleY)),
            Math.Min(clientWidth, (int)Math.Ceiling(boundsCss.Right * scaleX)),
            Math.Min(clientHeight, (int)Math.Ceiling(boundsCss.Bottom * scaleY)));
        if (bounds.Width <= 0 || bounds.Height <= 0) return false;

        int radius = Math.Min(
            Math.Min(bounds.Width, bounds.Height) / 2,
            Math.Max(1, (int)Math.Round(radiusCss * Math.Min(scaleX, scaleY))));
        using GraphicsPath path = RoundedRectangle(bounds, radius);
        target.Union(path);
        return true;
    }

    private int Dip(int value)
    {
        return Math.Max(1, (int)Math.Round(value * appliedDpi / (double)BaseDpi));
    }

    private Rectangle WindowBounds()
    {
        return handle != IntPtr.Zero && GetWindowRect(handle, out NativeRect bounds)
            ? bounds.ToRectangle()
            : Rectangle.Empty;
    }

    private void SetBounds(Rectangle bounds)
    {
        if (handle == IntPtr.Zero || bounds.Width <= 0 || bounds.Height <= 0) return;
        double dpiScale = Math.Max(1d, appliedDpi / (double)BaseDpi);
        // SetWindowPos alone changes the HWND but can leave WPF's measure pass at
        // the previous (for example 720x660 panel) size. Keep the logical visual
        // viewport in lockstep so the closed pet and its hit target never remain
        // laid out off-screen after the panel contracts.
        Width = bounds.Width / dpiScale;
        Height = bounds.Height / dpiScale;
        SetWindowPos(handle, IntPtr.Zero, bounds.Left, bounds.Top, bounds.Width, bounds.Height,
            SWP_NOZORDER | SWP_NOACTIVATE);
        UpdateInteractiveRegion();
    }

    private void SetLocation(Point location)
    {
        Rectangle bounds = WindowBounds();
        if (bounds.IsEmpty) return;
        SetBounds(new Rectangle(location, bounds.Size));
    }

    private void ApplyDpiGeometry(int dpi, Rectangle anchorBounds)
    {
        if (handle == IntPtr.Zero) return;
        dpi = Math.Max(BaseDpi, dpi);
        int previousDpi = Math.Max(BaseDpi, appliedDpi);
        if (preserveLegacyDockOffsetOnFirstDpiApply)
        {
            preserveLegacyDockOffsetOnFirstDpiApply = false;
        }
        else if (dpi != previousDpi)
        {
            dockOffset = (int)Math.Round(dockOffset * dpi / (double)previousDpi);
        }
        appliedDpi = dpi;

        int anchorRight = anchorBounds.Right;
        int anchorBottom = anchorBounds.Bottom;
        int width = Dip(panelOpen ? PanelWidth : ClosedWidth);
        int height = Dip(panelOpen ? PanelHeight : ClosedHeight);
        Rectangle area = Forms.Screen.FromPoint(new Point(
            Math.Max(anchorBounds.Left, anchorRight - 1),
            Math.Max(anchorBounds.Top, anchorBottom - 1))).WorkingArea;
        Point location = dockEdge != PetDockEdge.None
            ? DockedLocation(area, autoHidden, width, height)
            : new Point(anchorRight - width, anchorBottom - height);
        SetBounds(new Rectangle(location, new Size(width, height)));
        ClampToVisibleScreen();
    }

    private void RestorePosition()
    {
        int right = 0;
        int bottom = 0;
        int savedDpi = BaseDpi;
        string savedDockEdge = "";
        try
        {
            using RegistryKey? key = Registry.CurrentUser.OpenSubKey(PositionRegistryPath);
            right = key?.GetValue("AnchorRight") is int savedRight ? savedRight : 0;
            bottom = key?.GetValue("AnchorBottom") is int savedBottom ? savedBottom : 0;
            savedDockEdge = key?.GetValue("DockEdge") as string ?? "";
            dockOffset = key?.GetValue("DockOffset") is int savedOffset ? savedOffset : 0;
            if (key?.GetValue("Dpi") is int storedDpi && storedDpi >= BaseDpi)
            {
                savedDpi = storedDpi;
            }
            else
            {
                preserveLegacyDockOffsetOnFirstDpiApply = true;
            }
        }
        catch
        {
        }

        Rectangle primary = Forms.Screen.PrimaryScreen?.WorkingArea ?? Forms.SystemInformation.WorkingArea;
        if (right == 0 || bottom == 0)
        {
            right = primary.Right - Dip(EdgeMargin);
            bottom = primary.Bottom - Dip(EdgeMargin);
        }
        Rectangle area = Forms.Screen.FromPoint(new Point(right - 1, bottom - 1)).WorkingArea;
        right = Math.Max(area.Left + Dip(56), Math.Min(right, area.Right - Dip(EdgeMargin)));
        bottom = Math.Max(area.Top + Dip(56), Math.Min(bottom, area.Bottom - Dip(EdgeMargin)));
        dockOffset = (int)Math.Round(dockOffset * (double)appliedDpi / savedDpi);
        Rectangle current = WindowBounds();
        SetBounds(new Rectangle(right - current.Width, bottom - current.Height, current.Width, current.Height));
        if (Enum.TryParse(savedDockEdge, true, out PetDockEdge restoredEdge)
            && restoredEdge != PetDockEdge.None)
        {
            dockEdge = restoredEdge;
            dockWorkingArea = area;
            SetLocation(DockedLocation(area, false));
            autoHidden = false;
        }
    }

    private void ClampToVisibleScreen()
    {
        if (handle == IntPtr.Zero) return;
        Rectangle bounds = WindowBounds();
        Rectangle area = WorkingAreaForDock(bounds);
        if (dockEdge != PetDockEdge.None)
        {
            SetLocation(DockedLocation(area, autoHidden));
            return;
        }
        int minimumVisible = Dip(56);
        int left = Math.Max(area.Left - bounds.Width + minimumVisible,
            Math.Min(bounds.Left, area.Right - minimumVisible));
        int top = Math.Max(area.Top - bounds.Height + minimumVisible,
            Math.Min(bounds.Top, area.Bottom - minimumVisible));
        SetLocation(new Point(left, top));
    }

    private void DockToNearestEdge()
    {
        Rectangle bounds = WindowBounds();
        Rectangle area = Forms.Screen.FromRectangle(bounds).WorkingArea;
        var candidates = new (PetDockEdge Edge, int Distance)[]
        {
            (PetDockEdge.Left, bounds.Left <= area.Left ? 0 : bounds.Left - area.Left),
            (PetDockEdge.Right, bounds.Right >= area.Right ? 0 : area.Right - bounds.Right),
            (PetDockEdge.Top, bounds.Top <= area.Top ? 0 : bounds.Top - area.Top),
            (PetDockEdge.Bottom, bounds.Bottom >= area.Bottom ? 0 : area.Bottom - bounds.Bottom)
        };
        (PetDockEdge Edge, int Distance) nearest = candidates.OrderBy(item => item.Distance).First();
        if (nearest.Distance > Dip(EdgeSnapDistance))
        {
            dockEdge = PetDockEdge.None;
            dockWorkingArea = Rectangle.Empty;
            autoHidden = false;
            return;
        }

        dockEdge = nearest.Edge;
        dockWorkingArea = area;
        dockOffset = dockEdge is PetDockEdge.Left or PetDockEdge.Right
            ? Math.Max(0, Math.Min(bounds.Top - area.Top, Math.Max(0, area.Height - bounds.Height)))
            : Math.Max(0, Math.Min(bounds.Left - area.Left, Math.Max(0, area.Width - bounds.Width)));
        autoHidden = false;
        animationTarget = DockedLocation(area, false);
        pointerOutsideSince = Environment.TickCount64 + 700;
        edgeTimer.Interval = 15;
    }

    private Point DockedLocation(Rectangle area, bool hidden)
    {
        Rectangle bounds = WindowBounds();
        return DockedLocation(area, hidden, bounds.Width, bounds.Height);
    }

    private Point DockedLocation(Rectangle area, bool hidden, int width, int height)
    {
        int verticalOffset = Math.Max(0, Math.Min(dockOffset, Math.Max(0, area.Height - height)));
        int horizontalOffset = Math.Max(0, Math.Min(dockOffset, Math.Max(0, area.Width - width)));
        return dockEdge switch
        {
            PetDockEdge.Left => new Point(hidden ? area.Left - width + Dip(EdgeRevealSize) : area.Left,
                area.Top + verticalOffset),
            PetDockEdge.Right => new Point(hidden ? area.Right - Dip(EdgeRevealSize) : area.Right - width,
                area.Top + verticalOffset),
            PetDockEdge.Top => new Point(area.Left + horizontalOffset,
                hidden ? area.Top - height + Dip(EdgeRevealSize) : area.Top),
            PetDockEdge.Bottom => new Point(area.Left + horizontalOffset,
                hidden ? area.Bottom - Dip(EdgeRevealSize) : area.Bottom - height),
            _ => WindowBounds().Location
        };
    }

    private bool CursorNearDockEdge(Point cursor, Rectangle area)
    {
        if (dockEdge == PetDockEdge.None) return false;
        Rectangle bounds = WindowBounds();
        Point revealed = DockedLocation(area, false);
        return dockEdge switch
        {
            PetDockEdge.Left => Math.Abs(cursor.X - area.Left) <= Dip(EdgeRevealProximity)
                && cursor.Y >= revealed.Y - Dip(EdgeRevealProximity)
                && cursor.Y <= revealed.Y + bounds.Height + Dip(EdgeRevealProximity),
            PetDockEdge.Right => Math.Abs(cursor.X - area.Right) <= Dip(EdgeRevealProximity)
                && cursor.Y >= revealed.Y - Dip(EdgeRevealProximity)
                && cursor.Y <= revealed.Y + bounds.Height + Dip(EdgeRevealProximity),
            PetDockEdge.Top => Math.Abs(cursor.Y - area.Top) <= Dip(EdgeRevealProximity)
                && cursor.X >= revealed.X - Dip(EdgeRevealProximity)
                && cursor.X <= revealed.X + bounds.Width + Dip(EdgeRevealProximity),
            PetDockEdge.Bottom => Math.Abs(cursor.Y - area.Bottom) <= Dip(EdgeRevealProximity)
                && cursor.X >= revealed.X - Dip(EdgeRevealProximity)
                && cursor.X <= revealed.X + bounds.Width + Dip(EdgeRevealProximity),
            _ => false
        };
    }

    private void SetAutoHidden(bool hidden, bool animate)
    {
        if (dockEdge == PetDockEdge.None) return;
        Rectangle area = WorkingAreaForDock(WindowBounds());
        bool stateChanged = autoHidden != hidden;
        autoHidden = hidden;
        if (stateChanged) NotifyEdgeState(hidden);
        Point target = DockedLocation(area, hidden);
        if (!animate)
        {
            animationTarget = null;
            SetLocation(target);
            edgeTimer.Interval = 80;
            return;
        }
        animationTarget = target;
        edgeTimer.Interval = 15;
    }

    private void NotifyEdgeState(bool hidden)
    {
        if (webView.CoreWebView2 is null) return;
        string value = hidden ? "true" : "false";
        _ = webView.CoreWebView2.ExecuteScriptAsync(
            "window.dispatchEvent(new CustomEvent('fe-monster-pet-edge-state', { detail: { hidden: "
            + value
            + " } }));");
    }

    private void HandleEdgeTimerTick(object? sender, EventArgs e)
    {
        Rectangle bounds = WindowBounds();
        if (glideStart is Point start && glideTarget is Point glideDestination)
        {
            double elapsed = Math.Max(0, Environment.TickCount64 - glideStartedAt);
            double progress = Math.Clamp(elapsed / Math.Max(1, glideDurationMs), 0, 1);
            double eased = EaseInOutCubic(progress);
            Point next = new(
                (int)Math.Round(start.X + (glideDestination.X - start.X) * eased),
                (int)Math.Round(start.Y + (glideDestination.Y - start.Y) * eased)
            );
            SetLocation(next);
            if (progress >= 1) CompleteGlide(glideDestination);
            return;
        }
        if (animationTarget is Point target)
        {
            int dx = target.X - bounds.Left;
            int dy = target.Y - bounds.Top;
            if (Math.Abs(dx) <= 1 && Math.Abs(dy) <= 1)
            {
                SetLocation(target);
                animationTarget = null;
                edgeTimer.Interval = 80;
            }
            else
            {
                int stepX = dx == 0 ? 0 : Math.Sign(dx) * Math.Max(1, (int)Math.Ceiling(Math.Abs(dx) * 0.24));
                int stepY = dy == 0 ? 0 : Math.Sign(dy) * Math.Max(1, (int)Math.Ceiling(Math.Abs(dy) * 0.24));
                SetLocation(new Point(bounds.Left + stepX, bounds.Top + stepY));
            }
        }

        if (!IsVisible || panelOpen || moving || dockEdge == PetDockEdge.None) return;
        bounds = WindowBounds();
        Rectangle area = WorkingAreaForDock(bounds);
        Point cursor = Forms.Cursor.Position;
        bool nearEdge = CursorNearDockEdge(cursor, area);
        if (autoHidden)
        {
            if (nearEdge) SetAutoHidden(false, true);
            return;
        }
        if (bounds.Contains(cursor) || nearEdge)
        {
            pointerOutsideSince = 0;
            return;
        }
        if (pointerOutsideSince <= 0) pointerOutsideSince = Environment.TickCount64;
        if (Environment.TickCount64 - pointerOutsideSince >= EdgeHideDelayMs)
        {
            pointerOutsideSince = 0;
            SetAutoHidden(true, true);
        }
    }

    private void HandleDisplaySettingsChanged(object? sender, EventArgs e)
    {
        if (IsClosed) return;
        Dispatcher.BeginInvoke(new Action(() =>
        {
            if (dockEdge != PetDockEdge.None)
            {
                Point monitorAnchor = dockWorkingArea.IsEmpty
                    ? WindowBounds().Location
                    : new Point(
                        dockWorkingArea.Left + dockWorkingArea.Width / 2,
                        dockWorkingArea.Top + dockWorkingArea.Height / 2);
                dockWorkingArea = Forms.Screen.FromPoint(monitorAnchor).WorkingArea;
            }
            else dockWorkingArea = Rectangle.Empty;
            ClampToVisibleScreen();
        }));
    }

    private Rectangle WorkingAreaForDock(Rectangle bounds)
    {
        if (dockEdge != PetDockEdge.None && !dockWorkingArea.IsEmpty)
        {
            return dockWorkingArea;
        }
        return Forms.Screen.FromRectangle(bounds).WorkingArea;
    }

    private void HandleKeyDown(object? sender, WpfInput.KeyEventArgs e)
    {
        if (e.Key == WpfInput.Key.Escape && !panelOpen)
        {
            HideRequested?.Invoke();
            e.Handled = true;
        }
    }
}
