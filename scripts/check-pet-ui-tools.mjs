import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const appSource = readFileSync('web/app.js', 'utf8');
const commandSource = readFileSync('web/app-command.js', 'utf8');
const start = appSource.indexOf('function createPetAssistantUiTools(');
const end = appSource.indexOf('\nconst petAssistantUiTools', start);
assert.ok(start >= 0 && end > start, 'safe UI tools factory is missing');
const factorySource = `${appSource.slice(start, end)}\nthis.createPetAssistantUiTools = createPetAssistantUiTools;`;

class FixtureKeyboardEvent {
  constructor(type, options = {}) {
    this.type = type;
    Object.assign(this, options);
  }
}

class FixtureCustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
}

class FixtureControl {
  constructor(document, { id, label, hidden = false, disabled = false, danger = false }) {
    this.ownerDocument = document;
    this.id = id;
    this.tagName = 'BUTTON';
    this.textContent = label;
    this.hidden = hidden;
    this.disabled = disabled;
    this.isConnected = true;
    this.isContentEditable = false;
    this.dataset = {};
    this.danger = danger;
    this.clicks = 0;
    this.events = [];
  }

  getAttribute(name) {
    if (name === 'aria-label') return this.textContent;
    if (name === 'role') return '';
    if (name === 'aria-hidden' || name === 'aria-disabled') return 'false';
    return '';
  }

  closest(selector) {
    if (selector.includes('[hidden]') && this.hidden) return this;
    if (selector === 'form' && this.danger) return { querySelector: () => ({}) };
    return null;
  }

  getClientRects() {
    return this.hidden ? [] : [{ left: 0, top: 0, width: 100, height: 40 }];
  }

  click() { this.clicks += 1; }

  dispatchEvent(event) {
    this.events.push(event);
    return true;
  }
}

const document = {
  hidden: false,
  visibilityState: 'visible',
  activeElement: null,
  body: null,
  documentElement: null,
  hasFocus: () => true,
  querySelectorAll: () => controls
};
const safe = new FixtureControl(document, { id: 'playButton', label: '播放' });
const dangerous = new FixtureControl(document, { id: 'deleteAccountButton', label: '删除账号' });
const hidden = new FixtureControl(document, { id: 'hiddenButton', label: '隐藏', hidden: true });
const controls = [safe, dangerous, hidden];
document.activeElement = safe;
document.body = safe;
document.documentElement = safe;

const emitted = [];
const window = {
  CustomEvent: FixtureCustomEvent,
  KeyboardEvent: FixtureKeyboardEvent,
  dispatchEvent: (event) => emitted.push(event),
  getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' })
};
const sandbox = { window, document, this: null };
sandbox.this = sandbox;
vm.runInNewContext(factorySource, sandbox, { filename: 'pet-ui-tools.fixture.js' });

const fresh = sandbox.createPetAssistantUiTools(document, window);
assert.throws(() => fresh.click({ controlId: 'control:playButton' }), /query/i,
  'clicking without a preceding safe snapshot was allowed');

const tools = sandbox.createPetAssistantUiTools(document, window);
const first = tools.query();
const second = tools.query();
assert.equal(first.controls.map((control) => control.controlId).join(','), 'control:playButton');
assert.equal(second.controls[0].controlId, first.controls[0].controlId, 'control IDs are not stable');
assert.equal(tools.click({ controlId: 'control:playButton' }).clicked, true);
assert.equal(safe.clicks, 1);

safe.hidden = true;
assert.throws(() => tools.click({ controlId: 'control:playButton' }), /visible|available/i,
  'a control hidden after the snapshot remained clickable');
safe.hidden = false;
tools.query();

assert.equal(tools.pressKey({ key: 'ArrowRight' }).key, 'ArrowRight');
assert.equal(safe.events.filter((event) => event.type === 'keydown').length, 1);
assert.throws(() => tools.pressKey({ key: 'a' }), /supported navigation key/i);
document.visibilityState = 'hidden';
assert.throws(() => tools.pressKey({ key: 'Escape' }), /focused FE Monster window/i);

assert.doesNotMatch(commandSource, /querySelector|getElementById|\.click\s*\(/,
  'generic app-command bus gained arbitrary DOM access');
assert.doesNotMatch(appSource.slice(start, end), /querySelector\s*\([^'"`]/,
  'safe UI tools use a caller-controlled selector');

console.log('Pet UI tools PASS');
