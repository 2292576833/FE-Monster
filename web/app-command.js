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
  const operationReceipts = new Map();

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

  function sanitizeValue(value, depth = 0) {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') return SENSITIVE_VALUE_PATTERN.test(value) ? '[redacted]' : value.slice(0, 8_000);
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (depth >= 5) return null;
    if (Array.isArray(value)) return value.slice(0, 64).map((item) => sanitizeValue(item, depth + 1));
    if (typeof value !== 'object') return String(value).slice(0, 1_000);
    const output = Object.create(null);
    Object.entries(value).slice(0, 64).forEach(([key, item]) => {
      if (!/^[A-Za-z0-9_.-]{1,80}$/.test(key)) return;
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') return;
      if (SENSITIVE_FIELD_PATTERN.test(key.replace(/[^A-Za-z0-9]/g, ''))) return;
      output[key] = sanitizeValue(item, depth + 1);
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
    return Object.freeze({
      command: definition.command,
      operationId: operationId || null,
      replayed: replayed === true,
      reversible: definition.reversible === true,
      automatic: automatic === true
    });
  }

  function resultWithReceipt(value, receipt) {
    const safe = sanitizeValue(value ?? { ok: true });
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
      requiresConfirmation: definition.requiresConfirmation === true
        || typeof definition.requiresConfirmation === 'function'
    });
  }

  function register(definition) {
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

  function registerMany(definitions) {
    if (!Array.isArray(definitions)) throw commandError('命令目录必须是数组');
    return definitions.map(register);
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
    const safeParameters = sanitizeValue(envelope.parameters ?? envelope.arguments ?? parameters ?? {});
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
    const safeParameters = sanitizeValue(envelope.parameters ?? envelope.arguments ?? parameters ?? {});
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
      const safeResult = sanitizeValue(result ?? { ok: true });
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
      version: 2,
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
    version: 2,
    register,
    registerMany,
    execute,
    inspect,
    resolve: (name) => publicDefinition(resolve(name)),
    catalog,
    capabilities,
    normalizeName
  });
})(window);
