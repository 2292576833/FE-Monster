# FE Monster 视觉语言规范

状态：项目级强制规范
适用范围：Windows 桌面客户端及其 `web/index.html` 界面
目标：在壁纸和实时场景之上建立统一、克制、可验证的暖色透明界面，同时避免透明层叠和逐卡片滤镜造成的性能损耗。

本文中的“必须”“不得”“应当”均为验收条件，而不是设计建议。新增或修改界面时，应先遵守本规范，再考虑局部风格。

## 1. 核心视觉原则

1. 中性高光只使用暖中性白 `rgb(255 246 232)`。
2. 严禁把冷白、蓝白或青色用作中性边框、中性高光和中性发光。`rgb(255 255 255)`、`#fff`、青蓝色光晕不得替代暖中性白。
3. 品牌色、歌曲封面色和状态色可以保留自身颜色，但不得伪装成中性材质光。错误、成功、平台品牌等语义颜色必须通过对应语义 Token 使用。
4. 透明材质依靠单层准确透明度、清晰边缘和暖色光强建立层级，不依靠多层半透明背景叠加。
5. “7% / 10% / 15%”均表示表面自身只有一个对应的 `0.07 / 0.10 / 0.15` alpha 填充层，不得用元素级 `opacity` 或多层叠加近似。
6. 交互状态优先改变光强、边框清晰度和轻微位移；不得随意改变中性表面的色相。

## 2. 颜色与透明度合同

| 用途 | 标准值 | 约束 |
| --- | --- | --- |
| 暖中性白 | `rgb(255 246 232)` | 中性文字、边框、图标和发光的唯一白色基准 |
| 10% 暖白表面 | `rgb(255 246 232 / 0.10)` | DIY 模式按钮默认及所有交互状态的底色 |
| 7% 黑色表面 | `rgb(0 0 0 / 0.07)` | 预设、文字预设、壁纸模式共用的最外层大面板 |
| 10% 黑色表面 | `rgb(0 0 0 / 0.10)` | 单首歌曲卡片底色，保持现有合同 |
| 15% 黑色表面 | `rgb(0 0 0 / 0.15)` | 歌单卡片底色 |
| 完全透明 | `transparent` 或 `rgb(0 0 0 / 0)` | DIY 结构子层、无独立材质的容器 |

### 2.1 精确单层 alpha

一个标记了目标百分比的表面必须同时满足：

- `background-color` 的 alpha 精确等于组件合同指定的 `0.07`、`0.10` 或 `0.15`，允许的浮点误差不超过 `0.001`；
- `background-image: none`，不得再叠加带 alpha 的渐变；
- 元素本身保持 `opacity: 1`，不能让文字、图标和子元素一起变淡；
- `::before`、`::after` 不得增加第二层表面填充；
- 子容器不得重复铺设同色半透明背景；
- 阴影和边框不计入表面填充，但阴影必须位于外侧，不能通过大面积内阴影抬高实际底色不透明度。

模糊只改变背景采样，不代表新的颜色层。即便如此，同一个浮动面板最多只能有一层 `backdrop-filter`，其结构子层必须为 `none`。

## 3. 三层 Token 架构

所有新增视觉值必须经过 `Primitive → Semantic → Component` 三层引用。组件规则不得直接写原始 RGB、alpha、阴影或窗口尺寸。

### 3.1 Primitive：原始值

Primitive 只描述不可再拆的原始值，不表达组件用途。

```css
:root {
  --fe-primitive-rgb-warm-neutral: 255 246 232;
  --fe-primitive-rgb-black: 0 0 0;

  --fe-primitive-alpha-transparent: 0;
  --fe-primitive-alpha-07: 0.07;
  --fe-primitive-alpha-10: 0.10;
  --fe-primitive-alpha-12: 0.12;
  --fe-primitive-alpha-15: 0.15;
  --fe-primitive-alpha-20: 0.20;
  --fe-primitive-alpha-28: 0.28;
  --fe-primitive-alpha-32: 0.32;

  --fe-primitive-glow-blur-rest: 10px;
  --fe-primitive-glow-blur-hover: 16px;
  --fe-primitive-glow-blur-active: 20px;

  --fe-primitive-window-width: 1760px;
  --fe-primitive-window-height: 990px;
  --fe-primitive-window-safe-inset: 24px;
}
```

### 3.2 Semantic：用途别名

Semantic 只描述视觉含义，并且只能引用 Primitive。

