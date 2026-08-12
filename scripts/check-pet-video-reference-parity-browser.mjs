import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const webRoot = path.join(projectRoot, 'web');
const artifactRoot = path.join(projectRoot, 'artifacts', 'pet-video-reference-parity');
const profile = path.join(projectRoot, 'tmp', `.edge-pet-video-parity-${process.pid}`);
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

assert.ok(existsSync(edge), `Microsoft Edge was not found: ${edge}`);
mkdirSync(artifactRoot, { recursive: true });

const fixture = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/pet-assistant.css"><style>
html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#090e1e}
body{display:grid;place-items:center}
#petAssistant{display:block!important;position:relative!important;inset:auto!important;width:420px!important;height:420px!important;transform:none!important}
#petAssistantDock{position:absolute!important;left:60px!important;top:60px!important;width:300px!important;height:300px!important}
#petAssistantCharacter{position:relative!important;width:300px!important;height:300px!important;transform:none!important;border:0!important;padding:0!important;background:transparent!important;animation:none!important}
#petAssistantParticleOrb{position:absolute!important;inset:0!important;animation:none!important}
</style></head><body>
<section class="pet-assistant" id="petAssistant" data-state="idle" data-live-conversation="inactive">
  <div class="pet-assistant__dock" id="petAssistantDock">
    <button class="pet-assistant__character" id="petAssistantCharacter" type="button">
      <canvas class="pet-assistant__particle-orb" id="petAssistantParticleOrb"></canvas>
    </button>
  </div>
  <audio id="petAssistantAudio"></audio>
