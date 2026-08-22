using System.Net.Http;

namespace FeMonster.Client;

internal sealed record BackendStartupProbeResult(bool Ready, string Phase, string Detail);

internal static class BackendStartupProbe
{
    private static readonly string[] AppShellMarkers = { "FE Monster", "bootScreen" };

    public static async Task<BackendStartupProbeResult> ProbeOnceAsync(
        HttpClient client,
        Uri baseUri,
        CancellationToken cancellationToken = default
    )
    {
        BackendStartupProbeResult version = await ProbeVersionAsync(client, baseUri, cancellationToken);
        if (!version.Ready) return version;

        BackendStartupProbeResult root = await ProbeHtmlAsync(
            client,
            new Uri(baseUri, "/"),
            "root",
            cancellationToken
        );
        if (!root.Ready) return root;

        BackendStartupProbeResult index = await ProbeHtmlAsync(
            client,
            new Uri(baseUri, "/index.html"),
            "index",
            cancellationToken
        );
        return index.Ready
            ? new BackendStartupProbeResult(true, "ready", "local API and app shell are ready")
            : index;
    }

    private static async Task<BackendStartupProbeResult> ProbeVersionAsync(
        HttpClient client,
        Uri baseUri,
        CancellationToken cancellationToken
    )
    {
        using HttpResponseMessage response = await client.GetAsync(
            new Uri(baseUri, "/api/app/version"),
            HttpCompletionOption.ResponseHeadersRead,
            cancellationToken
        );
        if (!response.IsSuccessStatusCode)
        {
            return new BackendStartupProbeResult(
                false,
                "version-status",
                $"HTTP {(int)response.StatusCode}"
            );
        }
        string body = await response.Content.ReadAsStringAsync(cancellationToken);
        return body.Contains("version", StringComparison.OrdinalIgnoreCase)
            ? new BackendStartupProbeResult(true, "version", "version endpoint is ready")
            : new BackendStartupProbeResult(false, "version-body", "version payload is missing");
    }

    private static async Task<BackendStartupProbeResult> ProbeHtmlAsync(
        HttpClient client,
        Uri uri,
        string phase,
        CancellationToken cancellationToken
    )
    {
        using HttpResponseMessage response = await client.GetAsync(uri, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            return new BackendStartupProbeResult(
                false,
                phase + "-status",
                $"HTTP {(int)response.StatusCode}"
            );
        }
        string body = await response.Content.ReadAsStringAsync(cancellationToken);
        bool hasMarkers = AppShellMarkers.All(marker =>
            body.Contains(marker, StringComparison.OrdinalIgnoreCase)
        );
        return hasMarkers
            ? new BackendStartupProbeResult(true, phase, "app shell is present")
            : new BackendStartupProbeResult(false, phase + "-marker", "app shell marker is missing");
    }
}
