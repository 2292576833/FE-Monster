import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const html = fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'web', 'styles.css'), 'utf8');
const cursorTrails = fs.readFileSync(path.join(root, 'web', 'cursor-trails.js'), 'utf8');
const reactBitsCss = fs.readFileSync(path.join(root, 'web', 'reactbits', 'src', 'styles.css'), 'utf8');
const androidCss = fs.readFileSync(
  path.join(root, 'android', 'app', 'src', 'main', 'androidWeb', 'fe-monster-mobile.css'),
  'utf8'
);
assert.match(
  html,
  /<details[^>]*id="runtimeCursorSettingsGroup"[\s\S]*?<summary>[\s\S]*?鼠标光标[\s\S]*?皮肤、移入与尾迹[\s\S]*?<\/details>/,
  '设置页应包含只管理光标样式与移入动效的独立“鼠标光标”层级'
);

const cursorGroup = html.match(/<details[^>]*id="runtimeCursorSettingsGroup"[\s\S]*?<\/details>/)?.[0] || '';
assert.doesNotMatch(cursorGroup, /id="cursorStyleSelect"/, '设置页不应再显示 36 种系统光标');
assert.match(cursorGroup, /id="cursorSkinSelect"/, '光标层级应提供鼠标皮肤选择');
assert.match(cursorGroup, /id="cursorMotionSelect"/, '光标层级应提供移入动效选择');
assert.match(cursorGroup, /id="cursorTrailSelect"/, '光标层级应提供鼠标尾迹选择');
assert.match(
  cursorGroup,
  /id="cursorPreferencePreview"[^>]*tabindex="0"[^>]*aria-describedby="cursorPreferenceStatus"/,
  '光标层级应提供可聚焦且能读出当前状态的实时预览'
);
for (const effect of ['off', 'lift', 'magnetic', 'glow']) {
  assert.match(cursorGroup, new RegExp(`<option value="${effect}"`), `缺少光标移入动效 ${effect}`);
}
for (const skin of ['glass', 'ether', 'frost', 'stardust', 'pixel', 'gold']) {
  assert.match(cursorGroup, new RegExp(`<option value="${skin}"`), `缺少鼠标皮肤 ${skin}`);
}
for (const trail of ['off', 'glow', 'comet', 'stardust', 'ribbon', 'prism']) {
  assert.match(cursorGroup, new RegExp(`<option value="${trail}"`), `缺少鼠标尾迹 ${trail}`);
}
assert.match(app, /CURSOR_PREFERENCES_KEY\s*=\s*'fe-monster-cursor-preferences-v1'/, '光标偏好应有独立持久化键');
assert.match(app, /function loadCursorPreferences[\s\S]*?localStorage\.getItem\(CURSOR_PREFERENCES_KEY\)/, '启动时应恢复光标偏好');
assert.match(app, /function saveCursorPreferences[\s\S]*?localStorage\.setItem\(CURSOR_PREFERENCES_KEY/, '修改后应保存光标偏好');
assert.doesNotMatch(app, /CSS_CURSOR_KEYWORDS|cursorStyleSelect/, '运行时不应保留系统光标选择逻辑');
assert.match(app, /function applyCursorPreferences[\s\S]*?dataset\.feCursorMotion/, '光标动效应实时应用到根节点');
assert.match(app, /function applyCursorPreferences[\s\S]*?dataset\.feCursorSkin[\s\S]*?dataset\.feCursorTrail/, '鼠标皮肤与尾迹应实时应用到根节点');
assert.match(app, /cursorSkinSelect\.addEventListener\('change'/, '鼠标皮肤选择应实时响应');
assert.match(app, /cursorMotionSelect\.addEventListener\('change'/, '光标移入动效选择应实时响应');
assert.match(app, /cursorTrailSelect\.addEventListener\('change'/, '鼠标尾迹选择应实时响应');
assert.match(css, /data-fe-cursor-skin[\s\S]*?cursor:\s*var\(--fe-cursor-skin-default\)/, '鼠标皮肤应应用自定义热点光标');
assert.doesNotMatch(css, /body\s*\*[^{]*\{[^}]*cursor:[^}]*!important/, '鼠标皮肤不能覆盖文本、禁用和缩放光标语义');
assert.match(css, /data-fe-cursor-motion="lift"[\s\S]*?translate:[^;]*-\d+px[\s\S]*?scale:/, '柔和上浮应由 CSS hover/focus 动效完成');
assert.match(css, /data-fe-cursor-motion="glow"[\s\S]*?drop-shadow/, '光晕应由 CSS hover/focus 动效完成');
assert.match(app, /function activateCursorMagnet[\s\S]*?addEventListener\('pointermove'/, '磁性跟随应只在当前交互控件监听移动');
assert.doesNotMatch(app, /(?:document|window)\.addEventListener\('pointermove',\s*handleCursorMagnet/, '磁性跟随不能使用全局高频 pointermove');
assert.match(app, /requestAnimationFrame\(renderCursorMagnet/, '磁性跟随应合并到动画帧');
assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?data-fe-cursor-motion/, '应尊重减弱动态偏好');
assert.match(css, /@media\s*\(any-hover:\s*none\)[\s\S]*?data-fe-cursor-motion/, '触屏设备应停用悬浮光标动效');
assert.match(cursorTrails, /document\.addEventListener\(["']pointermove["'][\s\S]*?passive:\s*true/, '尾迹应使用单一 passive Pointer Events 监听');
assert.match(cursorTrails, /getCoalescedEvents[\s\S]*?coalesced\.length\s*\?\s*coalesced\s*:\s*\[event\]/, '尾迹应使用合并采样并提供兼容回退');
assert.match(cursorTrails, /requestAnimationFrame\(drawFrame\)/, '尾迹绘制应合并到 requestAnimationFrame');
assert.match(cursorTrails, /if\s*\(!samples\.length\)[\s\S]*?canvas\.hidden\s*=\s*true/, '尾迹结束后应停止并隐藏画布');
assert.match(cursorTrails, /pointerType\s*!==\s*["']touch["']/, '尾迹不能在触摸输入上运行');
assert.match(cursorTrails, /prefers-reduced-motion:\s*reduce/, '尾迹应遵守减弱动态偏好');
assert.match(cursorTrails, /canvasCount:[\s\S]*?cursor-trail-canvas/, '尾迹必须保持单画布诊断');
for (const asset of ['glass-arrow.svg', 'ether-arrow.svg', 'frost-crosshair.svg', 'stardust-arrow.svg', 'pixel-arrow.svg', 'gold-arrow.svg']) {
  assert.ok(fs.existsSync(path.join(root, 'web', 'assets', 'cursors', asset)), `缺少鼠标皮肤资源 ${asset}`);
}

function sliderThumbRules(source) {
  return [...source.matchAll(/[^{}]*::-(?:webkit-slider-thumb|moz-range-thumb)\s*\{[^{}]*\}/g)]
    .map((match) => match[0]);
}

for (const [label, source] of [
  ['desktop web', css],
  ['ReactBits player', reactBitsCss],
  ['Android WebView', androidCss]
]) {
  const thumbRules = sliderThumbRules(source);
  assert.ok(thumbRules.length >= 2, `${label} should style both WebKit and Firefox range thumbs`);
  for (const thumbRule of thumbRules) {
    if (/width\s*:/.test(thumbRule)) {
      assert.match(thumbRule, /width:\s*1px/, `${label} range thumb width must remain visually hidden`);
    }
    if (/height\s*:/.test(thumbRule)) {
      assert.match(thumbRule, /height:\s*1px/, `${label} range thumb height must remain visually hidden`);
    }
    if (/(?:^|[;\s])border\s*:/.test(thumbRule)) {
      assert.match(thumbRule, /border:\s*0/, `${label} range thumb cannot render a border`);
    }
    if (/background\s*:/.test(thumbRule)) {
      assert.match(thumbRule, /background:\s*transparent/, `${label} range thumb cannot render a fill`);
    }
    if (/box-shadow\s*:/.test(thumbRule)) {
      assert.match(thumbRule, /box-shadow:\s*none/, `${label} range thumb cannot render a shadow`);
    }
    if (/opacity\s*:/.test(thumbRule)) {
      assert.match(thumbRule, /opacity:\s*0/, `${label} range thumb must stay transparent`);
    }
    assert.doesNotMatch(
      thumbRule,
      /(?:display:\s*none|pointer-events:\s*none)/,
      `${label} must preserve native range dragging instead of disabling the thumb hit target`
    );
  }
}
assert.match(
  css,
  /\.qishui-playback-progress-range:(?:hover|focus-visible|active)::\-webkit-slider-thumb[\s\S]*?\{[\s\S]*?opacity:\s*0[\s\S]*?transform:\s*none/,
  'new playback-bar progress thumb must not reappear during hover, focus, or drag'
);
assert.match(
  css,
  /input\[type="range"\]\s*\{[\s\S]*?transform:\s*translateY\(0\)\s*scale\(1\)[\s\S]*?transition:[\s\S]*?transform/,
  '滑块应声明可返回初始状态的变换过渡'
);
assert.match(
  css,
  /input\[type="range"\]:not\(:disabled\):is\(:hover,\s*:focus-visible\)\s*\{[\s\S]*?translateY\(-\d+px\)\s*scale\(1\.\d+\)/,
  '滑块 hover 与键盘聚焦时应上浮并放大'
);
assert.match(
  css,
  /input\[type="range"\]:disabled\s*\{[\s\S]*?transform:\s*translateY\(0\)\s*scale\(1\)/,
  '禁用滑块不能保留悬浮变换'
);

console.log(JSON.stringify({
  ok: true,
  checks: [
    'hidden range thumbs across desktop, Android, and ReactBits',
    'playback progress thumb remains hidden in interaction states',
    'native range dragging and keyboard focus preserved',
    'reversible range hover and focus motion',
    'cursor settings hierarchy',
    'system cursor selector removed',
    'six custom cursor skins',
    'four pointer motion effects',
    'five switchable cursor trails plus off',
    'focusable live preview',
    'persistent live preferences',
    'CSS-first motion with scoped magnetic tracking',
    'single Canvas2D trail with coalesced pointer samples and idle release'
  ]
}, null, 2));
