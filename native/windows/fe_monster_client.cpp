#include <windows.h>
#include <shellapi.h>
#include <wrl.h>
#include <WebView2.h>

#include <string>

using Microsoft::WRL::Callback;
using Microsoft::WRL::ComPtr;

namespace {
HWND g_window = nullptr;
ComPtr<ICoreWebView2Controller> g_controller;
ComPtr<ICoreWebView2> g_webview;
std::wstring g_url = L"http://127.0.0.1:3000/";

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

void create_webview() {
    CreateCoreWebView2EnvironmentWithOptions(
        nullptr,
        nullptr,
        nullptr,
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
            resize_webview();
            return 0;
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
    int width = argv ? arg_int(argc, argv, L"--width", 1600) : 1600;
    int height = argv ? arg_int(argc, argv, L"--height", 900) : 900;
    if (argv) LocalFree(argv);

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
        CW_USEDEFAULT,
        CW_USEDEFAULT,
        width,
        height,
        nullptr,
        nullptr,
        instance,
        nullptr
    );
    if (!g_window) return 1;

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
