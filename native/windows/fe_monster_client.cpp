#define NOMINMAX
#include <windows.h>
#include <dwmapi.h>
#include <shellapi.h>
#include <wrl.h>
#include <WebView2.h>
#include <WebView2EnvironmentOptions.h>

#include <algorithm>
#include <string>

#pragma comment(lib, "dwmapi.lib")

using Microsoft::WRL::Callback;
using Microsoft::WRL::ComPtr;

namespace {
HWND g_window = nullptr;
ComPtr<ICoreWebView2Controller> g_controller;
ComPtr<ICoreWebView2> g_webview;
std::wstring g_url = L"http://127.0.0.1:3000/";

constexpr DWORD kDwmWindowCornerPreference = 33;
constexpr int kDwmDoNotRound = 1;
constexpr int kDwmRound = 2;
constexpr int kWindowWorkAreaMargin = 24;

struct InitialWindowBounds {
    int x;
    int y;
    int width;
    int height;
};

InitialWindowBounds fit_window_to_work_area(int requested_width, int requested_height) {
    POINT cursor = {};
    GetCursorPos(&cursor);
    HMONITOR monitor = MonitorFromPoint(cursor, MONITOR_DEFAULTTOPRIMARY);
    MONITORINFO monitor_info = {};
    monitor_info.cbSize = sizeof(monitor_info);
    RECT working_area = {};
    if (monitor && GetMonitorInfoW(monitor, &monitor_info)) {
        working_area = monitor_info.rcWork;
    } else if (!SystemParametersInfoW(SPI_GETWORKAREA, 0, &working_area, 0)) {
        working_area.right = std::max(1, GetSystemMetrics(SM_CXSCREEN));
        working_area.bottom = std::max(1, GetSystemMetrics(SM_CYSCREEN));
    }

    int working_width = std::max(1, static_cast<int>(working_area.right - working_area.left));
    int working_height = std::max(1, static_cast<int>(working_area.bottom - working_area.top));
    int horizontal_margin = std::min(kWindowWorkAreaMargin, std::max(0, (working_width - 1) / 2));
    int vertical_margin = std::min(kWindowWorkAreaMargin, std::max(0, (working_height - 1) / 2));
    int safe_width = std::max(1, working_width - horizontal_margin * 2);
    int safe_height = std::max(1, working_height - vertical_margin * 2);
    requested_width = std::max(1, requested_width);
    requested_height = std::max(1, requested_height);
    double scale = std::min(
        1.0,
        std::min(
            safe_width / static_cast<double>(requested_width),
            safe_height / static_cast<double>(requested_height)
        )
    );
    int width = std::max(1, std::min(safe_width, static_cast<int>(requested_width * scale)));
    int height = std::max(1, std::min(safe_height, static_cast<int>(requested_height * scale)));
    int safe_left = working_area.left + horizontal_margin;
    int safe_top = working_area.top + vertical_margin;
    return {
        safe_left + (safe_width - width) / 2,
        safe_top + (safe_height - height) / 2,
        width,
        height
    };
}

std::wstring arg_value(int argc, wchar_t** argv, const wchar_t* name, const wchar_t* fallback) {
    for (int i = 1; i + 1 < argc; ++i) {
        if (wcscmp(argv[i], name) == 0) return argv[i + 1];
    }
    return fallback;
}

int arg_int(int argc, wchar_t** argv, const wchar_t* name, int fallback) {
    std::wstring value = arg_value(argc, argv, name, L"");
    if (value.empty()) return fallback;
    return _wtoi(value.c_str());
}

void resize_webview() {
    if (!g_controller || !g_window) return;
    RECT bounds = {};
    GetClientRect(g_window, &bounds);
    g_controller->put_Bounds(bounds);
}

void apply_window_corner_policy(HWND hwnd, bool maximized) {
    int preference = maximized ? kDwmDoNotRound : kDwmRound;
    DwmSetWindowAttribute(
        hwnd,
        kDwmWindowCornerPreference,
        &preference,
        sizeof(preference)
    );
    SetWindowRgn(hwnd, nullptr, TRUE);
}

void create_webview() {
    auto environment_options = Microsoft::WRL::Make<CoreWebView2EnvironmentOptions>();
    environment_options->put_AdditionalBrowserArguments(
        L"--use-gl=angle --use-angle=default "
        L"--enable-accelerated-2d-canvas"
    );
    CreateCoreWebView2EnvironmentWithOptions(
        nullptr,
        nullptr,
        environment_options.Get(),
        Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>(
            [](HRESULT result, ICoreWebView2Environment* environment) -> HRESULT {
                if (FAILED(result) || !environment) return result;
                environment->CreateCoreWebView2Controller(
                    g_window,
                    Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
                        [](HRESULT controller_result, ICoreWebView2Controller* controller) -> HRESULT {
                            if (FAILED(controller_result) || !controller) return controller_result;
                            g_controller = controller;
                            g_controller->get_CoreWebView2(&g_webview);
                            resize_webview();
                            if (g_webview) {
                                g_webview->Navigate(g_url.c_str());
                            }
                            return S_OK;
                        }
                    ).Get()
                );
                return S_OK;
            }
        ).Get()
    );
}

