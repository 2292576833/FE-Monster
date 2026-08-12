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
    if (DENIED_COMMAND_PATTERNS.some((pattern) => pattern.test(name))) {
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

    const record = {
      command,
      title: String(definition.title || command).trim().slice(0, 120),
      description: String(definition.description || '').trim().slice(0, 500),
      category,
      aliases: normalizedAliases,
      parameters: sanitizeValue(definition.parameters || {}),
      requiredParameterGroups: normalizeRequiredParameterGroups(definition.requiredParameterGroups),
      readOnly: definition.readOnly === true,
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

  function inspect(commandOrEnvelope, parameters = {}, context = {}) {
    const envelope = commandOrEnvelope && typeof commandOrEnvelope === 'object'
      ? commandOrEnvelope
      : { command: commandOrEnvelope, parameters };
    const definition = resolve(envelope.command || envelope.name);
    const safeParameters = sanitizeValue(envelope.parameters ?? envelope.arguments ?? parameters ?? {});
    assertRequiredParameters(definition, safeParameters);
    const confirmation = confirmationFor(definition, safeParameters, context);
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
    if (confirmationFor(definition, safeParameters, context).required && context.confirmed !== true) {
      throw commandError(`命令 ${definition.command} 需要用户确认`, 'confirmation_required');
    }
    const eventDetail = Object.freeze({
      command: definition.command,
      category: definition.category,
      source: String(context.source || 'app').slice(0, 80)
    });
    global.dispatchEvent?.(new CustomEvent('fe-monster-app-command-start', { detail: eventDetail }));
    try {
      const result = await definition.handler(safeParameters, Object.freeze({ ...context, command: definition.command }));
      global.dispatchEvent?.(new CustomEvent('fe-monster-app-command-complete', { detail: eventDetail }));
      return sanitizeValue(result ?? { ok: true });
    } catch (error) {
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
    const commands = catalog().filter((definition) => {
      if (category && definition.category !== category) return false;
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