```css
:root {
  --fe-color-neutral-rgb: var(--fe-primitive-rgb-warm-neutral);
  --fe-color-dark-rgb: var(--fe-primitive-rgb-black);

  --fe-surface-warm-subtle:
    rgb(var(--fe-color-neutral-rgb) / var(--fe-primitive-alpha-10));
  --fe-surface-dark-subtle:
    rgb(var(--fe-color-dark-rgb) / var(--fe-primitive-alpha-10));
  --fe-surface-dark-panel:
    rgb(var(--fe-color-dark-rgb) / var(--fe-primitive-alpha-07));
  --fe-surface-dark-playlist:
    rgb(var(--fe-color-dark-rgb) / var(--fe-primitive-alpha-15));
  --fe-surface-structural: transparent;

  --fe-glow-neutral-rest:
    0 0 var(--fe-primitive-glow-blur-rest)
    rgb(var(--fe-color-neutral-rgb) / var(--fe-primitive-alpha-12));
  --fe-glow-neutral-hover:
    0 0 var(--fe-primitive-glow-blur-hover)
    rgb(var(--fe-color-neutral-rgb) / var(--fe-primitive-alpha-20));
  --fe-glow-neutral-active:
    0 0 var(--fe-primitive-glow-blur-active)
    rgb(var(--fe-color-neutral-rgb) / var(--fe-primitive-alpha-28));
  --fe-glow-neutral-focus:
    0 0 var(--fe-primitive-glow-blur-active)
    rgb(var(--fe-color-neutral-rgb) / var(--fe-primitive-alpha-32));
}
```

### 3.3 Component：组件映射

Component 只能引用 Semantic，不得绕过语义层。

```css
:root {
  --fe-diy-mode-bg: var(--fe-surface-warm-subtle);
  --fe-diy-panel-bg: var(--fe-surface-dark-panel);
  --fe-diy-child-bg: var(--fe-surface-structural);

  --fe-song-card-bg: var(--fe-surface-dark-subtle);
  --fe-song-card-glow-rest: var(--fe-glow-neutral-rest);
  --fe-song-card-glow-hover: var(--fe-glow-neutral-hover);
  --fe-song-card-glow-current: var(--fe-glow-neutral-active);
  --fe-song-card-glow-focus: var(--fe-glow-neutral-focus);

  --fe-playlist-card-bg: var(--fe-surface-dark-playlist);
  --fe-playlist-card-glow-rest: var(--fe-glow-neutral-rest);
  --fe-playlist-card-glow-hover: var(--fe-glow-neutral-hover);
  --fe-playlist-card-glow-active: var(--fe-glow-neutral-active);
}
```

命名格式统一为 `--fe-{层或组件}-{属性}-{状态}`。已有 Token 若表达同一含义，应迁移或建立别名，不得并行创造不同数值的同义 Token。

## 4. 组件规范

### 4.1 DIY 模式按钮

范围：主 DIY 入口及预设、文字预设、壁纸模式等一级模式切换按钮，重点包括 `.diy-button` 与 `.diy-page-tab`。

- 所有状态的底色必须保持 `var(--fe-diy-mode-bg)`，即 10% 暖中性白；
- `background-image` 必须为 `none`；
- Hover、Pressed、Selected、Focus 状态只能调整暖白边框、暖白发光强度或最多 1px 的位移；
- 不得在选中状态改成青色、蓝色或更高 alpha 的底色；
- 焦点状态必须有清晰的键盘轮廓，不能只依赖发光。

### 4.2 DIY 外层面板与结构子层

范围：`.diy-sidebar` 以及它的三个直接内容页 `#diyPresetPage`、`#diyTextPage`、`#diyWallpaperPage`。

- `.diy-sidebar` 是唯一材质承载层，底色必须为 `var(--fe-diy-panel-bg)`，即 7% 黑；
- 外层面板如需背景模糊，只能在 `.diy-sidebar` 上执行一次；
- 三个直接内容页必须使用 `var(--fe-diy-child-bg)`，并满足 `background-image: none`、`backdrop-filter: none`、`box-shadow: none`；
- 结构子层不得再次铺设黑色或暖白半透明底色；
- 壁纸缩略图、预设封面等真实媒体内容不属于“结构底色”，可以显示图像，但不得用额外中性填充层伪造第二张面板。

### 4.3 歌曲卡片

范围：所有 `.shelf-song-button`，包括歌曲栏、播放页歌曲栈、普通、悬停、聚焦、当前播放和禁用状态。

| 状态 | 背景 | 中性发光 |
| --- | --- | --- |
| Default | `var(--fe-song-card-bg)` | `var(--fe-song-card-glow-rest)` |
| Hover | 与 Default 完全一致 | `var(--fe-song-card-glow-hover)` |
| Focus-visible | 与 Default 完全一致 | `var(--fe-song-card-glow-focus)`，并显示独立轮廓 |
| Current / Selected | 与 Default 完全一致 | `var(--fe-song-card-glow-current)` |
| Pressed | 与 Default 完全一致 | 发光可短暂降低，允许最多 1px 位移 |
| Disabled | 与 Default 完全一致 | 发光降低；文字和图标仍需可辨认 |