LRESULT CALLBACK window_proc(HWND hwnd, UINT message, WPARAM wparam, LPARAM lparam) {
    switch (message) {
        case WM_SIZE:
            if (wparam != SIZE_MINIMIZED) {
                apply_window_corner_policy(hwnd, wparam == SIZE_MAXIMIZED);
            }
            resize_webview();
            return 0;
        case WM_DPICHANGED: {
            LRESULT result = DefWindowProcW(hwnd, message, wparam, lparam);
            apply_window_corner_policy(hwnd, IsZoomed(hwnd) != FALSE);
            resize_webview();
            return result;
        }
        case WM_DESTROY:
            PostQuitMessage(0);
            return 0;
        default:
            return DefWindowProcW(hwnd, message, wparam, lparam);
    }
}
}

int APIENTRY wWinMain(HINSTANCE instance, HINSTANCE, LPWSTR, int show_command) {
    int argc = 0;
    wchar_t** argv = CommandLineToArgvW(GetCommandLineW(), &argc);
    if (argv) {
        g_url = arg_value(argc, argv, L"--url", g_url.c_str());
    }
    int width = argv ? arg_int(argc, argv, L"--width", 1760) : 1760;
    int height = argv ? arg_int(argc, argv, L"--height", 990) : 990;
    if (argv) LocalFree(argv);
    InitialWindowBounds initial_bounds = fit_window_to_work_area(width, height);

    HRESULT coinit = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
    if (FAILED(coinit) && coinit != RPC_E_CHANGED_MODE) return 1;

    const wchar_t* class_name = L"FE_MONSTER_NATIVE_CLIENT";
    WNDCLASSEXW window_class = {};
    window_class.cbSize = sizeof(WNDCLASSEXW);
    window_class.lpfnWndProc = window_proc;
    window_class.hInstance = instance;
    window_class.hCursor = LoadCursor(nullptr, IDC_ARROW);
    window_class.hbrBackground = reinterpret_cast<HBRUSH>(COLOR_WINDOW + 1);
    window_class.lpszClassName = class_name;
    RegisterClassExW(&window_class);

    g_window = CreateWindowExW(
        0,
        class_name,
        L"FE Monster",
        WS_OVERLAPPEDWINDOW,
        initial_bounds.x,
        initial_bounds.y,
        initial_bounds.width,
        initial_bounds.height,
        nullptr,
        nullptr,
        instance,
        nullptr
    );
    if (!g_window) return 1;

    apply_window_corner_policy(g_window, false);
    ShowWindow(g_window, show_command);
    UpdateWindow(g_window);
    create_webview();

    MSG message = {};
    while (GetMessageW(&message, nullptr, 0, 0)) {
        TranslateMessage(&message);
        DispatchMessageW(&message);
    }

    g_webview.Reset();
    g_controller.Reset();
    CoUninitialize();
    return static_cast<int>(message.wParam);
}
