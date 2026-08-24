import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const appSource = fs.readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');

function extractFunctionDeclaration(source, name) {
  const signature = `function ${name}`;
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `${name} must exist in the real community runtime`);
  const bodyStart = source.indexOf('{', source.indexOf(')', start) + 1);
  assert.notEqual(bodyStart, -1, `${name} must have a function body`);

  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`${name} must have a balanced function body`);
}

function fakeClassList() {
  const values = new Set();
  return {
    add: (...names) => names.forEach((name) => values.add(name)),
    contains: (name) => values.has(name),
    toggle(name, enabled) {
      if (enabled) values.add(name);
      else values.delete(name);
      return enabled;
    },
  };
}

const communityCard = { classList: fakeClassList(), dataset: {} };
const communityStatus = { textContent: '' };
const loginCommunityName = { textContent: '' };
const dispatchedEvents = [];
class FakeCustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
}
const sandbox = {
  JSON,
  Object,
  Array,
  String,
  CustomEvent: FakeCustomEvent,
  document: {
    activeElement: null,
    createElement: () => ({ textContent: '', classList: fakeClassList() }),
  },
  window: {
    dispatchEvent: (event) => dispatchedEvents.push(event),
  },
  els: {
    communityCard,
    communityStatus,
    loginCommunityName,
  },
  state: {
    activeProvider: 'netease',
    community: {
      serverUrl: 'https://community.example.test/community',
      profileBioIdentity: '',
      friendRequests: { incoming: [], outgoing: [] },
      friendsSignature: '',
      friendRequestsSignature: '',
      mailbox: { mails: [], unreadCount: 0 },
      messageBubbles: [],
      messageBubbleSeenReady: false,
    },
  },
  providerInfo: (provider) => ({ id: provider, label: 'Test Music' }),
  safeText: (value, fallback = '') => String(value ?? fallback),
  normalizeCommunityFriendRequests: (value) => value,
  communityBioIdentity: () => 'test-identity',
  syncCommunityBioIdentity() {},
  communityFriendsSignature: () => '',
  communityFriendRequestsSignature: () => '',
  applyCommunityMailboxPayload() {},
  updateCommunityMailboxUnreadDot() {},
  syncCommunityLocalStateIdentity() {},
  rememberCommunityFriendOrnament() {},
  saveCommunityOrnamentCache() {},
  mergeCommunityTogetherReport() {},
  renderCommunityListeningStats() {},
  clearElement() {},
  createCommunityCertBadge: () => null,
  renderCommunityAvatar() {},
  currentAchievementOrnamentPayload: () => null,
  normalizeCommunityAvatarOrnament: () => null,
  scheduleCommunityAvatarOrnamentSync() {},
  renderCommunityDndButton() {},
  renderCommunityProfilePanel() {},
  renderCommunityFriends() {},
  renderCommunityFriendRequests() {},
  updateCommunityFriendListening() {},
  ensureCommunityEventStream() {},
  scheduleCommunityMessageBubblePoll() {},
  stopCommunityEventStream() {},
  renderCommunityMessageBubbles() {},
};

vm.createContext(sandbox);
vm.runInContext(extractFunctionDeclaration(appSource, 'renderCommunityState'), sandbox);

const transportError = 'community transport unreachable';
sandbox.renderCommunityState({
  ok: false,
  serverOnline: false,
  loggedIn: true,
  provider: 'netease',
  error: transportError,
  profile: {},
  friends: [],
});
assert.equal(
  communityCard.classList.contains('is-server-offline'),
  true,
  'a genuine transport outage must retain the offline class',
);
assert.equal(
  communityCard.dataset.serverState,
  'offline',
  'a genuine transport outage must retain the offline dataset state',
);
assert.match(communityStatus.textContent, /community transport unreachable/);

const registrationError = 'community device authentication rejected';
sandbox.renderCommunityState({
  ok: false,
  serverOnline: true,
  loggedIn: true,
  provider: 'netease',
  error: registrationError,
  profile: {},
  friends: [],
});
assert.equal(
  communityCard.classList.contains('is-server-offline'),
  false,
  'an online server with a registration error must not be styled as offline',
);
assert.notEqual(
  communityCard.dataset.serverState,
  'offline',
  'an online server with a registration error must not publish an offline dataset state',
);
assert.ok(
  communityStatus.textContent.includes(registrationError)
    || loginCommunityName.textContent.includes(registrationError),
  'the recoverable registration error must remain visible to the user',
);

console.log('PASS community transport state is distinct from registration failure');