歌曲卡片的状态变化规则：

- 背景始终是精确单层 10% 黑；
- 背景 RGB、alpha、渐变和模糊不得随状态变化；
- 中性发光颜色始终是 `rgb(255 246 232)`，状态之间只允许改变光强和模糊半径；
- 当前播放状态还必须通过文字、图标或 `aria-current` 表达，不能只靠光强；
- 卡片本身不得使用 `backdrop-filter`；
- 外发光不得使用青色或蓝色，也不得用冷白替代暖中性白。

### 4.4 歌单卡片

范围：歌单轨道中的 `.orb-playlist-card`，不包括单首歌曲 `.shelf-song-button`。

- 所有状态的背景必须保持 `var(--fe-playlist-card-bg)`，即精确单层 15% 黑；
- Default、Hover、Focus 和 Active 只允许改变暖白边框与暖白光强，背景 RGB 和 alpha 不变；
- 中性发光统一使用 `rgb(255 246 232)`，不得出现冷白、青色或蓝色光晕；
- 歌单卡不得使用逐卡片 `backdrop-filter`；
- 单首歌曲卡继续保持第 4.3 节的 10% 合同，不受歌单卡 15% 规则影响。

## 5. Windows 窗口规范

默认目标尺寸为 `1760 × 990`，比例固定为 `16:9`。该尺寸使用 Windows 逻辑坐标；DPI 换算必须由同一坐标系完成，禁止通过 CSS `zoom` 或页面缩放伪造窗口尺寸。

窗口必须完整位于当前显示器工作区内，并在四边保留至少 `24px` 安全边距。推荐算法：

```text
availableWidth  = workingArea.width  - 48
availableHeight = workingArea.height - 48
scale = min(1, availableWidth / 1760, availableHeight / 990)
windowWidth  = floor(1760 * scale)
windowHeight = floor(990 * scale)
windowLeft = workingArea.left + round((workingArea.width  - windowWidth)  / 2)
windowTop  = workingArea.top  + round((workingArea.height - windowHeight) / 2)
```

- 目标尺寸在工作区容纳得下时，必须精确使用 `1760 × 990`；
- 工作区较小时必须等比缩小，不能越过任务栏或屏幕边缘；
- 多显示器启动时以窗口所在或启动目标显示器的工作区为准；
- WinForms、Java 启动器、原生备用客户端和浏览器备用启动链必须使用同一尺寸合同；
- 最大化和全屏不受 24px 安全边距限制，但退出后必须恢复到合法的窗口化尺寸和位置。

## 6. 性能约束

1. 一个浮动面板最多一层 `backdrop-filter`；DIY 结构子层和歌曲卡片必须为 `none`。
2. 7%、10% 和 15% 表面不得通过多层渐变、伪元素或嵌套背景合成，既避免色差，也减少重绘。
3. 歌曲列表只渲染可视窗口；隐藏或虚拟化卡片不得继续绘制阴影、动画或媒体。
4. 单张歌曲卡最多使用一个外发光和一个轻量边框，不得叠加多组大半径阴影。
5. 发光动画优先使用固定暖白光层的 `opacity` 变化；不得持续动画 `filter: blur()`、背景渐变或大面积阴影几何。
6. `will-change` 只能在交互前后短暂设置，禁止永久挂在整个歌曲列表或所有 DIY 卡片上。
7. 不得为了透明质感增加逐卡片 Canvas、WebGL、视频、iframe 或独立模糊层。
8. 新视觉规则不得破坏现有虚拟列表、内容可见性和非当前预设按需加载机制。

## 7. 无障碍约束

- 普通文本对实际合成背景的对比度至少为 `4.5:1`，大号文本和必要图标至少为 `3:1`；
- 文字与图标不得继承材质表面的透明度，容器必须保持 `opacity: 1`；
- Focus-visible 轮廓必须清晰、连续，并与相邻区域达到至少 `3:1` 对比度；
- 当前歌曲、选中模式和禁用状态不得只通过颜色或发光表达；必须同时提供文字、图标、形状或 ARIA 状态；
- 所有模式按钮和歌曲按钮的可点击区域应至少为 `40 × 40px`；
- `prefers-reduced-motion: reduce` 下取消非必要位移和光强过渡，但保留静态焦点轮廓与状态区分；
- `forced-colors` 下允许系统颜色覆盖材质 Token，必须保留边框、焦点和可读文本。

