using System.Net;
using System.Net.Http;
using FeMonster.Client;

static HttpResponseMessage Response(HttpStatusCode status, string body, string mediaType)
{
    return new HttpResponseMessage(status)
    {
        Content = new StringContent(body, System.Text.Encoding.UTF8, mediaType)
    };
}

static async Task<BackendStartupProbeResult> Probe(
    HttpStatusCode versionStatus,
    string versionBody,
    HttpStatusCode rootStatus,
    string rootBody,
    HttpStatusCode indexStatus,
    string indexBody
)
{
    using HttpClient client = new(new FixtureHandler(request => request.RequestUri?.AbsolutePath switch
    {
        "/api/app/version" => Response(versionStatus, versionBody, "application/json"),
        "/" => Response(rootStatus, rootBody, "text/html"),
        "/index.html" => Response(indexStatus, indexBody, "text/html"),
        _ => Response(HttpStatusCode.NotFound, "missing", "text/plain")
    }));
    return await BackendStartupProbe.ProbeOnceAsync(client, new Uri("http://127.0.0.1:30123/"));
}

const string validVersion = "{\"version\":\"2.1.0\"}";
const string validIndex = "<!doctype html><title>FE Monster Java</title><section id=\"bootScreen\"></section>";

BackendStartupProbeResult falseReady = await Probe(
    HttpStatusCode.NotFound, "missing", HttpStatusCode.OK, validIndex, HttpStatusCode.OK, validIndex
);
if (falseReady.Ready || falseReady.Phase != "version-status")
    throw new InvalidOperationException("HTTP 404 version endpoint was accepted as backend-ready.");

BackendStartupProbeResult missingShell = await Probe(
    HttpStatusCode.OK, validVersion, HttpStatusCode.OK, "<html><body></body></html>",
    HttpStatusCode.OK, "<html><body></body></html>"
);
if (missingShell.Ready || missingShell.Phase != "root-marker")
    throw new InvalidOperationException("An empty app shell was accepted as backend-ready.");

BackendStartupProbeResult ready = await Probe(
    HttpStatusCode.OK, validVersion, HttpStatusCode.OK, validIndex, HttpStatusCode.OK, validIndex
);
if (!ready.Ready || ready.Phase != "ready")
    throw new InvalidOperationException($"A complete backend was rejected: {ready.Phase}");

string automatic = WebViewStartupPolicy.BrowserArguments(gpuRequested: true);
if (automatic.Contains("disable-software-rasterizer", StringComparison.OrdinalIgnoreCase)
    || automatic.Contains("force_high_performance_gpu", StringComparison.OrdinalIgnoreCase)
    || automatic.Contains("ignore-gpu-blocklist", StringComparison.OrdinalIgnoreCase))
    throw new InvalidOperationException("Automatic rendering still prevents Chromium's software fallback.");

string software = WebViewStartupPolicy.BrowserArguments(gpuRequested: false);
if (!software.Contains("--disable-gpu", StringComparison.OrdinalIgnoreCase)
    || software.Contains("disable-software-rasterizer", StringComparison.OrdinalIgnoreCase))
    throw new InvalidOperationException("Explicit software rendering is not available.");

if (WebViewStartupPolicy.NavigationAttemptCount < 4)
    throw new InvalidOperationException("Transient localhost startup failures do not receive enough bounded retries.");
if (!WebViewStartupPolicy.RequiresControllerRecreation("BrowserProcessExited")
    || !WebViewStartupPolicy.RequiresControllerRecreation("RenderProcessExited")
    || WebViewStartupPolicy.RequiresControllerRecreation("GpuProcessExited"))
    throw new InvalidOperationException("WebView process failures do not select the safe controller recovery path.");
if (WebViewStartupPolicy.RetryDelay(1) >= WebViewStartupPolicy.RetryDelay(3))
    throw new InvalidOperationException("WebView startup retries do not use bounded backoff.");

Console.WriteLine("FE Monster startup readiness and WebView fallback harness passed.");

internal sealed class FixtureHandler(Func<HttpRequestMessage, HttpResponseMessage> response)
    : HttpMessageHandler
{
    protected override Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        CancellationToken cancellationToken
    ) => Task.FromResult(response(request));
}