</section>
<script>
window.__petDrawTimes=[];
for(const Context of [window.WebGLRenderingContext,window.WebGL2RenderingContext]){
  if(!Context?.prototype?.drawArrays||Context.prototype.drawArrays.__videoParity)continue;
  const original=Context.prototype.drawArrays;
  const measured=function(...args){window.__petDrawTimes.push(performance.now());return original.apply(this,args)};
  measured.__videoParity=true;Context.prototype.drawArrays=measured;
}
window.__petAudioSnapshot={playing:false,energy:0,bass:0,mid:0,treble:0,beat:0};
window.FeMonsterPetEmotionRuntime={snapshot:()=>({mood:3,energy:3,sevenEmotions:{primary:'joy',intensity:.4},motion:'lift'})};
window.FeMonsterPetActionBridge={snapshot:()=>({...window.__petAudioSnapshot})};
</script>
<script src="/vendor/three.r128.min.js"></script><script src="/pet-particle-orb.js"></script>
</body></html>`;

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(fixture);
    return;
  }
  const file = path.resolve(webRoot, decodeURIComponent(url.pathname.slice(1)));
  if (!file.startsWith(`${webRoot}${path.sep}`) || !existsSync(file)) {
    response.writeHead(404); response.end('Not found'); return;
  }
  response.writeHead(200, { 'content-type': file.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8' });
  response.end(readFileSync(file));
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const port = server.address().port;
const browser = spawn(edge, [
  '--headless=new', '--no-sandbox', '--enable-webgl', '--ignore-gpu-blocklist',
  '--remote-allow-origins=*', '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, 'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });

let browserError = '';
browser.stderr?.on('data', (chunk) => { browserError += String(chunk); });
let socket;
let nextId = 1;
const pending = new Map();

async function debugPort() {
  const file = path.join(profile, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (existsSync(file)) {
      try {
        const value = Number.parseInt(readFileSync(file, 'utf8').split(/\r?\n/, 1)[0], 10);
        if (Number.isInteger(value) && value > 0) return value;
      } catch (error) {
        if (!['EBUSY', 'EACCES', 'EPERM'].includes(error?.code)) throw error;
      }
    }
    await delay(60);
  }
  throw new Error(`Edge debugging endpoint did not start: ${browserError.trim()}`);
}

async function retryJson(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { const response = await fetch(url); if (response.ok) return response.json(); } catch {}
    await delay(60);
  }
  throw new Error('Edge target list was unavailable');
}

function command(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`DevTools command timed out: ${method}`));
    }, 20_000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'browser evaluation failed');
  return result.result?.value;
}

const sampleExpression = `(() => {
  const canvas=document.getElementById('petAssistantParticleOrb');
  const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');
  if(!gl)return null;
  window.FeMonsterPetParticleOrb.renderOnce(performance.now());
  const width=gl.drawingBufferWidth,height=gl.drawingBufferHeight;
  const pixels=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
  let minX=width,minY=height,maxX=-1,maxY=-1,visible=0,edgePixels=0,alphaSum=0,red=0,green=0,blue=0;
  for(let y=0;y<height;y+=1){for(let x=0;x<width;x+=1){
    const offset=(y*width+x)*4,alpha=pixels[offset+3];if(alpha<=4)continue;
    const weight=alpha/255;visible+=1;alphaSum+=weight;red+=pixels[offset]*weight;green+=pixels[offset+1]*weight;blue+=pixels[offset+2]*weight;
    minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
    if(x<2||x>=width-2||y<2||y>=height-2)edgePixels+=1;
  }}
  const bbox=maxX>=minX?{width:maxX-minX+1,height:maxY-minY+1,minX,minY,maxX,maxY}:null;
  const rgb=alphaSum?[red/alphaSum,green/alphaSum,blue/alphaSum]:[0,0,0];
  const maximum=Math.max(...rgb),minimum=Math.min(...rgb),delta=maximum-minimum;
  let hue=0;if(delta>.0001){if(maximum===rgb[0])hue=60*(((rgb[1]-rgb[2])/delta)%6);else if(maximum===rgb[1])hue=60*(((rgb[2]-rgb[0])/delta)+2);else hue=60*(((rgb[0]-rgb[1])/delta)+4);if(hue<0)hue+=360}
  const saturation=maximum>0?delta/maximum:0;
  let radialRatio=1;
  if(bbox){
    const centerX=(bbox.minX+bbox.maxX)/2,centerY=(bbox.minY+bbox.maxY)/2,bins=new Float32Array(72);
    for(let y=0;y<height;y+=1){for(let x=0;x<width;x+=1){
      const offset=(y*width+x)*4;if(pixels[offset+3]<=24)continue;
      const dx=x-centerX,dy=y-centerY,distance=Math.hypot(dx,dy);
      let angle=Math.atan2(dy,dx);if(angle<0)angle+=Math.PI*2;
      const bin=Math.min(71,Math.floor(angle/(Math.PI*2)*72));if(distance>bins[bin])bins[bin]=distance;
    }}
    const radii=Array.from(bins).filter((value)=>value>0).sort((a,b)=>a-b);
    if(radii.length>=60){const p10=radii[Math.floor((radii.length-1)*.10)],p90=radii[Math.floor((radii.length-1)*.90)];radialRatio=p90/Math.max(1,p10)}
  }
  return {status:window.FeMonsterPetParticleOrb.status(),width,height,bbox,visible,edgePixels,rgb,hue,saturation,
    aspect:bbox?bbox.width/bbox.height:0,bboxArea:bbox?bbox.width*bbox.height:0,equivalentDiameter:Math.sqrt(visible*4/Math.PI),radialRatio};
})()`;

try {
  const devtoolsPort = await debugPort();
  const targets = await retryJson(`http://127.0.0.1:${devtoolsPort}/json`);
  const page = targets.find((target) => target.type === 'page');
  assert.ok(page?.webSocketDebuggerUrl, 'No Edge page target was found');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    const waiter = pending.get(message.id); if (!waiter) return;
    pending.delete(message.id); clearTimeout(waiter.timer);
    if (message.error) waiter.reject(new Error(message.error.message)); else waiter.resolve(message.result);
  });
  await Promise.all([command('Page.enable'), command('Runtime.enable')]);
  await command('Emulation.setDeviceMetricsOverride', { width: 640, height: 480, deviceScaleFactor: 1, mobile: false });
  await command('Page.navigate', { url: `http://127.0.0.1:${port}/` });
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (await evaluate(`Boolean(window.FeMonsterPetParticleOrb?.status?.().ready)`)) break;
    await delay(50);
  }
  await delay(180);
  await evaluate(`window.FeMonsterPetParticleOrb.stop(); window.__petDrawTimes.length=0`);

  const samples = [];
  const screenshots = [];
  for (let sampleIndex = 0; sampleIndex < 72; sampleIndex += 1) {
    await evaluate(`(() => { const start=performance.now(); for(let frame=0;frame<4;frame+=1) window.FeMonsterPetParticleOrb.renderOnce(start+frame*(1000/60)); })()`);
    const sample = await evaluate(sampleExpression);
    assert.ok(sample, `sample ${sampleIndex}: WebGL surface unavailable`);
    samples.push(sample);
    if (sampleIndex % 12 === 0) {
      const capture = await command('Page.captureScreenshot', { format: 'png', fromSurface: true });
      const file = path.join(artifactRoot, `pose-${String(sampleIndex / 12).padStart(2, '0')}.png`);
      writeFileSync(file, Buffer.from(capture.data, 'base64'));
      screenshots.push(file);
    }
  }

  const status = samples[0].status;
  assert.equal(status.mode, 'webgl');
  assert.equal(status.surfaceProfile, 'lavender-audio-reactive-sphere-v1');
  assert.equal(status.particleCount, 8192);
  assert.equal(status.drawCalls, 1);
  const boundarySample = samples.find((sample) => sample.edgePixels !== 0);
  assert.ok(!boundarySample, `the reconstructed surface touched a canvas boundary: ${JSON.stringify(boundarySample)}`);

  const aspects = samples.map((sample) => sample.aspect);
  const diameters = samples.map((sample) => sample.equivalentDiameter);
  const emptySampleIndex = samples.findIndex((sample) => sample.visible === 0 || !sample.bbox);
  assert.equal(emptySampleIndex, -1, `surface disappeared at deterministic sample ${emptySampleIndex}: ${JSON.stringify(samples[emptySampleIndex])}`);
  const minAspect = Math.min(...aspects), maxAspect = Math.max(...aspects);
  const diameterRatio = Math.max(...diameters) / Math.min(...diameters);
  const minAspectIndex = aspects.indexOf(minAspect), maxAspectIndex = aspects.indexOf(maxAspect);
  assert.ok(minAspect >= 0.96,
    `sphere became vertically stretched at sample ${minAspectIndex}: ${minAspect} ${JSON.stringify(samples[minAspectIndex].bbox)}`);
  assert.ok(maxAspect <= 1.04,
    `sphere became horizontally stretched at sample ${maxAspectIndex}: ${maxAspect} ${JSON.stringify(samples[maxAspectIndex].bbox)}`);
  assert.ok(diameterRatio >= 1.005 && diameterRatio <= 1.08,
    `uniform spherical breath left its bounded 0.5%-8% range: ${diameterRatio}`);

  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const medianHue = median(samples.map((sample) => sample.hue));
  const medianSaturation = median(samples.map((sample) => sample.saturation));
  assert.ok(medianHue >= 246 && medianHue <= 283, `surface is not source lavender: hue ${medianHue}`);
  assert.ok(medianSaturation >= 0.07 && medianSaturation <= 0.30, `surface saturation left the pearl-white range: ${medianSaturation}`);

  let extrema = 0;
  for (let index = 1; index < diameters.length - 1; index += 1) {
    const before = diameters[index] - diameters[index - 1];
    const after = diameters[index + 1] - diameters[index];
    if (Math.abs(before) > 0.18 && Math.abs(after) > 0.18 && Math.sign(before) !== Math.sign(after)) extrema += 1;
  }
  assert.ok(diameterRatio >= 1.01,
    `the resting sphere lost its subtle shared breath (${diameterRatio} peak/trough ratio)`);

  const idleRadialRatio = Math.max(...samples.map((sample) => sample.radialRatio));
  const audioProfiles = [];
  const audioScreenshots = [];
  for (const profile of [
    { name: 'low', snapshot: { playing: true, energy: .38, bass: .42, mid: 0, treble: 0, beat: .42 }, minimumLift: .105 },
    { name: 'mid', snapshot: { playing: true, energy: .38, bass: 0, mid: .42, treble: 0, beat: .22 }, minimumLift: .075 },
    { name: 'high', snapshot: { playing: true, energy: .38, bass: 0, mid: 0, treble: .42, beat: .32 }, minimumLift: .045 }
  ]) {
    await evaluate(`window.__petAudioSnapshot=${JSON.stringify(profile.snapshot)};(() => { const start=performance.now(); for(let frame=0;frame<180;frame+=1) window.FeMonsterPetParticleOrb.renderOnce(start+frame*(1000/60)); })()`);
    const profileSamples = [];
    let peakCaptureData = '';
    let peakRadialRatio = 0;
    for (let sampleIndex = 0; sampleIndex < 18; sampleIndex += 1) {
      await evaluate(`(() => { const start=performance.now(); for(let frame=0;frame<3;frame+=1) window.FeMonsterPetParticleOrb.renderOnce(start+frame*(1000/60)); })()`);
      const profileSample = await evaluate(sampleExpression);
      profileSamples.push(profileSample);
      if (profileSample.radialRatio > peakRadialRatio) {
        peakRadialRatio = profileSample.radialRatio;
        peakCaptureData = (await command('Page.captureScreenshot', { format: 'png', fromSurface: true })).data;
      }
    }
    const finalStatus = profileSamples.at(-1).status;
    assert.ok(finalStatus.bands[profile.name] >= .36,
      `${profile.name} frequency did not reach the renderer: ${JSON.stringify(finalStatus.bands)}`);
    assert.ok(peakRadialRatio >= idleRadialRatio + profile.minimumLift,
      `${profile.name} frequency did not visibly move the sphere surface: idle=${idleRadialRatio}, audio=${peakRadialRatio}`);
    assert.ok(peakRadialRatio <= 1.20,
      `${profile.name} frequency tore the sphere beyond its bounded radial response: ${peakRadialRatio}`);
    const audioScreenshot = path.join(artifactRoot, `audio-${profile.name}-sphere.png`);
    writeFileSync(audioScreenshot, Buffer.from(peakCaptureData, 'base64'));
    audioScreenshots.push(audioScreenshot);
    audioProfiles.push({ name: profile.name, peakRadialRatio, bands: finalStatus.bands });
  }
  await evaluate(`window.__petAudioSnapshot={playing:false,energy:0,bass:0,mid:0,treble:0,beat:0};`);

  await evaluate(`window.__petDrawTimes.length=0;window.FeMonsterPetParticleOrb.start()`);
  await delay(1600);
  await evaluate(`window.FeMonsterPetParticleOrb.stop()`);
  const drawTimes = await evaluate(`window.__petDrawTimes.slice()`);
  const measuredDuration = drawTimes.at(-1) - drawTimes[0];
  const fps = (drawTimes.length - 1) * 1000 / measuredDuration;
  const intervals = drawTimes.slice(1).map((value, index) => value - drawTimes[index]).sort((a, b) => a - b);
  const p95 = intervals[Math.floor((intervals.length - 1) * 0.95)];
  assert.ok(fps >= 55, `8192-point surface fell below display-smooth cadence: ${fps}fps`);
  assert.ok(p95 <= 20, `8192-point surface p95 frame interval regressed: ${p95}ms`);

  const report = { ok: true, status, samples: samples.length, minAspect, maxAspect, diameterRatio, extrema, idleRadialRatio, audioProfiles, medianHue, medianSaturation, fps, p95, screenshots: [...screenshots, ...audioScreenshots] };
  writeFileSync(path.join(artifactRoot, 'parity-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  try { if (socket?.readyState === WebSocket.OPEN) socket.close(); } catch {}
  try { browser.stderr?.destroy?.(); } catch {}
  if (browser?.pid) {
    if (browser.exitCode === null) browser.kill();
    spawnSync('taskkill.exe', ['/PID', String(browser.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  }
  server.closeIdleConnections?.(); server.closeAllConnections?.();
  await Promise.race([new Promise((resolve) => server.close(resolve)), delay(1000)]);
  await delay(120);
  if (profile.startsWith(`${projectRoot}${path.sep}tmp${path.sep}`) && existsSync(profile)) {
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 }); } catch {}
  }
}
