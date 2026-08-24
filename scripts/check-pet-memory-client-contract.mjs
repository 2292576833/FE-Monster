import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');

const client = read('src/main/java/com/femonster/community/CommunityClient.java');
const routes = read('src/main/java/com/femonster/api/ApiRoutes.java');
const service = read('src/community-proprietary/java/com/femonster/core/CommunityService.java');
const app = read('web/app.js');
const actions = read('web/companion-care-actions.js');

assert.match(client, /Map<String, Object>\s+petMemories\s*\(/,
  'CommunityClient does not expose the account-scoped memory query');
assert.match(client, /Map<String, Object>\s+forgetPetMemory\s*\(/,
  'CommunityClient does not expose the account-scoped memory deletion');
assert.match(client, /Map<String, Object>\s+petHabits\s*\(/,
  'CommunityClient does not expose the signed account-scoped habit query');
assert.match(client, /String\s+petPersonalizationScope\s*\(/,
  'CommunityClient cannot derive an internal personalization scope from the authenticated account');
assert.match(routes, /case\s+["']\/api\/community\/pet\/memories["']/);
assert.match(routes, /case\s+["']\/api\/community\/pet\/personalization["']/,
  'local protected personalization projection route is missing');
assert.match(routes, /case\s+["']\/api\/community\/pet\/memory\/forget["']/);
assert.match(service, /\/api\/community\/pet\/memories/);
assert.match(service, /\/api\/community\/pet\/habits/);
assert.match(service, /\/api\/community\/pet\/memory\/forget/);
assert.match(service, /appendQuery\(path,\s*["']computerId["'],\s*machine\.computerId\(\)\)/);
assert.match(service, /appendQuery\(path,\s*["']computerIdSource["'],\s*machine\.computerIdSource\(\)\)/);
assert.match(service, /PET_MEMORY_FORGET_FIELDS\s*=\s*Set\.of\(["']memoryId["']\)/,
  'memory deletion is not restricted to one exact memory ID');

assert.match(app, /communityApiJson\(`\/api\/community\/pet\/memories\?/);
assert.match(app, /communityApiJson\(`\/api\/community\/pet\/memory\/forget\?/);
assert.match(actions, /command:\s*['"]pet\.memory\.query['"]/);
assert.match(actions, /command:\s*['"]pet\.memory\.forget['"]/);
assert.doesNotMatch(actions, /memory\.query\(parameters\)|memory\.forget\(parameters\)/,
  'caller-provided account scope is forwarded wholesale to the memory adapter');

assert.match(routes, /context\.petPersonalization/,
  'ApiRoutes does not read personalization through the independent sanitized snapshot module');
const personalizationHandlerStart = routes.indexOf('private void handleCommunityPetPersonalization');
const personalizationHandlerEnd = routes.indexOf('\n    private void ', personalizationHandlerStart + 20);
assert.ok(personalizationHandlerStart >= 0 && personalizationHandlerEnd > personalizationHandlerStart,
  'personalization route handler is not inspectable');
const personalizationHandler = routes.slice(personalizationHandlerStart, personalizationHandlerEnd);
assert.doesNotMatch(personalizationHandler, /HttpUtil\.param\(query,\s*["'](?:feId|scope)["']/,
  'browser-controlled FEID/scope must not select a personalization cache');

const petAssistant = read('web/pet-assistant.js');
assert.match(petAssistant, /UNTRUSTED PET PERSONALIZATION/,
  'local model prompt does not label personalization as untrusted data');
assert.match(petAssistant, /isLoopbackEndpoint/,
  'personalization is not restricted to an on-device loopback model');
assert.match(petAssistant, /\/api\/community\/pet\/personalization/,
  'local model path never reads the protected sanitized projection');
assert.doesNotMatch(petAssistant, /clientPersonalizationConsent|sharePersonalizationWithCloud\s*=\s*true/,
  'a broad cloud-personalization consent was invented instead of failing closed');

const preferences = read('src/main/java/com/femonster/core/ClientPreferenceService.java');
assert.doesNotMatch(preferences, /pet[_-]?personalization|pet[_-]?memories|pet[_-]?habits/i,
  'pet personalization was incorrectly mixed into ClientPreference storage');

console.log(JSON.stringify({ ok: true, accountScope: 'signed FEID + computer' }, null, 2));
