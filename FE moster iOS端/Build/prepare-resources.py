#!/usr/bin/env python3
"""Build a disposable iOS Web/Node resource tree without touching desktop files."""

from __future__ import annotations

import re
import shutil
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parents[1]
ROOT_DIR = PROJECT_DIR.parent
GENERATED_DIR = PROJECT_DIR / "App" / "GeneratedResources"
GENERATED_WEB = GENERATED_DIR / "Web"
GENERATED_GATEWAY = GENERATED_DIR / "NodeGateway"


def require(path: Path, label: str) -> Path:
    if not path.exists():
        raise SystemExit(f"缺少 {label}: {path}")
    return path


def replace_tree(source: Path, destination: Path, ignore=None) -> None:
    generated_root = GENERATED_DIR.resolve()
    destination_parent = destination.parent.resolve()
    if destination_parent != generated_root:
        raise SystemExit(f"拒绝清理生成目录之外的路径: {destination}")
    if destination.exists():
        shutil.rmtree(destination)
    shutil.copytree(source, destination, ignore=ignore)


def inject_overlay(index_path: Path) -> None:
    html = index_path.read_text(encoding="utf-8")
    inline_client_mode = (
        "    <script>\n"
        "      const clientMode = new URLSearchParams(window.location.search).get('client');\n"
        "      if (clientMode === 'embedded') document.documentElement.dataset.fePlatform = 'desktop';\n"
        "    </script>\n"
    )
    if inline_client_mode not in html:
        raise SystemExit(
            "web/index.html 内联平台脚本结构已变化，无法应用严格 iOS CSP。"
        )
    html = html.replace(inline_client_mode, "", 1)

    csp_meta = (
        '    <meta http-equiv="Content-Security-Policy" content="'
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob: https:; "
        "media-src 'self' blob: https:; "
        "font-src 'self' data:; "
        "connect-src 'self' blob:; "
        "worker-src 'self' blob:; "
        "object-src 'none'; "
        "base-uri 'none'; "
        "frame-src 'none'; "
        "form-action 'none'"
        '" />\n'
    )
    style_tag = (
        '    <link rel="stylesheet" '
        'href="fe-monster-ios.css?v=20260723-ios-1" />\n'
    )
    runtime_tag = (
        '    <script src="fe-monster-ios-runtime.js?'
        'v=20260723-ios-1"></script>\n'
    )

    if "</head>" not in html:
        raise SystemExit("web/index.html 缺少 </head>，无法注入 iOS 样式。")
    html = html.replace(
        '<meta name="referrer" content="no-referrer" />\n',
        '<meta name="referrer" content="no-referrer" />\n'
        f"{csp_meta}",
        1,
    )
    html = html.replace("</head>", f"{style_tag}</head>", 1)

    client_loader_script = re.compile(
        r'(?P<tag><script\s+type=["\']module["\']\s+'
        r'src=["\']client-runtime-loader\.js[^"\']*["\'][^>]*>\s*</script>)',
        flags=re.IGNORECASE,
    )
    match = client_loader_script.search(html)
    if match is None:
        raise SystemExit(
            "web/index.html 中没有找到 client-runtime-loader.js，"
            "无法在平台分流前注入 iOS 运行时。"
        )
    html = html[: match.start()] + runtime_tag + html[match.start() :]

    runtime_position = html.find("fe-monster-ios-runtime.js")
    client_position = html.find("client-runtime-loader.js")
    storm_position = html.find("storm-ocean-runtime.js")
    app_position = html.find("app.js")
    if not (
        0 <= runtime_position < client_position < storm_position < app_position
    ):
        raise SystemExit("iOS 运行时注入顺序无效，拒绝生成资源副本。")

    index_path.write_text(html, encoding="utf-8")


