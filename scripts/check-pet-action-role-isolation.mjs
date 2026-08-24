import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../web/pet-assistant.js', import.meta.url), 'utf8');

function topLevelFunction(name) {
  const markers = [`function ${name}(`, `async function ${name}(`];
  const starts = markers.map((marker) => source.indexOf(marker)).filter((index) => index >= 0);
  assert.ok(starts.length, `pet-assistant.js must define ${name}()`);
  const start = Math.min(...starts);
  const nextFunction = /\n\s{2}(?:async )?function [A-Za-z0-9_$]+\s*\(/g;
  nextFunction.lastIndex = start + 1;
  const next = nextFunction.exec(source);
  return source.slice(start, next ? next.index + 1 : source.length);
}

async function exerciseRole(clientRole, targetStreamRole) {
  const calls = { state: 0, tool: 0 };
  const pet = {
    computerId: 'same-computer',
    sessionId: 'shared-session',
    requestId: '',
    cancelledLiveRequestIds: new Set(),
    assistantMessages: new Map()
  };
  const context = vm.createContext({
    document: {
      documentElement: {
        getAttribute(name) {
          return name === 'data-fe-client' ? clientRole : '';
        }
      }
    },
    pet,
    boundedString(value, limit, fallback = '') {
      const text = String(value ?? '').trim();
      return (text || fallback).slice(0, limit);
    },
    petEventPayload(detail) { return detail?.payload || {}; },
    markTransportOnline() {},
    ensureMachineIdentity: async () => pet.computerId,
    eventMatchesSession: () => true,
    acceptEventSequence: () => true,
    touchDeepSeekLiveResponse() {},
    persistState() {},
    scheduleServerReconcile() {},
    applyServerConversationEmotion() {},
    applyStateEvent() { calls.state += 1; },
    applyDeltaEvent() {},
    applyToolEvent() { calls.tool += 1; },
    applyAudioEvent() {},
    applyCompleteEvent() {},
    applyErrorEvent() {}
  });
  vm.runInContext([
    topLevelFunction('petClientRole'),
    topLevelFunction('actionTargetsThisComputer'),
    topLevelFunction('actionTargetsThisClient'),
    topLevelFunction('handlePetServerEvent')
  ].join('\n'), context);

  assert.equal(
    context.actionTargetsThisComputer({}, { computerId: 'same-computer' }),
    true,
    'same-computer status/history sessions must remain visible without an action role'
  );

  const basePayload = {
    sessionId: 'shared-session',
    requestId: 'shared-request',
    targetComputerId: 'same-computer',
    targetStreamRole,
    sequence: 1
  };
  await context.handlePetServerEvent({ detail: { type: 'pet.ai.state', payload: basePayload } });
  await context.handlePetServerEvent({
    detail: {
      type: 'pet.ai.tool',
      payload: { ...basePayload, actionId: 'action-1', name: 'control_app' }
    }
  });
  return calls;
}

const embeddedForEmbedded = await exerciseRole('embedded', 'embedded');
const desktopForEmbedded = await exerciseRole('desktop-pet', 'embedded');
assert.equal(embeddedForEmbedded.tool, 1, 'the embedded origin must be the sole executor for its tool action');
assert.equal(desktopForEmbedded.tool, 0, 'the desktop pet must not race an embedded-origin action on the same computer');

const embeddedForDesktop = await exerciseRole('embedded', 'desktop-pet');
const desktopForDesktop = await exerciseRole('desktop-pet', 'desktop-pet');
assert.equal(embeddedForDesktop.tool, 0, 'the embedded client must not race a desktop-pet-origin action');
assert.equal(desktopForDesktop.tool, 1, 'the desktop pet origin must be the sole executor for its tool action');

for (const result of [embeddedForEmbedded, desktopForEmbedded, embeddedForDesktop, desktopForDesktop]) {
  assert.equal(result.state, 1, 'ordinary conversation state must remain visible to both stream roles');
}

console.log('Pet action stream-role isolation tests passed.');
