(function initializeAppCommandBus(global) {
  'use strict';

  if (global.FeMonsterAppCommands) return;

  const registry = new Map();
  const aliases = new Map();
  const DENIED_CATEGORIES = new Set([
    'dangerous',
    'destructive',
    'code-execution',
    'credential',
    'credentials',
    'filesystem-write'
  ]);
  const DENIED_COMMAND_PATTERNS = Object.freeze([
    /(?:^|[.-])(?:shell|terminal|powershell|cmd|exec|eval|arbitrary-code)(?:$|[.-])/i,
    /(?:^|[.-])(?:script|process)(?:$|[.-])(?:run|start|spawn|execute)(?:$|[.-])/i,
    /(?:^|[.-])(?:credential|credentials|token|secret|password|passwd|cookie|authorization|(?:api|private|device|access|refresh)[.-]key)(?:$|[.-])/i,
    /^(?:filesystem|file)(?:$|[.-])/i,
    /(?:^|[.-])(?:filesystem|file)(?:$|[.-])(?:read|delete|erase|remove|write|overwrite|save|download|move|export|upload)(?:$|[.-])/i,
    /(?:^|[.-])(?:download|write|overwrite|save|delete|erase|move)(?:$|[.-])(?:filesystem|file|path)(?:$|[.-])/i,
    /(?:^|[.-])(?:account|client|app|system)(?:$|[.-])(?:delete|erase|wipe|destroy|uninstall|factory-reset)(?:$|[.-])/i,
    /(?:^|[.-])(?:shutdown|reboot|restart|format-disk)(?:$|[.-])/i,
    /(?:^|[.-])(?:purchase|payment|checkout|order|subscribe)(?:$|[.-])/i
  ]);
  const SENSITIVE_FIELD_PATTERN = /(?:password|passwd|secret|credential|token|cookie|authorization|api.?key|private.?key|device.?key|access.?key|refresh.?key|session.?key)/i;
  const SENSITIVE_VALUE_PATTERN = /(?:\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|\bsk-[A-Za-z0-9_-]{12,}|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}|\b(?:set-cookie|cookie|api[_ -]?key)\s*[:=]|[?&](?:access_?token|refresh_?token|token|api_?key|secret|password|device_?key)=[^&#\s]+)/i;
  const OPERATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
  const OPERATION_RECEIPT_TTL_MS = 30 * 60 * 1000;
  const OPERATION_RECEIPT_LIMIT = 512;
  const COMMAND_BUS_VERSION = 3;
  const COMMAND_MANIFEST_SCHEMA = 'fe-monster.pet-command-manifest/v1';
  const COMMAND_PROTOCOL_VERSION = 1;
  const COMMAND_RECEIPT_SCHEMA = 'fe-monster.app-command-receipt/v1';
  const COMMAND_UNDO_SCHEMA = 'fe-monster.app-command-undo/v1';
  const operationReceipts = new Map();
  const customCommands = new Map();
  const CUSTOM_COMMAND_PREFIX = 'pet.custom.';
  const CUSTOM_COMMAND_LIMIT = 32;
  const CUSTOM_STEP_LIMIT = 8;
  const CUSTOM_PRIVATE_COMMAND_PATTERN = /^(?:community\.(?:messages?|mailbox)\.(?:query|list)|pet\.memory\.(?:query|records\.(?:query|list)))$|^(?:account|auth|security)(?:\.|$)|^(?:settings|config)\.(?:account|auth|security)(?:\.|$)/i;
  let customCommandsInstalled = false;
  let commandManifestCache = null;

  function commandError(message, code = 'invalid_command') {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function normalizeName(value) {
    const name = String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/[\s_/\\]+/g, '.')
      .replace(/[^a-z0-9.-]/g, '')
      .replace(/\.{2,}/g, '.')
      .replace(/^\.|\.$/g, '');
    if (!name || name.length > 96) throw commandError('命令名称无效');
    return name;
  }

  function assertSafeIdentity(name, category) {
    const normalizedCategory = String(category || '').trim().toLowerCase();
    if (DENIED_CATEGORIES.has(normalizedCategory)) {
      throw commandError(`命令类别 ${normalizedCategory} 不允许由桌宠执行`, 'denied_command');
    }
    const explicitlySafeMediaLifecycle = name === 'playback.restart'
      && normalizedCategory === 'playback';
    if (!explicitlySafeMediaLifecycle && DENIED_COMMAND_PATTERNS.some((pattern) => pattern.test(name))) {
      throw commandError(`命令 ${name} 涉及受保护操作`, 'denied_command');
    }
  }

  function sanitizeValue(value, depth = 0, maxDepth = 5) {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') return SENSITIVE_VALUE_PATTERN.test(value) ? '[redacted]' : value.slice(0, 8_000);
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (depth >= maxDepth) return null;
    if (Array.isArray(value)) return value.slice(0, 64).map((item) => sanitizeValue(item, depth + 1, maxDepth));
    if (typeof value !== 'object') return String(value).slice(0, 1_000);
    const output = Object.create(null);
    Object.entries(value).slice(0, 64).forEach(([key, item]) => {
      if (!/^[A-Za-z0-9_.-]{1,80}$/.test(key)) return;
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') return;
      if (SENSITIVE_FIELD_PATTERN.test(key.replace(/[^A-Za-z0-9]/g, ''))) return;
      output[key] = sanitizeValue(item, depth + 1, maxDepth);
    });
    return output;
  }

  function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (!value || typeof value !== 'object') return value;
    const output = Object.create(null);
    Object.keys(value).sort().forEach((key) => { output[key] = stableValue(value[key]); });
    return output;
  }

  function utf8Bytes(value) {
    const bytes = [];
    const input = String(value ?? '');
    for (let index = 0; index < input.length; index += 1) {
      let codePoint = input.charCodeAt(index);
      if (codePoint >= 0xd800 && codePoint <= 0xdbff && index + 1 < input.length) {
        const low = input.charCodeAt(index + 1);
        if (low >= 0xdc00 && low <= 0xdfff) {
          codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (low - 0xdc00);
          index += 1;
        }
      }
      if (codePoint <= 0x7f) bytes.push(codePoint);
      else if (codePoint <= 0x7ff) {
        bytes.push(0xc0 | (codePoint >>> 6), 0x80 | (codePoint & 0x3f));
      } else if (codePoint <= 0xffff) {
        bytes.push(
          0xe0 | (codePoint >>> 12),
          0x80 | ((codePoint >>> 6) & 0x3f),
          0x80 | (codePoint & 0x3f)
        );
      } else {
        bytes.push(
          0xf0 | (codePoint >>> 18),
          0x80 | ((codePoint >>> 12) & 0x3f),
          0x80 | ((codePoint >>> 6) & 0x3f),
          0x80 | (codePoint & 0x3f)
        );
      }
    }
    return bytes;
  }

  function rotateRight(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }

  // Synchronous SHA-256 keeps the command manifest available to the client
  // context snapshot before any model request is sent. It is a drift checksum,
  // not an authorization primitive; command execution remains client-owned.
  function sha256Hex(value) {
    const constants = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    const bytes = utf8Bytes(value);
    const bitLength = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    const high = Math.floor(bitLength / 0x100000000);
    const low = bitLength >>> 0;
    for (let shift = 24; shift >= 0; shift -= 8) bytes.push((high >>> shift) & 0xff);
    for (let shift = 24; shift >= 0; shift -= 8) bytes.push((low >>> shift) & 0xff);

    const hash = [
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ];
    const words = new Array(64).fill(0);
    for (let offset = 0; offset < bytes.length; offset += 64) {
      for (let index = 0; index < 16; index += 1) {
        const cursor = offset + (index * 4);
        words[index] = (
          (bytes[cursor] << 24)
          | (bytes[cursor + 1] << 16)
          | (bytes[cursor + 2] << 8)
          | bytes[cursor + 3]
        );
      }
      for (let index = 16; index < 64; index += 1) {
        const left = words[index - 15];
        const right = words[index - 2];
        const sigma0 = rotateRight(left, 7) ^ rotateRight(left, 18) ^ (left >>> 3);
        const sigma1 = rotateRight(right, 17) ^ rotateRight(right, 19) ^ (right >>> 10);
        words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) | 0;
      }
      let [a, b, c, d, e, f, g, h] = hash;
      for (let index = 0; index < 64; index += 1) {
        const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
        const choice = (e & f) ^ ((~e) & g);
        const temporary1 = (h + sum1 + choice + constants[index] + words[index]) | 0;
        const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
        const majority = (a & b) ^ (a & c) ^ (b & c);
        const temporary2 = (sum0 + majority) | 0;
        h = g;
        g = f;
        f = e;
        e = (d + temporary1) | 0;
        d = c;
        c = b;
        b = a;
        a = (temporary1 + temporary2) | 0;
      }
      [a, b, c, d, e, f, g, h].forEach((value, index) => {
        hash[index] = (hash[index] + value) | 0;
      });
    }
    return hash.map((value) => (value >>> 0).toString(16).padStart(8, '0')).join('');
  }

  function operationSignature(command, parameters) {
    const semanticParameters = Object.create(null);
    Object.entries(parameters && typeof parameters === 'object' ? parameters : {}).forEach(([key, value]) => {
      if (['operationId', 'idempotencyKey', 'automatic', 'proactive'].includes(key)) return;
      semanticParameters[key] = value;
    });
    return JSON.stringify([command, stableValue(semanticParameters)]);
  }

  function operationIdFor(parameters, context = {}) {
    const raw = [
      context?.operationId,
      context?.actionId,
      context?.requestId,
      parameters?.operationId,
      parameters?.idempotencyKey
    ].find((value) => value !== undefined && value !== null && String(value).trim() !== '');
    if (raw === undefined || raw === null || String(raw).trim() === '') return '';
    const operationId = String(raw).trim();
    if (!OPERATION_ID_PATTERN.test(operationId)) {
      throw commandError('operationId 必须是 1 到 160 位字母、数字、点、下划线、冒号或连字符', 'invalid_operation_id');
    }
    return operationId;
  }

  function automaticRequestFor(parameters, context = {}) {
    return context?.automatic === true
      || context?.proactive === true
      || parameters?.automatic === true
      || parameters?.proactive === true;
  }

  function pruneOperationReceipts(now = Date.now()) {
    for (const [key, receipt] of operationReceipts) {
      if (now - receipt.createdAt > OPERATION_RECEIPT_TTL_MS) operationReceipts.delete(key);
    }
    while (operationReceipts.size > OPERATION_RECEIPT_LIMIT) {
      operationReceipts.delete(operationReceipts.keys().next().value);
    }
  }

  function commandReceipt(definition, operationId, automatic, replayed) {
    const commandManifest = manifestSummary();
    return Object.freeze({
      schema: COMMAND_RECEIPT_SCHEMA,
      protocolVersion: commandManifest.protocolVersion,
      catalogRevision: commandManifest.catalogRevision,
      command: definition.command,
      operationId: operationId || null,
      replayed: replayed === true,
      reversible: definition.reversible === true,
      automatic: automatic === true
    });
  }

  function resultWithReceipt(value, receipt) {
    const safe = sanitizeValue(value ?? { ok: true }, 0,
      receipt.command === 'app.commands.register' ? 8 : 5);
    if (safe && typeof safe === 'object' && !Array.isArray(safe)) {
      const handlerReceipt = receipt.replayed === true && safe.receipt && typeof safe.receipt === 'object'
        ? Object.freeze({ ...safe.receipt, replayed: true })
        : safe.receipt;
      return Object.freeze({
        ...safe,
        ...(handlerReceipt ? { receipt: handlerReceipt } : {}),
        commandReceipt: receipt
      });
    }
    return Object.freeze({ value: safe, commandReceipt: receipt });
  }

  function resultHasAutomaticSideEffect(result) {
    if (!result || typeof result !== 'object' || Array.isArray(result)) return true;
    const effectFlags = ['changed', 'applied', 'played', 'started', 'executed'];
    if (effectFlags.some((key) => result[key] === true)) return true;
    if (
      result.changed === false
      || result.applied === false
      || result.played === false
      || result.started === false
      || result.executed === false
    ) return false;
    const status = String(result.status || '').trim().toLowerCase().replaceAll('_', '-');
    return ![
      'unchanged', 'noop', 'no-op', 'rejected', 'suppressed', 'skipped',
      'blocked', 'cancelled', 'canceled', 'not-found', 'not-playable',
      'missing-selection-context', 'ambiguous', 'low-confidence'
    ].includes(status);
  }

  function assertExecutableUndo(definition, result, automatic) {
    if (!automatic || definition.readOnly || !definition.reversible) return;
    if (!resultHasAutomaticSideEffect(result)) return;
    const undo = result && typeof result === 'object' && !Array.isArray(result) ? result.undo : null;
    const undoCommand = undo && typeof undo === 'object' ? String(undo.command || '').trim() : '';
    const undoParameters = undo && typeof undo === 'object' ? (undo.parameters ?? undo.arguments ?? {}) : null;
    if (!undoCommand || !undoParameters || typeof undoParameters !== 'object' || Array.isArray(undoParameters)) {
      throw commandError(`自动执行命令 ${definition.command} 未返回可执行的撤销指令`, 'invalid_undo_receipt');
    }
    const undoDefinition = resolve(undoCommand);
    if (undoDefinition.readOnly === true) {
      throw commandError(`命令 ${definition.command} 的撤销指令不能是只读命令`, 'invalid_undo_receipt');
    }
    const safeUndoParameters = sanitizeValue(undoParameters);
    assertRequiredParameters(undoDefinition, safeUndoParameters);
    assertParameterTypes(undoDefinition, safeUndoParameters);
  }

  function normalizeRequiredParameterGroups(value) {
    if (!Array.isArray(value)) return [];
    return value
      .map((group) => (Array.isArray(group) ? group : [group]))
      .map((group) => Array.from(new Set(group
        .map((key) => String(key || '').trim())
        .filter((key) => /^[A-Za-z0-9_.-]{1,80}$/.test(key)))))
      .filter((group) => group.length > 0);
  }

  function assertRequiredParameters(definition, parameters) {
    const input = parameters && typeof parameters === 'object' ? parameters : {};
    const missingGroups = definition.requiredParameterGroups.filter((group) => !group.some((key) => {
      if (!Object.prototype.hasOwnProperty.call(input, key)) return false;
      const value = input[key];
      if (value === undefined || value === null) return false;
      return typeof value !== 'string' || value.trim().length > 0;
    }));
    if (!missingGroups.length) return;
    const labels = missingGroups.map((group) => group.join('/'));
    const error = commandError(
      `命令 ${definition.command} 缺少必填参数：${labels.join('、')}`,
      'missing_parameters'
    );
    error.missingParameters = missingGroups.map((group) => [...group]);
    throw error;
  }

  function assertParameterTypes(definition, parameters) {
    const input = parameters && typeof parameters === 'object' ? parameters : {};
    const booleanKeys = new Set(Object.entries(definition.parameters || {})
      .filter(([, descriptor]) => /^boolean(?:\?|\s|$)/i.test(String(descriptor || '').trim()))
      .map(([key]) => key));
    definition.requiredParameterGroups.forEach((group) => {
      if (group.some((key) => booleanKeys.has(key))) group.forEach((key) => booleanKeys.add(key));
    });
    for (const key of booleanKeys) {
      if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
      if (typeof input[key] === 'boolean') continue;
      throw commandError(`命令 ${definition.command} 的参数 ${key} 必须是布尔值`, 'invalid_parameter_type');
    }
  }

  function publicDefinition(definition) {
    return Object.freeze({
      command: definition.command,
      title: definition.title,
      description: definition.description,
      category: definition.category,
      aliases: Object.freeze([...definition.aliases]),
      parameters: Object.freeze({ ...definition.parameters }),
      requiredParameterGroups: Object.freeze(definition.requiredParameterGroups
        .map((group) => Object.freeze([...group]))),
      readOnly: definition.readOnly,
      reversible: definition.reversible,
      automaticAllowed: definition.automaticAllowed,
      ...(definition.recipeRevision ? { recipeRevision: definition.recipeRevision } : {}),
      requiresConfirmation: definition.requiresConfirmation === true
        || typeof definition.requiresConfirmation === 'function'
    });
  }

  function manifestDefinition(definition) {
    const groups = definition.requiredParameterGroups
      .map((group) => [...group].sort())
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    return Object.freeze({
      command: definition.command,
      aliases: Object.freeze([...definition.aliases].sort()),
      category: definition.category,
      parameters: Object.freeze(stableValue(definition.parameters)),
      requiredParameterGroups: Object.freeze(groups.map((group) => Object.freeze(group))),
      readOnly: definition.readOnly === true,
      reversible: definition.reversible === true,
      automaticAllowed: definition.automaticAllowed === true,
      ...(definition.recipeRevision ? { recipeRevision: definition.recipeRevision } : {}),
      requiresConfirmation: definition.requiresConfirmation === true
        || typeof definition.requiresConfirmation === 'function'
    });
  }

  function buildCommandManifest() {
    const commands = Array.from(registry.values(), manifestDefinition)
      .sort((left, right) => left.command.localeCompare(right.command));
    const semantics = Object.freeze({
      schema: COMMAND_MANIFEST_SCHEMA,
      protocolVersion: COMMAND_PROTOCOL_VERSION,
      catalogVersion: COMMAND_BUS_VERSION,
      commands: Object.freeze(commands)
    });
    const catalogRevision = `sha256:${sha256Hex(JSON.stringify(stableValue(semantics)))}`;
    const summary = Object.freeze({
      schema: COMMAND_MANIFEST_SCHEMA,
      protocolVersion: COMMAND_PROTOCOL_VERSION,
      catalogVersion: COMMAND_BUS_VERSION,
      catalogRevision,
      commandCount: commands.length,
      discoveryTool: 'query_app_capabilities',
      controlTool: 'control_app',
      confirmationAuthority: 'client-registry',
      receiptSchema: COMMAND_RECEIPT_SCHEMA,
      undoSchema: COMMAND_UNDO_SCHEMA
    });
    return Object.freeze({ summary, commands: semantics.commands });
  }

  function manifestSummary() {
    if (!commandManifestCache) commandManifestCache = buildCommandManifest();
    return commandManifestCache.summary;
  }

  function manifest() {
    if (!commandManifestCache) commandManifestCache = buildCommandManifest();
    return Object.freeze({
      ...commandManifestCache.summary,
      commands: commandManifestCache.commands
    });
  }

  function receivedManifestSummary(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return Object.freeze({
      schema: String(value.schema || '').slice(0, 120),
      protocolVersion: Math.max(0, Math.floor(Number(value.protocolVersion) || 0)),
      catalogVersion: Math.max(0, Math.floor(Number(value.catalogVersion) || 0)),
      catalogRevision: String(value.catalogRevision || '').trim().toLowerCase().slice(0, 80),
      commandCount: Math.max(0, Math.floor(Number(value.commandCount) || 0))
    });
  }

  function verifyManifest(value, options = {}) {
    const expected = manifestSummary();
    const received = receivedManifestSummary(value);
    if (!received) {
      const required = options.required !== false;
      return Object.freeze({
        ok: !required,
        verified: false,
        code: required ? 'command_manifest_missing' : 'legacy_command_manifest_unverified',
        expected,
        received: null
      });
    }
    let code = '';
    if (received.schema !== expected.schema || received.protocolVersion !== expected.protocolVersion) {
      code = 'command_protocol_mismatch';
    } else if (
      received.catalogVersion !== expected.catalogVersion
      || received.catalogRevision !== expected.catalogRevision
      || received.commandCount !== expected.commandCount
    ) {
      code = 'command_catalog_changed';
    }
    return Object.freeze({
      ok: !code,
      verified: !code,
      code,
      expected,
      received
    });
  }

  function notifyCatalogChange() {
    commandManifestCache = null;
    try {
      global.dispatchEvent?.(new CustomEvent('fe-monster-app-command-catalog-change', {
        detail: manifestSummary()
      }));
    } catch (_) {}
  }

  function registerDefinition(definition) {
    if (!definition || typeof definition !== 'object' || typeof definition.handler !== 'function') {
      throw commandError('命令注册必须包含处理函数');
    }
    const command = normalizeName(definition.command || definition.name);
    const category = String(definition.category || 'app').trim().toLowerCase();
    assertSafeIdentity(command, category);
    if (registry.has(command) || aliases.has(command)) throw commandError(`命令 ${command} 已注册`);

    const normalizedAliases = Array.from(new Set((Array.isArray(definition.aliases) ? definition.aliases : [])
      .map((alias) => normalizeName(alias))
      .filter((alias) => alias !== command)));
    normalizedAliases.forEach((alias) => {
      assertSafeIdentity(alias, category);
      if (registry.has(alias) || aliases.has(alias)) throw commandError(`命令别名 ${alias} 已注册`);
    });

    const readOnly = definition.readOnly === true;
    const reversible = definition.reversible === true;
    const automaticAllowed = definition.automaticAllowed === true || readOnly;
    if (automaticAllowed && !readOnly && !reversible) {
      throw commandError(`命令 ${command} 必须声明可逆后才能自动执行`, 'invalid_automatic_policy');
    }
    if (automaticAllowed && definition.requiresConfirmation === true) {
      throw commandError(`命令 ${command} 不能同时要求确认并允许自动执行`, 'invalid_automatic_policy');
    }

    const record = {
      command,
      title: String(definition.title || command).trim().slice(0, 120),
      description: String(definition.description || '').trim().slice(0, 500),
      category,
      aliases: normalizedAliases,
      parameters: sanitizeValue(definition.parameters || {}),
      requiredParameterGroups: normalizeRequiredParameterGroups(definition.requiredParameterGroups),
      readOnly,
      reversible,
      automaticAllowed,
      recipeRevision: definition.recipeRevision || '',
      requiresConfirmation: definition.requiresConfirmation === true
        ? true
        : typeof definition.requiresConfirmation === 'function'
          ? definition.requiresConfirmation
          : false,
      confirmationMessage: typeof definition.confirmationMessage === 'function'
        ? definition.confirmationMessage
        : String(definition.confirmationMessage || '').trim().slice(0, 300),
      handler: definition.handler
    };
    registry.set(command, record);
    normalizedAliases.forEach((alias) => aliases.set(alias, command));
    return publicDefinition(record);
  }

  function register(definition) {
    const registered = registerDefinition(definition);
    notifyCatalogChange();
    return registered;
  }

  function registerMany(definitions) {
    if (!Array.isArray(definitions)) throw commandError('命令目录必须是数组');
    const registered = [];
    try {
      definitions.forEach((definition) => registered.push(registerDefinition(definition)));
    } finally {
      if (registered.length) notifyCatalogChange();
    }
    return registered;
  }

  function normalizeCustomRecipe(input) {
    const command = normalizeName(input.command);
    if (!/^pet\.custom\.[a-z0-9][a-z0-9.-]{0,63}$/.test(command)) {
      throw commandError('自定义命令必须使用 pet.custom. 前缀和英文名称', 'invalid_custom_command');
    }
    if (!Array.isArray(input.steps) || !input.steps.length || input.steps.length > CUSTOM_STEP_LIMIT) {
      throw commandError(`自定义命令必须包含 1 到 ${CUSTOM_STEP_LIMIT} 个已有操作`, 'invalid_custom_steps');
    }
    const steps = input.steps.map((step) => {
      if (!step || typeof step !== 'object' || Array.isArray(step)) {
        throw commandError('每个操作必须包含 command 和可选 arguments', 'invalid_custom_steps');
      }
      const definition = resolve(step.command);
      if (definition.command.startsWith(CUSTOM_COMMAND_PREFIX)
        || definition.command.startsWith('app.commands.')
        || CUSTOM_PRIVATE_COMMAND_PATTERN.test(definition.command)) {
        throw commandError('自定义命令不能嵌套命令注册、其他自定义命令或私密数据操作', 'unsafe_custom_step');
      }
      const parameters = step.arguments ?? {};
      if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)
        || ['confirmed', 'automatic', 'proactive', 'operationId', 'idempotencyKey']
          .some((key) => Object.hasOwn(parameters, key))) {
        throw commandError('操作参数必须是对象，且不能自带授权或执行标识', 'invalid_custom_arguments');
      }
      const safeParameters = sanitizeValue(parameters);
      assertRequiredParameters(definition, safeParameters);
      assertParameterTypes(definition, safeParameters);
      return { command: definition.command, arguments: safeParameters };
    });
    if (JSON.stringify(steps).length > 8_000) {
      throw commandError('自定义命令参数过长', 'invalid_custom_arguments');
    }
    return {
      command,
      title: String(input.title || command).trim().slice(0, 120),
      description: String(input.description || '桌宠注册的客户端组合操作；注册不会执行操作。').trim().slice(0, 500),
      steps
    };
  }

  function registerCustomCommand(input) {
    const recipe = normalizeCustomRecipe(input);
    const recipeRevision = `sha256:${sha256Hex(JSON.stringify(stableValue(recipe.steps)))}`;
    const existing = customCommands.get(recipe.command);
    if (existing) {
      if (existing.recipeRevision !== recipeRevision) {
        throw commandError('同名自定义命令已存在，请先移除再注册，不能静默覆盖', 'custom_command_conflict');
      }
      return { changed: false, command: publicDefinition(resolve(recipe.command)), recipe: existing.recipe };
    }
    if (customCommands.size >= CUSTOM_COMMAND_LIMIT) {
      throw commandError(`最多注册 ${CUSTOM_COMMAND_LIMIT} 个自定义命令`, 'custom_command_limit');
    }
    const readOnly = recipe.steps.every((step) => resolve(step.command).readOnly);
    const assertCurrent = () => {
      if (customCommands.get(recipe.command)?.recipeRevision !== recipeRevision) {
        throw commandError('该自定义命令已移除或发生变化', 'custom_command_changed');
      }
    };
    const childContext = (context, index) => ({
      ...context,
      ...(context.operationId ? {
        operationId: `recipe:${sha256Hex(`${context.operationId}:${recipeRevision}:${index}`)}`
      } : {})
    });
    // Mutating recipes stay manual-only: registration must not grant automatic
    // execution or claim an atomic rollback across unrelated client handlers.
    const registered = registerDefinition({
      command: recipe.command, title: recipe.title, description: recipe.description,
      category: 'custom', readOnly, recipeRevision,
      requiresConfirmation: (_args, context) => recipe.steps.some((step, index) =>
        inspect(step.command, step.arguments, childContext(context, index)).requiresConfirmation),
      handler: async (_args, context) => {
        assertCurrent();
        // Validate the whole plan before any step changes the client.
        recipe.steps.forEach((step, index) => inspect(step.command, step.arguments, childContext(context, index)));
        const results = [];
        for (const [index, step] of recipe.steps.entries()) {
          try {
            assertCurrent();
            const result = await execute(step.command, step.arguments, childContext(context, index));
            if (result?.ok === false || result?.success === false
              || /^(?:error|failed|denied|blocked|cancelled|canceled|not-found|not-playable)$/.test(String(result?.status || ''))) {
              return { ok: false, status: results.length ? 'partial' : 'failed', completedSteps: results.length,
                failedStep: index + 1, result, results };
            }
            results.push(result);
          } catch (error) {
            return { ok: false, status: results.length ? 'partial' : 'failed', completedSteps: results.length,
              failedStep: index + 1, error: String(error?.message || '操作失败').slice(0, 300), results };
          }
        }
        return { ok: true, completedSteps: results.length, results };
      }
    });
    customCommands.set(recipe.command, { recipe, recipeRevision });
    notifyCatalogChange();
    return { changed: true, command: registered, recipe,
      undo: { command: 'app.commands.unregister', parameters: { command: recipe.command, recipeRevision } } };
  }

  function unregisterCustomCommand(input) {
    const command = normalizeName(input.command);
    if (!command.startsWith(CUSTOM_COMMAND_PREFIX)) {
      throw commandError('只能移除桌宠注册的自定义命令', 'invalid_custom_command');
    }
    const existing = customCommands.get(command);
    if (!existing) return { changed: false, command };
    if (input.recipeRevision !== existing.recipeRevision) {
      throw commandError('命令版本已变化，请重新查询后移除', 'custom_command_changed');
    }
    for (const [key, receipt] of operationReceipts) {
      if (key.startsWith(`${command}:`) && receipt.state === 'pending') {
        throw commandError('命令正在执行，暂时不能移除', 'custom_command_busy');
      }
    }
    customCommands.delete(command);
    registry.delete(command);
    for (const key of operationReceipts.keys()) {
      if (key.startsWith(`${command}:`)) operationReceipts.delete(key);
    }
    notifyCatalogChange();
    return { changed: true, command };
  }

  function installCustomCommands() {
    if (customCommandsInstalled) return;
    registerMany([
      {
        command: 'app.commands.register', category: 'commands', title: '注册桌宠自定义操作命令',
        description: '在当前客户端会话注册 pet.custom.* 命令。steps:[{command,arguments}] 只能组合 1–8 个已有安全命令；不会执行步骤，不能注入代码或覆盖命令。',
        parameters: { command: 'string', title: 'string?', description: 'string?', steps: 'array of {command,arguments?}' },
        requiredParameterGroups: [['command'], ['steps']], reversible: true, automaticAllowed: true,
        handler: registerCustomCommand
      },
      {
        command: 'app.commands.unregister', category: 'commands', title: '移除桌宠自定义操作命令',
        description: '仅移除版本匹配的 pet.custom.* 命令，不影响内置命令。先查询 recipeRevision。',
        parameters: { command: 'string', recipeRevision: 'string' },
        requiredParameterGroups: [['command'], ['recipeRevision']],
        handler: unregisterCustomCommand
      },
      {
        command: 'app.commands.custom.query', category: 'read', title: '读取桌宠自定义命令', readOnly: true,
        description: '列出本次客户端会话的自定义命令；传 command 可查看该命令的全部步骤和版本。',
        parameters: { command: 'string?' },
        handler: (args) => {
          if (args.command) {
            const entry = customCommands.get(normalizeName(args.command));
            if (!entry) throw commandError('未找到该自定义命令', 'unsupported_command');
            return { ...entry.recipe, recipeRevision: entry.recipeRevision, persistence: 'session' };
          }
          return { commands: Array.from(customCommands.values(), (entry) => ({
            command: entry.recipe.command, title: entry.recipe.title,
            recipeRevision: entry.recipeRevision, stepCount: entry.recipe.steps.length
          })), total: customCommands.size, persistence: 'session' };
        }
      }
    ]);
    customCommandsInstalled = true;
  }

  function resolve(value) {
    const requested = normalizeName(value);
    const command = aliases.get(requested) || requested;
    const definition = registry.get(command);
    if (!definition) throw commandError(`当前客户端不支持命令 ${requested}`, 'unsupported_command');
    assertSafeIdentity(definition.command, definition.category);
    return definition;
  }

  function confirmationFor(definition, parameters, context = {}) {
    const commandContext = Object.freeze({ ...context, command: definition.command });
    const definitionRequiresConfirmation = typeof definition.requiresConfirmation === 'function'
      ? definition.requiresConfirmation(parameters, commandContext) === true
      : definition.requiresConfirmation === true;
    const taintedByExternalContent = context?.taintedByExternalContent === true
      || context?.sourceTrust === 'untrusted-external-web';
    // `readOnly` comes only from the registered local command definition. Never
    // accept a model/server payload field claiming that a mutating command is read-only.
    const required = definitionRequiresConfirmation
      || (taintedByExternalContent && definition.readOnly !== true);
    let message = definition.confirmationMessage;
    if (typeof message === 'function') message = message(parameters, commandContext);
    return Object.freeze({
      required,
      message: String(message || definition.description || definition.title).trim().slice(0, 300)
    });
  }

  function assertAutomaticPolicy(definition, parameters, context, confirmation) {
    const automatic = automaticRequestFor(parameters, context);
    if (!automatic) return false;
    if (definition.automaticAllowed !== true || confirmation.required === true) {
      throw commandError(`命令 ${definition.command} 不允许由桌宠主动执行`, 'automatic_not_allowed');
    }
    if (!definition.readOnly && !operationIdFor(parameters, context)) {
      throw commandError(`自动执行命令 ${definition.command} 必须提供 operationId`, 'missing_operation_id');
    }
    return true;
  }

  function inspect(commandOrEnvelope, parameters = {}, context = {}) {
    const envelope = commandOrEnvelope && typeof commandOrEnvelope === 'object'
      ? commandOrEnvelope
      : { command: commandOrEnvelope, parameters };
    const definition = resolve(envelope.command || envelope.name);
    const safeParameters = sanitizeValue(envelope.parameters ?? envelope.arguments ?? parameters ?? {}, 0,
      definition.command === 'app.commands.register' ? 8 : 5);
    assertRequiredParameters(definition, safeParameters);
    assertParameterTypes(definition, safeParameters);
    const confirmation = confirmationFor(definition, safeParameters, context);
    assertAutomaticPolicy(definition, safeParameters, context, confirmation);
    return Object.freeze({
      ...publicDefinition(definition),
      requiresConfirmation: confirmation.required,
      confirmationMessage: confirmation.message
    });
  }

  async function execute(commandOrEnvelope, parameters = {}, context = {}) {
    const envelope = commandOrEnvelope && typeof commandOrEnvelope === 'object'
      ? commandOrEnvelope
      : { command: commandOrEnvelope, parameters };
    const definition = resolve(envelope.command || envelope.name);
    const safeParameters = sanitizeValue(envelope.parameters ?? envelope.arguments ?? parameters ?? {}, 0,
      definition.command === 'app.commands.register' ? 8 : 5);
    assertRequiredParameters(definition, safeParameters);
    assertParameterTypes(definition, safeParameters);
    const confirmation = confirmationFor(definition, safeParameters, context);
    const automatic = assertAutomaticPolicy(definition, safeParameters, context, confirmation);
    if (confirmation.required && context.confirmed !== true) {
      throw commandError(`命令 ${definition.command} 需要用户确认`, 'confirmation_required');
    }
    const operationId = definition.readOnly ? '' : operationIdFor(safeParameters, context);
    const operationKey = operationId ? `${definition.command}:${operationId}` : '';
    const signature = operationKey ? operationSignature(definition.command, safeParameters) : '';
    if (operationKey) {
      pruneOperationReceipts();
      const existing = operationReceipts.get(operationKey);
      if (existing) {
        if (existing.signature !== signature) {
          throw commandError(`operationId ${operationId} 已被不同参数使用`, 'idempotency_conflict');
        }
        if (existing.state === 'pending') {
          const pendingResult = await existing.promise;
          return resultWithReceipt(pendingResult, commandReceipt(definition, operationId, automatic, true));
        }
        if (existing.state === 'rejected') {
          throw commandError(existing.message, existing.code);
        }
        return resultWithReceipt(existing.result, commandReceipt(definition, operationId, automatic, true));
      }
    }
    const eventDetail = Object.freeze({
      command: definition.command,
      category: definition.category,
      source: String(context.source || 'app').slice(0, 80)
    });
    global.dispatchEvent?.(new CustomEvent('fe-monster-app-command-start', { detail: eventDetail }));
    const invoke = Promise.resolve().then(() => definition.handler(
      safeParameters,
      Object.freeze({ ...context, command: definition.command, operationId: operationId || undefined, automatic })
    ));
    if (operationKey) {
      operationReceipts.set(operationKey, {
        state: 'pending', signature, createdAt: Date.now(), promise: invoke
      });
    }
    try {
      const result = await invoke;
      const safeResult = sanitizeValue(result ?? { ok: true }, 0,
        ['app.commands.register', 'app.commands.custom.query'].includes(definition.command) ? 8 : 5);
      assertExecutableUndo(definition, safeResult, automatic);
      if (operationKey) {
        operationReceipts.set(operationKey, {
          state: 'resolved', signature, createdAt: Date.now(), result: safeResult
        });
      }
      global.dispatchEvent?.(new CustomEvent('fe-monster-app-command-complete', { detail: eventDetail }));
      if (definition.readOnly) return safeResult;
      return resultWithReceipt(safeResult, commandReceipt(definition, operationId, automatic, false));
    } catch (error) {
      if (operationKey) {
        operationReceipts.set(operationKey, {
          state: 'rejected', signature, createdAt: Date.now(),
          code: String(error?.code || 'command_failed').slice(0, 80),
          message: String(error?.message || '命令执行失败').slice(0, 300)
        });
      }
      global.dispatchEvent?.(new CustomEvent('fe-monster-app-command-error', {
        detail: Object.freeze({ ...eventDetail, code: String(error?.code || 'command_failed').slice(0, 80) })
      }));
      throw error;
    }
  }

  function catalog() {
    return Array.from(registry.values(), publicDefinition);
  }

  function capabilities(options = {}) {
    const query = String(options?.query || options?.keyword || '').trim().toLocaleLowerCase().slice(0, 120);
    const category = String(options?.category || '').trim().toLocaleLowerCase().slice(0, 80);
    const automaticOnly = options?.automaticOnly === true || options?.automatic === true;
    const commands = catalog().filter((definition) => {
      if (category && definition.category !== category) return false;
      if (automaticOnly && definition.automaticAllowed !== true) return false;
      if (!query) return true;
      return [
        definition.command,
        definition.title,
        definition.description,
        definition.category,
        ...definition.aliases
      ].some((value) => String(value || '').toLocaleLowerCase().includes(query));
    });
    const cursorValue = Number(options?.cursor);
    const limitValue = Number(options?.limit);
    const cursor = Math.max(0, Math.min(commands.length, Number.isFinite(cursorValue) ? Math.floor(cursorValue) : 0));
    const limit = Math.max(1, Math.min(20, Number.isFinite(limitValue) ? Math.floor(limitValue) : 12));
    const page = commands.slice(cursor, cursor + limit);
    return Object.freeze({
      version: COMMAND_BUS_VERSION,
      manifest: manifestSummary(),
      commands: Object.freeze(page),
      total: commands.length,
      cursor,
      limit,
      nextCursor: cursor + page.length < commands.length ? String(cursor + page.length) : null,
      defaultPolicy: 'allow-registered',
      deniedCategories: Object.freeze(Array.from(DENIED_CATEGORIES)),
      arbitraryCode: false,
      shell: false,
      localConfirmation: true
    });
  }

  global.FeMonsterAppCommands = Object.freeze({
    version: COMMAND_BUS_VERSION,
    protocolVersion: COMMAND_PROTOCOL_VERSION,
    register,
    registerMany,
    installCustomCommands,
    execute,
    inspect,
    resolve: (name) => publicDefinition(resolve(name)),
    catalog,
    capabilities,
    manifest,
    manifestSummary,
    verifyManifest,
    normalizeName
  });
})(window);
