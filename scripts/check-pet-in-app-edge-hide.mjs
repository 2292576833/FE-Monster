import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runtime = readFileSync('web/pet-assistant.js', 'utf8').replace(/\r\n/g, '\n');
const css = readFileSync('web/pet-assistant.css', 'utf8').replace(/\r\n/g, '\n');

assert.match(runtime, /INITIAL_IN_APP_CLIENT[\s\S]{0,240}data-fe-client[\s\S]{0,180}embedded/,
  'edge hiding must be restricted to the installed main client');
assert.match(runtime, /EDGE_HIDE_VISIBLE_PX\s*=\s*24/,
  'edge hiding must leave a 24px wake strip');
assert.match(runtime, /EDGE_REVEAL_DISTANCE_PX\s*=\s*52/,
  'edge hiding must provide a 52px mouse wake zone');
assert.match(runtime, /function\s+edgeHideBlocked\s*\([\s\S]{0,520}pet\.panelOpen[\s\S]{0,260}pet\.liveConversationActive[\s\S]{0,260}pet\.drag[\s\S]{0,260}confirmationActive[\s\S]{0,260}is-pet-tour-guide/,
  'drag, chat, live voice, confirmation, and moving tour must protect the pet from hiding');
assert.match(runtime, /function\s+scheduleInAppEdgeHide\s*\([\s\S]{0,1000}setTimeout[\s\S]{0,600}hideInAppPetAtEdge/,
  'a grace timer must hide an idle pet at the app edge');
assert.match(runtime, /function\s+handleInAppEdgePointerMove\s*\([\s\S]{0,1100}EDGE_REVEAL_DISTANCE_PX[\s\S]{0,500}revealInAppPetFromEdge/,
  'pointer proximity to every hidden edge must reveal the pet');
assert.match(runtime, /addEventListener\('fe-monster-pet-tour-(?:start|move)'[\s\S]{0,800}revealInAppPetFromEdge/,
  'the moving product tour must reveal and protect the in-app pet');
assert.match(runtime, /addEventListener\('pointermove',\s*handleInAppEdgePointerMove/,
  'the app must listen for mouse proximity while the pet is hidden');
assert.match(runtime, /addEventListener\('lostpointercapture',\s*endDrag/,
  'lost pointer capture must finish drag and re-arm edge hiding');

for (const edge of ['left', 'right', 'top', 'bottom']) {
  assert.match(css, new RegExp(`\\.pet-assistant\\[data-in-app-edge-hidden="${edge}"\\]`),
    `${edge} edge needs a visible wake strip`);
}
assert.match(css, /--pet-edge-x[\s\S]{0,200}--pet-edge-y/,
  'edge hiding must compose independent translations with drag/tour transforms');
assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]{0,1500}data-in-app-edge-hidden[\s\S]{0,300}transition-duration:\s*\.001ms/,
  'edge hiding must remain instant and usable with reduced motion');

console.log('In-app desktop pet edge-hide contract passed.');