## 8. 严禁的反模式

- 在组件规则里直接写 `#fff`、`rgb(255 255 255)`、青色或蓝色中性发光；
- 使用 `opacity: 0.1` 实现卡片透明度；
- 把“7% / 10% / 15%”解释为剩余不透明度，或实现为 `0.93 / 0.90 / 0.85`；
- 在精确单层材质上叠加半透明渐变、伪元素底色或同色子面板；
- Hover、Current、Focus 时改变歌曲卡片背景 RGB 或 alpha；
- 给每张歌曲卡或 DIY 子层添加 `backdrop-filter`；
- 通过多个 `!important` 和文件末尾覆盖制造不同主题真源；
- 组件直接引用 Primitive Token，或绕过 Token 写硬编码值；
- 用 CSS 缩放代替真实窗口尺寸，或让窗口越过工作区、任务栏和 24px 安全边距；
- 只做源码正则测试，不验证浏览器最终计算样式和真实 HWND 几何。

## 9. 自动验收合同

### 9.1 最终计算样式

必须在 Edge/WebView2 中读取 `getComputedStyle`，不能只检查 CSS 源码：

- `.diy-button`、`.diy-page-tab`：背景 RGB 为 `255,246,232`，alpha 为 `0.10`，`backgroundImage === "none"`；
- `.diy-sidebar`：背景 RGB 为 `0,0,0`，alpha 为 `0.07`，且只有一层背景材质；
- `#diyPresetPage`、`#diyTextPage`、`#diyWallpaperPage`：背景 alpha 为 `0`，`backgroundImage`、`boxShadow`、`backdropFilter` 均为 `none`；
- 普通、Hover、Focus、Current 的 `.shelf-song-button`：背景均为 `rgba(0, 0, 0, 0.1)`，没有背景图和逐卡片模糊；
- 歌曲卡各状态的非 `inset` 外发光 RGB 均为 `255,246,232`，且只允许光强和模糊半径不同。
- 普通、Hover、Focus、Active 的 `.orb-playlist-card`：背景均为 `rgba(0, 0, 0, 0.15)`，外发光 RGB 为 `255,246,232`，且没有逐卡片模糊。

### 9.2 窗口几何

自动化测试必须从真实 HWND 读取窗口矩形和显示器工作区：

- 大工作区下窗口精确为 `1760 × 990`；
- `left >= work.left + 24`；
- `top >= work.top + 24`；
- `right <= work.right - 24`；
- `bottom <= work.bottom - 24`；
- 小工作区下宽高同比缩放，比例误差不超过 `0.002`；
- WebView 客户区继续覆盖完整窗口客户区，不得引入白边、黑角或透明裁切角。

### 9.3 建议扩展的现有测试

- `scripts/check-unlimited-refresh-window.mjs`：统一验证四条 Windows 启动链的 `1760 × 990` 合同；
- `scripts/check-live-window-surface.ps1`：验证真实窗口尺寸、工作区安全边距和 WebView 覆盖；
- `scripts/check-client-polish.mjs`：逐页验证三种 DIY 底层结构和模式按钮的计算样式并截图；
- `scripts/check-text-composer-ui.mjs`：验证歌曲卡普通、聚焦、当前状态的背景恒定与暖白光强变化；
- `scripts/check-windowed-layout.mjs`：覆盖目标窗口和较小窗口的裁切、溢出和交互区域；
- `scripts/check-playlist-ui-performance.mjs`：确保视觉修改不扩大歌曲 DOM、绘制窗口和焦点更新耗时。

视觉截图至少覆盖 `1760 × 990`、`1280 × 720`，并分别在明亮壁纸、深色壁纸和高饱和壁纸上检查可读性。源码断言、计算样式、截图和性能测试缺一不可。

## 10. 变更流程

1. 明确变更属于 Primitive、Semantic 还是 Component；不得直接从组件开始堆硬编码。
2. 只有出现新的不可复用原始值时才增加 Primitive；否则复用已有值。
3. 为用途建立或复用 Semantic，再由 Component Token 引用。
4. 找到当前级联中的最终生效规则，修改唯一真源；删除或收敛互相覆盖的旧规则。
5. 检查默认、Hover、Pressed、Focus-visible、Current、Disabled 和 Reduced Motion 状态。
6. 运行第 9 节列出的源码合同、Edge/WebView2 计算样式、真实窗口和性能测试。
7. 在明暗壁纸上审阅截图，确认不存在冷白、青蓝中性光、透明层叠或文字失焦。
8. 在变更说明中记录 Token 变化、受影响组件、测试结果和视觉截图路径。
9. 若最终计算样式不符合本规范，即使源码看似正确也不得合并或打包。
