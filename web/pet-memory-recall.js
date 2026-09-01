(function createPetMemoryRecall(global) {
  'use strict';

  const MAXIMUM_RECORDS = 100;
  const DEFAULT_LIMITS = Object.freeze({ chats: 12, operations: 8, knowledge: 24 });
  const TEXT_FIELDS = Object.freeze([
    'text', 'title', 'value', 'action', 'status', 'commandId', 'presetId', 'songId', 'playlistId'
  ]);

  function normalizedText(value) {
    return String(value ?? '')
      .normalize('NFKC')
      .toLocaleLowerCase()
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 4_000);
  }

  function searchableText(record) {
    const payload = record?.payload && typeof record.payload === 'object' && !Array.isArray(record.payload)
      ? record.payload
      : {};
    return normalizedText([
      record?.type,
      ...TEXT_FIELDS.map((field) => payload[field])
    ].filter((value) => value !== undefined && value !== null).join(' '));
  }

  function tokens(value) {
    const text = normalizedText(value);
    const output = new Set();
    for (const word of text.match(/[a-z0-9][a-z0-9._:-]{1,63}/g) || []) output.add(word);
    for (const run of text.match(/[\u3400-\u9fff]{2,}/g) || []) {
      const bounded = run.slice(0, 160);
      for (const width of [2, 3]) {
        for (let index = 0; index + width <= bounded.length; index += 1) {
          output.add(bounded.slice(index, index + width));
        }
      }
    }
    return output;
  }

  function relevance(queryText, queryTokens, recordText) {
    if (!queryText || !recordText) return 0;
    let score = 0;
    if (queryText.length >= 4 && recordText.includes(queryText)) score += 200;
    const recordTokens = tokens(recordText);
    for (const token of queryTokens) {
      if (!recordTokens.has(token)) continue;
      score += /[\u3400-\u9fff]/.test(token) ? token.length * 6 : Math.min(18, token.length * 2);
    }
    return score;
  }

  function occurredAt(record) {
    const parsed = Date.parse(String(record?.occurredAt || record?.recordedAt || ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function boundedLimit(value, fallback) {
    const number = Math.floor(Number(value));
    if (!Number.isFinite(number)) return fallback;
    return Math.max(0, Math.min(MAXIMUM_RECORDS, number));
  }

  function rankStream(recordsValue, message, limit) {
    const records = Array.isArray(recordsValue) ? recordsValue.slice(0, MAXIMUM_RECORDS) : [];
    if (!limit || !records.length) return Object.freeze([]);
    const queryText = normalizedText(message);
    const queryTokens = tokens(queryText);
    const ranked = records.map((record, index) => ({
      record,
      index,
      time: occurredAt(record),
      score: relevance(queryText, queryTokens, searchableText(record))
    }));
    const hasRelevant = ranked.some((entry) => entry.score > 0);
    ranked.sort((left, right) => (
      (hasRelevant ? right.score - left.score : 0)
      || right.time - left.time
      || left.index - right.index
    ));
    return Object.freeze(ranked.slice(0, limit).map((entry) => entry.record));
  }

  function rank(value = {}) {
    const limits = value?.limits && typeof value.limits === 'object' ? value.limits : {};
    return Object.freeze({
      chats: rankStream(value.chats, value.message, boundedLimit(limits.chats, DEFAULT_LIMITS.chats)),
      operations: rankStream(
        value.operations,
        value.message,
        boundedLimit(limits.operations, DEFAULT_LIMITS.operations)
      ),
      knowledge: rankStream(
        value.knowledge,
        value.message,
        boundedLimit(limits.knowledge, DEFAULT_LIMITS.knowledge)
      )
    });
  }

  global.FeMonsterPetMemoryRecall = Object.freeze({ version: 1, rank });
})(window);