def patch_client_runtime_loader(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    original_header = (
        "const androidClient = Boolean(window.FeMonsterAndroid)\n"
        "  || document.documentElement.dataset.fePlatform === 'android';\n\n"
        "if (androidClient) {\n"
        "  document.documentElement.dataset.feRuntimeUi = 'android-local';"
    )
    ios_header = (
        "const iosClient = Boolean(window.__FE_MONSTER_IOS__)\n"
        "  || document.documentElement.dataset.fePlatform === 'ios';\n"
        "const androidClient = Boolean(window.FeMonsterAndroid)\n"
        "  || document.documentElement.dataset.fePlatform === 'android';\n"
        "const mobileClient = androidClient || iosClient;\n\n"
        "if (mobileClient) {\n"
        "  document.documentElement.dataset.feRuntimeUi = iosClient\n"
        "    ? 'ios-local'\n"
        "    : 'android-local';"
    )
    if original_header not in text:
        raise SystemExit(
            "client-runtime-loader.js 结构已变化，拒绝盲目应用 iOS 分流补丁。"
        )
    path.write_text(
        text.replace(original_header, ios_header, 1),
        encoding="utf-8",
    )


def patch_storm_runtime(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    if "const ANDROID_CLIENT =" not in text or "LOW_END_ANDROID" not in text:
        raise SystemExit(
            "storm-ocean-runtime.js 结构已变化，拒绝盲目应用移动质量补丁。"
        )

    text = text.replace("LOW_END_ANDROID", "LOW_END_MOBILE")
    text = text.replace("ANDROID_CLIENT", "MOBILE_CLIENT")
    mobile_declaration = (
        "const MOBILE_CLIENT = Boolean("
        "global.FeMonsterAndroid || /Android/i.test(global.navigator?.userAgent || ''));"
    )
    replacement = (
        "const IOS_CLIENT = Boolean(global.__FE_MONSTER_IOS__ "
        "|| global.document?.documentElement?.dataset.fePlatform === 'ios');\n"
        "  const MOBILE_CLIENT = Boolean(global.FeMonsterAndroid "
        "|| /Android/i.test(global.navigator?.userAgent || '') || IOS_CLIENT);"
    )
    if mobile_declaration not in text:
        raise SystemExit(
            "storm-ocean-runtime.js 移动端声明未匹配，拒绝生成不确定副本。"
        )
    text = text.replace(mobile_declaration, replacement, 1)
    path.write_text(text, encoding="utf-8")


def main() -> None:
    source_web = require(ROOT_DIR / "web", "共享 web 目录")
    source_components = require(ROOT_DIR / "components", "共享 components 目录")
    overlay_dir = require(PROJECT_DIR / "WebOverlay", "iOS WebOverlay 目录")
    gateway_dir = require(PROJECT_DIR / "NodeGateway", "iOS NodeGateway 目录")
    overlay_css = require(overlay_dir / "fe-monster-ios.css", "iOS CSS 覆盖层")
    overlay_runtime = require(
        overlay_dir / "fe-monster-ios-runtime.js",
        "iOS JS 运行时",
    )
    require(gateway_dir / "main.cjs", "iOS Node 网关入口")
    require(gateway_dir / "package.json", "iOS Node 网关 package.json")
    require(gateway_dir / "package-lock.json", "iOS Node 网关锁文件")

    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    replace_tree(source_web, GENERATED_WEB)
    shutil.copytree(source_components, GENERATED_WEB / "components")
    patch_client_runtime_loader(GENERATED_WEB / "client-runtime-loader.js")
    patch_storm_runtime(GENERATED_WEB / "storm-ocean-runtime.js")
    shutil.copy2(overlay_css, GENERATED_WEB / overlay_css.name)
    shutil.copy2(overlay_runtime, GENERATED_WEB / overlay_runtime.name)
    inject_overlay(GENERATED_WEB / "index.html")

    replace_tree(
        gateway_dir,
        GENERATED_GATEWAY,
        ignore=shutil.ignore_patterns(
            "node_modules",
            ".cache",
            "data",
            "logs",
            "test",
            "*.log",
        ),
    )

    print(f"[FE Monster iOS] Web 资源: {GENERATED_WEB}")
    print(f"[FE Monster iOS] Node 网关: {GENERATED_GATEWAY}")


if __name__ == "__main__":
    main()
