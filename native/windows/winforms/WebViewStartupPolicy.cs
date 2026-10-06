namespace FeMonster.Client;

internal static class WebViewStartupPolicy
{
    public const int NavigationAttemptCount = 4;

    public static string BrowserArguments(bool gpuRequested)
    {
        // Native PCM travels from an AudioWorklet through renderer IPC. When
        // its browser output is muted, Chromium does not classify that page
        // as audible, even though XAudio2 is playing it. Keep transport tasks
        // running when the main window is minimized or covered.
        const string audioTransport = " --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows";
        // Chromium's default ANGLE policy can use hardware D3D11 when available
        // and safely fall back to WARP/SwiftShader in VMs, RDP sessions, or on a
        // blocklisted adapter. Never disable the software rasterizer here.
        return gpuRequested
            ? "--use-gl=angle --use-angle=default --enable-accelerated-2d-canvas" + audioTransport
            : "--disable-gpu" + audioTransport;
    }

    public static TimeSpan RetryDelay(int failedAttempt)
    {
        return failedAttempt switch
        {
            <= 1 => TimeSpan.FromMilliseconds(300),
            2 => TimeSpan.FromMilliseconds(750),
            _ => TimeSpan.FromMilliseconds(1500)
        };
    }

    public static bool RequiresControllerRecreation(string processFailedKind)
    {
        return string.Equals(processFailedKind, "BrowserProcessExited", StringComparison.Ordinal)
            || string.Equals(processFailedKind, "RenderProcessExited", StringComparison.Ordinal)
            || string.Equals(processFailedKind, "RenderProcessUnresponsive", StringComparison.Ordinal)
            || string.Equals(processFailedKind, "UnknownProcessExited", StringComparison.Ordinal);
    }
}
