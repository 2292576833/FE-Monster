package com.femonster.mobile;

import android.Manifest;
import android.app.Activity;
import android.app.ActivityManager;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.DownloadListener;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public final class MainActivity extends Activity {
    private static final int REQUEST_FILE_CHOOSER = 1001;
    private static final int REQUEST_WEB_PERMISSIONS = 1002;
    private static final int REQUEST_DOWNLOAD_PERMISSION = 1003;
    private static final String PREFS = "fe_monster_android";
    private static final String KEY_INSTALL_ID = "install_id";
    private static final String LOCAL_APP_ORIGIN = "https://fe-monster.local/";
    private static final String BUNDLED_WEB_ROOT = "fe-monster-web/";

    private static final String ANDROID_RUNTIME_SCRIPT =
        "(() => {" +
        "if (window.__feMonsterAndroidRuntimeInstalled) return;" +
        "window.__feMonsterAndroidRuntimeInstalled = true;" +
        "document.documentElement.dataset.fePlatform = 'android';" +
        "document.documentElement.dataset.feClientSource = 'apk-bundled';" +
        "window.feMonsterPlatform = 'android';" +
        "window.feMonsterClientSource = 'apk-bundled';" +
        "const visible = (node) => !!node && !node.hidden && getComputedStyle(node).display !== 'none' && getComputedStyle(node).visibility !== 'hidden';" +
        "window.feMonsterHandleAndroidBack = window.feMonsterHandleAndroidBack || (() => {" +
        "const candidates = [...document.querySelectorAll('dialog[open], [role=dialog], .community-message-dialog, .community-profile-dialog')].filter(visible).reverse();" +
        "for (const panel of candidates) {" +
        "const close = panel.querySelector('[aria-label*=关闭], [data-close], button[id$=Close], button[id$=CloseButton]');" +
        "if (close) { close.click(); return true; }" +
        "}" +
        "const sandbox = document.getElementById('sandboxPage');" +
        "const sandboxButton = document.getElementById('sandboxModeButton');" +
        "if (visible(sandbox) && sandboxButton) { sandboxButton.click(); return true; }" +
        "const event = new CustomEvent('fe-monster-android-back', { cancelable: true });" +
        "return !window.dispatchEvent(event);" +
        "});" +
        "const toBase64 = (blob) => new Promise((resolve, reject) => {" +
        "const reader = new FileReader();" +
        "reader.onerror = () => reject(reader.error || new Error('read failed'));" +
        "reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');" +
        "reader.readAsDataURL(blob);" +
        "});" +
        "const waitForStoragePermission = () => new Promise((resolve, reject) => {" +
        "let timer = 0;" +
        "const cleanup = () => { clearTimeout(timer); window.removeEventListener('fe-monster-android-storage-ready', onReady); window.removeEventListener('fe-monster-android-storage-denied', onDenied); };" +
        "const onReady = () => { cleanup(); resolve(); };" +
        "const onDenied = () => { cleanup(); reject(new Error('Android storage permission was denied')); };" +
        "window.addEventListener('fe-monster-android-storage-ready', onReady, { once: true });" +
        "window.addEventListener('fe-monster-android-storage-denied', onDenied, { once: true });" +
        "timer = setTimeout(() => { cleanup(); reject(new Error('Android storage permission timed out')); }, 30000);" +
        "});" +
        "window.feMonsterAndroidSaveBlob = async (blob, name) => {" +
        "const downloadName = name || 'fe-monster-download';" +
        "let id = window.FeMonsterAndroid.beginDownload(downloadName, blob.type || 'application/octet-stream');" +
        "if (!id) { await waitForStoragePermission(); id = window.FeMonsterAndroid.beginDownload(downloadName, blob.type || 'application/octet-stream'); }" +
        "if (!id) throw new Error('Android download storage is unavailable');" +
        "try {" +
        "const chunkSize = 384 * 1024;" +
        "for (let offset = 0; offset < blob.size; offset += chunkSize) {" +
        "const encoded = await toBase64(blob.slice(offset, Math.min(offset + chunkSize, blob.size)));" +
        "if (!window.FeMonsterAndroid.appendDownload(id, encoded)) throw new Error('Android download write failed');" +
        "}" +
        "window.FeMonsterAndroid.finishDownload(id);" +
        "} catch (error) { window.FeMonsterAndroid.cancelDownload(id); throw error; }" +
        "};" +
        "document.addEventListener('click', async (event) => {" +
        "const anchor = event.target && event.target.closest ? event.target.closest('a[download]') : null;" +
        "if (!anchor) return;" +
        "const href = anchor.href || '';" +
        "if (!href.startsWith('blob:') && !href.startsWith('data:')) return;" +
        "event.preventDefault();" +
        "try { const response = await fetch(href); await window.feMonsterAndroidSaveBlob(await response.blob(), anchor.download); }" +
        "catch (error) { window.FeMonsterAndroid.showMessage('下载失败：' + (error.message || error)); }" +
        "}, true);" +
        "window.dispatchEvent(new CustomEvent('fe-monster-platform-ready', { detail: { platform: 'android' } }));" +
        "})();";

    private final Map<String, BlobDownload> blobDownloads = new ConcurrentHashMap<>();
    private FrameLayout root;
    private WebView webView;
    private ValueCallback<Uri[]> fileChooserCallback;
    private PermissionRequest pendingPermissionRequest;
    private PendingHttpDownload pendingHttpDownload;
    private boolean backDispatchPending;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            getWindow().setStatusBarColor(Color.rgb(5, 5, 9));
            getWindow().setNavigationBarColor(Color.rgb(5, 5, 9));
        }

        root = new FrameLayout(this);
        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        setContentView(root);
        applyImmersiveMode();
        configureWebView();
        loadBundledClient();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
        applyImmersiveMode();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) applyImmersiveMode();
    }

    @Override
    protected void onPause() {
        if (webView != null) webView.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (fileChooserCallback != null) {
            fileChooserCallback.onReceiveValue(null);
            fileChooserCallback = null;
        }
        for (String id : new ArrayList<>(blobDownloads.keySet())) cancelBlobDownload(id);
        if (webView != null) {
            webView.stopLoading();
            webView.removeJavascriptInterface("FeMonsterAndroid");
            webView.destroy();
        }
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (customView != null) {
            hideCustomView();
            return;
        }
        if (webView == null || backDispatchPending) return;

        backDispatchPending = true;
        webView.evaluateJavascript(
            "Boolean(window.feMonsterHandleAndroidBack && window.feMonsterHandleAndroidBack())",
            value -> {
                backDispatchPending = false;
                if ("true".equals(value)) return;
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                } else {
                    MainActivity.super.onBackPressed();
                }
            }
        );
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQUEST_FILE_CHOOSER || fileChooserCallback == null) return;

        Uri[] results = null;
        if (resultCode == RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                int count = data.getClipData().getItemCount();
                results = new Uri[count];
                for (int index = 0; index < count; index += 1) {
                    results[index] = data.getClipData().getItemAt(index).getUri();
                }
            } else if (data.getData() != null) {
                results = new Uri[]{ data.getData() };
            }
        }

        fileChooserCallback.onReceiveValue(results);
        fileChooserCallback = null;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_WEB_PERMISSIONS && pendingPermissionRequest != null) {
            boolean allGranted = grantResults.length > 0;
            for (int result : grantResults) {
                if (result != PackageManager.PERMISSION_GRANTED) {
                    allGranted = false;
                    break;
                }
            }
            if (allGranted) {
                pendingPermissionRequest.grant(pendingPermissionRequest.getResources());
            } else {
                pendingPermissionRequest.deny();
            }
            pendingPermissionRequest = null;
            return;
        }

        if (requestCode == REQUEST_DOWNLOAD_PERMISSION) {
            PendingHttpDownload download = pendingHttpDownload;
            pendingHttpDownload = null;
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            if (download != null && granted) {
                enqueueHttpDownload(download);
            } else if (download != null) {
                Toast.makeText(this, "未授予存储权限，无法下载文件", Toast.LENGTH_LONG).show();
            }
            dispatchStoragePermissionResult(granted);
        }
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setLoadWithOverviewMode(false);
        settings.setUseWideViewPort(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        }

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cookieManager.setAcceptThirdPartyCookies(webView, true);
        }

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true);
        }
        webView.setBackgroundColor(Color.rgb(5, 5, 9));
        webView.addJavascriptInterface(new AndroidBridge(), "FeMonsterAndroid");
        webView.setWebViewClient(new FeMonsterWebViewClient());
        webView.setWebChromeClient(new FeMonsterChromeClient());
        webView.setDownloadListener(createDownloadListener());
    }

    private DownloadListener createDownloadListener() {
        return (url, userAgent, contentDisposition, mimeType, contentLength) -> {
            if (url == null || url.startsWith("blob:") || url.startsWith("data:")) return;
            PendingHttpDownload download = new PendingHttpDownload(url, userAgent, contentDisposition, mimeType);
            if (requiresLegacyStoragePermission() && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                pendingHttpDownload = download;
                requestPermissions(new String[]{ Manifest.permission.WRITE_EXTERNAL_STORAGE }, REQUEST_DOWNLOAD_PERMISSION);
                return;
            }
            enqueueHttpDownload(download);
        };
    }

    private void enqueueHttpDownload(PendingHttpDownload download) {
        try {
            String fileName = sanitizeFileName(URLUtil.guessFileName(download.url, download.contentDisposition, download.mimeType));
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(download.url));
            String resolvedMime = download.mimeType == null || download.mimeType.trim().isEmpty()
                ? MimeTypeMap.getSingleton().getMimeTypeFromExtension(MimeTypeMap.getFileExtensionFromUrl(download.url))
                : download.mimeType;
            if (resolvedMime != null) request.setMimeType(resolvedMime);
            if (download.userAgent != null && !download.userAgent.isEmpty()) request.addRequestHeader("User-Agent", download.userAgent);
            String cookies = CookieManager.getInstance().getCookie(download.url);
            if (cookies != null && !cookies.isEmpty()) request.addRequestHeader("Cookie", cookies);
            String referer = webView == null ? null : webView.getUrl();
            if (referer != null && !referer.isEmpty()) request.addRequestHeader("Referer", referer);
            request.setTitle(fileName);
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "FE Monster/" + fileName);
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) request.allowScanningByMediaScanner();
            DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            if (manager == null) throw new IllegalStateException("系统下载服务不可用");
            manager.enqueue(request);
            Toast.makeText(this, "已开始下载：" + fileName, Toast.LENGTH_SHORT).show();
        } catch (Exception error) {
            Toast.makeText(this, "下载失败：" + safeMessage(error), Toast.LENGTH_LONG).show();
        }
    }

    private boolean requiresLegacyStoragePermission() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && Build.VERSION.SDK_INT <= Build.VERSION_CODES.P;
    }

    private void loadBundledClient() {
        if (webView == null) return;
        try {
            String html = readBundledTextAsset(BUNDLED_WEB_ROOT + "index.html");
            webView.loadDataWithBaseURL(LOCAL_APP_ORIGIN, html, "text/html", "UTF-8", LOCAL_APP_ORIGIN);
        } catch (IOException error) {
            Toast.makeText(this, "无法读取内置客户端：" + safeMessage(error), Toast.LENGTH_LONG).show();
        }
    }

    private String readBundledTextAsset(String assetPath) throws IOException {
        try (InputStream input = getAssets().open(assetPath);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[16 * 1024];
            int count;
            while ((count = input.read(buffer)) >= 0) {
                if (count > 0) output.write(buffer, 0, count);
            }
            return new String(output.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private boolean isLocalAppUri(Uri uri) {
        Uri localUri = Uri.parse(LOCAL_APP_ORIGIN);
        if (uri == null) return false;
        return equalsIgnoreCase(uri.getScheme(), localUri.getScheme())
            && equalsIgnoreCase(uri.getHost(), localUri.getHost())
            && effectivePort(uri) == effectivePort(localUri);
    }

    private int effectivePort(Uri uri) {
        if (uri.getPort() >= 0) return uri.getPort();
        return "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80;
    }

    private boolean equalsIgnoreCase(String left, String right) {
        return left != null && right != null && left.equalsIgnoreCase(right);
    }

    private SharedPreferences getPrefs() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    private synchronized String getInstallId() {
        SharedPreferences preferences = getPrefs();
        String id = preferences.getString(KEY_INSTALL_ID, "");
        if (id != null && !id.isEmpty()) return id;
        id = UUID.randomUUID().toString();
        preferences.edit().putString(KEY_INSTALL_ID, id).apply();
        return id;
    }

    private String getAndroidPerformanceTier() {
        ActivityManager manager = (ActivityManager) getSystemService(ACTIVITY_SERVICE);
        int memoryClass = manager == null ? 256 : manager.getMemoryClass();
        boolean lowRam = manager != null && manager.isLowRamDevice();
        int cores = Math.max(1, Runtime.getRuntime().availableProcessors());
        if (lowRam || memoryClass <= 192 || (memoryClass <= 256 && cores <= 4)) return "low";
        if (memoryClass >= 512 && cores >= 8) return "high";
        return "balanced";
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }

    private void applyImmersiveMode() {
        Window window = getWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false);
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
            return;
        }
        window.getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        );
    }

    private void dispatchStoragePermissionResult(boolean granted) {
        if (webView == null) return;
        String eventName = granted
            ? "fe-monster-android-storage-ready"
            : "fe-monster-android-storage-denied";
        webView.evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('" + eventName + "'))",
            null
        );
    }

    private void showCustomView(View view, WebChromeClient.CustomViewCallback callback) {
        if (customView != null) {
            callback.onCustomViewHidden();
            return;
        }
        customView = view;
        customViewCallback = callback;
        root.addView(view, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        webView.setVisibility(View.GONE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
    }

    private void hideCustomView() {
        if (customView == null) return;
        root.removeView(customView);
        customView = null;
        webView.setVisibility(View.VISIBLE);
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        applyImmersiveMode();
        if (customViewCallback != null) customViewCallback.onCustomViewHidden();
        customViewCallback = null;
    }

    private final class FeMonsterWebViewClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            if (request == null) return null;
            WebResourceResponse bundled = bundledWebResponse(request.getUrl(), request.getMethod());
            return bundled != null ? bundled : super.shouldInterceptRequest(view, request);
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request == null ? null : request.getUrl();
            if (uri == null) return false;
            if (!request.isForMainFrame()) return false;
            if (isLocalAppUri(uri)) {
                view.post(MainActivity.this::loadBundledClient);
                return true;
            }
            openExternal(uri);
            return true;
        }

        @Override
        @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            if (url == null) return false;
            Uri uri = Uri.parse(url);
            if (isLocalAppUri(uri)) {
                view.post(MainActivity.this::loadBundledClient);
                return true;
            }
            openExternal(uri);
            return true;
        }

        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            super.onPageStarted(view, url, favicon);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            if (isLocalAppUri(Uri.parse(url))) {
                view.evaluateJavascript(ANDROID_RUNTIME_SCRIPT, null);
            }
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            super.onReceivedError(view, request, error);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && request != null && request.isForMainFrame()) {
                Uri failedUri = request.getUrl();
                if (isLocalAppUri(failedUri)) {
                    view.post(MainActivity.this::loadBundledClient);
                }
            }
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            if (customView != null) hideCustomView();
            if (root != null && view != null) root.removeView(view);
            if (view != null) {
                view.removeJavascriptInterface("FeMonsterAndroid");
                view.destroy();
            }
            if (webView == view && root != null) {
                webView = new WebView(MainActivity.this);
                root.addView(webView, 0, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                ));
                configureWebView();
            }
            boolean rendererCrashed = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && detail != null
                && detail.didCrash();
            String reason = rendererCrashed
                ? "渲染进程异常退出，已自动恢复内置客户端。"
                : "设备释放了渲染进程，已自动恢复内置客户端。";
            loadBundledClient();
            Toast.makeText(MainActivity.this, reason, Toast.LENGTH_LONG).show();
            return true;
        }
    }

    private WebResourceResponse bundledWebResponse(Uri uri, String method) {
        if (uri == null || !"GET".equalsIgnoreCase(method) || !isLocalAppUri(uri)) return null;
        String path = uri.getPath() == null ? "/" : Uri.decode(uri.getPath());
        if (path.startsWith("/api/") || "/api".equals(path) || path.startsWith("/health")) {
            return localApiFallbackResponse(path);
        }
        if (path.contains("..") || path.indexOf('\\') >= 0 || path.indexOf('\0') >= 0) return null;

        String relativePath = "/".equals(path) || path.isEmpty() ? "index.html" : path.substring(1);
        try {
            InputStream stream = getAssets().open(BUNDLED_WEB_ROOT + relativePath);
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-store, max-age=0");
            headers.put("X-FE-Client-Source", "apk-bundled");
            return new WebResourceResponse(
                bundledMimeType(relativePath),
                bundledTextEncoding(relativePath),
                200,
                "OK",
                headers,
                stream
            );
        } catch (IOException ignored) {
            return null;
        }
    }

    private WebResourceResponse localApiFallbackResponse(String path) {
        boolean health = path != null && path.startsWith("/health");
        String body = health
            ? "{\"ok\":true,\"mode\":\"android-local\",\"serverRequired\":false}"
            : "{\"ok\":false,\"mode\":\"android-local\",\"error\":\"Android local runtime is starting\"}";
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-store, max-age=0");
        headers.put("X-FE-Runtime", "android-local");
        return new WebResourceResponse(
            "application/json",
            "UTF-8",
            health ? 200 : 503,
            health ? "OK" : "Service Unavailable",
            headers,
            new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8))
        );
    }

    private String bundledMimeType(String path) {
        String lower = path.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "application/javascript";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".html")) return "text/html";
        if (lower.endsWith(".json")) return "application/json";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".glb")) return "model/gltf-binary";
        if (lower.endsWith(".bin")) return "application/octet-stream";
        if (lower.endsWith(".woff2")) return "font/woff2";
        String extension = MimeTypeMap.getFileExtensionFromUrl(path);
        String detected = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
        return detected == null ? "application/octet-stream" : detected;
    }

    private String bundledTextEncoding(String path) {
        String lower = path.toLowerCase(Locale.ROOT);
        return lower.endsWith(".html") || lower.endsWith(".css") || lower.endsWith(".js") ||
            lower.endsWith(".mjs") || lower.endsWith(".json") || lower.endsWith(".svg") ? "UTF-8" : null;
    }

    private final class FeMonsterChromeClient extends WebChromeClient {
        @Override
        public void onPermissionRequest(PermissionRequest request) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) return;
            if (!isLocalAppUri(request.getOrigin())) {
                request.deny();
                return;
            }
            String[] permissions = permissionsForRequest(request);
            if (permissions.length == 0 || hasPermissions(permissions)) {
                request.grant(request.getResources());
                return;
            }
            if (pendingPermissionRequest != null) pendingPermissionRequest.deny();
            pendingPermissionRequest = request;
            requestPermissions(permissions, REQUEST_WEB_PERMISSIONS);
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);
            fileChooserCallback = callback;

            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            String[] acceptTypes = resolveChooserMimeTypes(params);
            intent.setType(acceptTypes.length == 1 ? acceptTypes[0] : "*/*");
            if (acceptTypes.length > 1) intent.putExtra(Intent.EXTRA_MIME_TYPES, acceptTypes);
            intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP
                    && params != null
                    && params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE
            );

            try {
                startActivityForResult(Intent.createChooser(intent, "选择文件"), REQUEST_FILE_CHOOSER);
            } catch (ActivityNotFoundException error) {
                fileChooserCallback.onReceiveValue(null);
                fileChooserCallback = null;
                return false;
            }
            return true;
        }

        @Override
        public void onShowCustomView(View view, CustomViewCallback callback) {
            showCustomView(view, callback);
        }

        @Override
        public void onHideCustomView() {
            hideCustomView();
        }
    }

    private String[] resolveChooserMimeTypes(WebChromeClient.FileChooserParams params) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP || params == null || params.getAcceptTypes() == null) {
            return new String[]{ "*/*" };
        }
        List<String> types = new ArrayList<>();
        for (String raw : params.getAcceptTypes()) {
            if (raw == null) continue;
            for (String value : raw.split(",")) {
                String type = value.trim();
                if (!type.isEmpty() && type.contains("/")) types.add(type);
            }
        }
        return types.isEmpty() ? new String[]{ "*/*" } : types.toArray(new String[0]);
    }

    private String[] permissionsForRequest(PermissionRequest request) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP || request == null) return new String[0];
        List<String> permissions = new ArrayList<>();
        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) permissions.add(Manifest.permission.CAMERA);
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) permissions.add(Manifest.permission.RECORD_AUDIO);
        }
        return permissions.toArray(new String[0]);
    }

    private boolean hasPermissions(String[] permissions) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        for (String permission : permissions) {
            if (checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) return false;
        }
        return true;
    }

    private void openExternal(Uri uri) {
        try {
            if ("intent".equalsIgnoreCase(uri.getScheme())) {
                Intent intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
                startActivity(intent);
            } else {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            }
        } catch (Exception ignored) {
            Toast.makeText(this, "无法打开外部链接", Toast.LENGTH_SHORT).show();
        }
    }

    private String beginBlobDownload(String requestedName, String mimeType) {
        if (requiresLegacyStoragePermission() && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            runOnUiThread(() -> requestPermissions(
                new String[]{ Manifest.permission.WRITE_EXTERNAL_STORAGE },
                REQUEST_DOWNLOAD_PERMISSION
            ));
            return "";
        }
        String id = UUID.randomUUID().toString();
        String name = sanitizeFileName(requestedName);
        String type = mimeType == null || mimeType.trim().isEmpty() ? "application/octet-stream" : mimeType;
        try {
            BlobDownload download;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, name);
                values.put(MediaStore.Downloads.MIME_TYPE, type);
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/FE Monster");
                values.put(MediaStore.Downloads.IS_PENDING, 1);
                Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new IOException("无法创建下载文件");
                OutputStream stream = getContentResolver().openOutputStream(uri, "w");
                if (stream == null) {
                    getContentResolver().delete(uri, null, null);
                    throw new IOException("无法写入下载文件");
                }
                download = new BlobDownload(name, uri, null, stream);
            } else {
                File directory = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "FE Monster");
                if (!directory.exists() && !directory.mkdirs()) throw new IOException("无法创建下载目录");
                File file = uniqueFile(directory, name);
                download = new BlobDownload(file.getName(), null, file, new FileOutputStream(file));
            }
            blobDownloads.put(id, download);
            return id;
        } catch (Exception error) {
            runOnUiThread(() -> Toast.makeText(this, "下载失败：" + safeMessage(error), Toast.LENGTH_LONG).show());
            return "";
        }
    }

    private boolean appendBlobDownload(String id, String encodedChunk) {
        BlobDownload download = blobDownloads.get(id);
        if (download == null || encodedChunk == null) return false;
        try {
            byte[] bytes = Base64.decode(encodedChunk, Base64.DEFAULT);
            synchronized (download) {
                download.stream.write(bytes);
            }
            return true;
        } catch (Exception error) {
            cancelBlobDownload(id);
            return false;
        }
    }

    private void finishBlobDownload(String id) {
        BlobDownload download = blobDownloads.remove(id);
        if (download == null) return;
        try {
            synchronized (download) {
                download.stream.flush();
                download.stream.close();
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && download.uri != null) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.IS_PENDING, 0);
                getContentResolver().update(download.uri, values, null, null);
            }
            runOnUiThread(() -> Toast.makeText(this, "已保存到下载目录：" + download.name, Toast.LENGTH_LONG).show());
        } catch (Exception error) {
            deleteBlobDownload(download);
            runOnUiThread(() -> Toast.makeText(this, "下载失败：" + safeMessage(error), Toast.LENGTH_LONG).show());
        }
    }

    private void cancelBlobDownload(String id) {
        BlobDownload download = blobDownloads.remove(id);
        if (download == null) return;
        try {
            synchronized (download) {
                download.stream.close();
            }
        } catch (IOException ignored) {
        }
        deleteBlobDownload(download);
    }

    private void deleteBlobDownload(BlobDownload download) {
        if (download.uri != null) {
            getContentResolver().delete(download.uri, null, null);
        } else if (download.file != null && download.file.exists()) {
            download.file.delete();
        }
    }

    private String sanitizeFileName(String value) {
        String name = value == null ? "" : value.trim();
        name = name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_");
        while (name.startsWith(".")) name = name.substring(1);
        if (name.isEmpty()) name = "fe-monster-download";
        return name.length() > 120 ? name.substring(0, 120) : name;
    }

    private File uniqueFile(File directory, String name) {
        File candidate = new File(directory, name);
        if (!candidate.exists()) return candidate;
        int dot = name.lastIndexOf('.');
        String base = dot > 0 ? name.substring(0, dot) : name;
        String extension = dot > 0 ? name.substring(dot) : "";
        for (int index = 1; index < 10000; index += 1) {
            candidate = new File(directory, base + " (" + index + ")" + extension);
            if (!candidate.exists()) return candidate;
        }
        return new File(directory, UUID.randomUUID() + extension);
    }

    private String safeMessage(Throwable error) {
        String message = error == null ? "未知错误" : error.getMessage();
        return message == null || message.trim().isEmpty() ? "未知错误" : message;
    }

    private final class AndroidBridge {
        @JavascriptInterface
        public String getDeviceId() {
            return getInstallId();
        }

        @JavascriptInterface
        public String getPlatform() {
            return "android";
        }

        @JavascriptInterface
        public String getServerUrl() {
            return LOCAL_APP_ORIGIN;
        }

        @JavascriptInterface
        public String getRuntimeMode() {
            return "local";
        }

        @JavascriptInterface
        public String getPerformanceTier() {
            return getAndroidPerformanceTier();
        }

        @JavascriptInterface
        public boolean openExternal(String uriValue) {
            if (uriValue == null || uriValue.trim().isEmpty()) return false;
            try {
                Uri uri = Uri.parse(uriValue.trim());
                runOnUiThread(() -> MainActivity.this.openExternal(uri));
                return true;
            } catch (Exception ignored) {
                return false;
            }
        }

        @JavascriptInterface
        public String beginDownload(String name, String mimeType) {
            return beginBlobDownload(name, mimeType);
        }

        @JavascriptInterface
        public boolean appendDownload(String id, String encodedChunk) {
            return appendBlobDownload(id, encodedChunk);
        }

        @JavascriptInterface
        public void finishDownload(String id) {
            finishBlobDownload(id);
        }

        @JavascriptInterface
        public void cancelDownload(String id) {
            cancelBlobDownload(id);
        }

        @JavascriptInterface
        public void showMessage(String message) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, message, Toast.LENGTH_LONG).show());
        }
    }

    private static final class PendingHttpDownload {
        final String url;
        final String userAgent;
        final String contentDisposition;
        final String mimeType;

        PendingHttpDownload(String url, String userAgent, String contentDisposition, String mimeType) {
            this.url = url;
            this.userAgent = userAgent;
            this.contentDisposition = contentDisposition;
            this.mimeType = mimeType;
        }
    }

    private static final class BlobDownload {
        final String name;
        final Uri uri;
        final File file;
        final OutputStream stream;

        BlobDownload(String name, Uri uri, File file, OutputStream stream) {
            this.name = name;
            this.uri = uri;
            this.file = file;
            this.stream = stream;
        }
    }
}
