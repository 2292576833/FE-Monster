import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('web/index.html', 'utf8');
const app = readFileSync('web/app.js', 'utf8');
const css = readFileSync('web/styles.css', 'utf8');

assert.match(html, /id="listenMiniCollapse"[^>]+aria-expanded="true"/);
assert.match(app, /function setListenMiniCollapsed\(collapsed\)/);
assert.match(app, /classList\.toggle\('is-left-collapsed', nextCollapsed\)/);
assert.match(app, /listenMiniCollapse\.addEventListener\('click', toggleListenMiniCollapsed\)/);
assert.match(css, /\.listen-mini\.is-left-collapsed\s*\{[^}]*translate3d\(calc\(-100% \+ 44px/s);

assert.match(html, /id="qishuiPlaybackDanmakuToggle"/);
assert.match(html, /id="qishuiPlaybackDanmakuComposer"[^>]+data-glass-surface/s);
assert.match(css, /\.qishui-playback-danmaku-toggle\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s);
assert.match(css, /\.qishui-playback-danmaku-composer\s*\{[^}]*position:\s*fixed;[^}]*left:\s*calc\(16px \+ var\(--safe-area-left\)\);/s);
assert.match(app, /document\.body\.appendChild\(els\.qishuiPlaybackDanmakuComposer\)/);
assert.match(css, /#qishuiPlaybackDanmakuComposer\.glass-surface,\s*\.community-danmaku-bubble\.glass-surface\s*\{/s);
assert.match(app, /bubble\.className = `community-danmaku-bubble glass-surface/);
assert.match(app, /setTimeout\(\(\) => removeCommunityDanmakuBubble\(bubble\), 3000\)/);
assert.match(app, /const radius = 138;/);

console.log('Together-listen left collapse and neutral GlassSurface danmaku contract PASS');
