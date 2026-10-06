(function createAppParameterRegistry(global) {
  'use strict';

  if (global.FeMonsterParameters) return;

  const KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{1,119}$/i;
  const OWNER_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,79}$/i;
  const SENSITIVE_PATTERN = /(?:^|[._-])(?:api[._-]?key|access[._-]?key|private[._-]?key|password|passwd|secret|credential|token|cookie|authorization|login)(?:$|[._-])/i;
  const TYPES = new Set(['boolean', 'number', 'enum', 'color', 'string']);
  const IMPACTS = new Set(['low', 'medium', 'high']);
  const records = new Map();

  function failure(message, code = 'invalid_parameter') {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function boundedText(value, maximum = 160) {
    return String(value ?? '').trim().slice(0, maximum);
  }

  function normalizeDescriptor(value, ownerOverride = '') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw failure('Invalid parameter descriptor');
    const key = boundedText(value.key, 120);
    if (!KEY_PATTERN.test(key)) throw failure('Invalid parameter key');
    if (SENSITIVE_PATTERN.test(key)) throw failure('Sensitive credential parameter keys are denied', 'sensitive_parameter');
    const owner = boundedText(ownerOverride || value.owner || 'application', 80);
    if (!OWNER_PATTERN.test(owner)) throw failure('Invalid parameter owner');
    const type = boundedText(value.type, 24).toLowerCase();
    if (!TYPES.has(type)) throw failure('Invalid parameter type');
    if (typeof value.get !== 'function' || typeof value.set !== 'function') {
      throw failure('Parameter get and set functions are required');
    }
    let range = null;
    if (type === 'number') {
      const minimum = Number(value.range?.min);
      const maximum = Number(value.range?.max);
      const step = Number(value.range?.step);
      if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || maximum < minimum
        || !Number.isFinite(step) || step <= 0) throw failure('Invalid number parameter range');
      range = Object.freeze({ min: minimum, max: maximum, step });
    }
    let options = null;
    if (type === 'enum') {
      const seen = new Set();
      options = (Array.isArray(value.options) ? value.options : []).map((option) => {
        const optionValue = boundedText(option?.value, 160);
        if (!optionValue || seen.has(optionValue)) throw failure('Invalid enum parameter option');
        seen.add(optionValue);
        return Object.freeze({ value: optionValue, label: boundedText(option?.label || optionValue, 80) });
      });
      if (!options.length) throw failure('Enum parameter options are required');
      options = Object.freeze(options);
    }
    return Object.freeze({
      key,
      owner,
      name: boundedText(value.name || key, 120),
      purpose: boundedText(value.purpose || value.name || key, 240),
      scope: boundedText(value.scope || 'appearance', 40).toLowerCase(),
      category: boundedText(value.category || value.scope || 'appearance', 40).toLowerCase(),
      preset: boundedText(value.preset || 'global', 80),
      type,
      impact: IMPACTS.has(value.impact) ? value.impact : 'low',
      available: value.available !== false,
      range,
      options,
      ...(Array.isArray(value.highImpactValues)
        ? { highImpactValues: Object.freeze(value.highImpactValues.slice(0, 32)) }
        : {}),
      requiresExplicitSelection: value.requiresExplicitSelection === true,
      ...(value.sourceProperty ? { sourceProperty: boundedText(value.sourceProperty, 120) } : {}),
      get: value.get,
      set: value.set,
      settle: typeof value.settle === 'function' ? value.settle : null
    });
  }

  function register(value, options = {}) {
    const descriptor = normalizeDescriptor(value, options.owner);
    if (records.has(descriptor.key) && options.replace !== true) {
      throw failure(`Duplicate parameter key ${descriptor.key}`, 'duplicate_parameter');
    }
    records.set(descriptor.key, descriptor);
    return descriptor;
  }

  function registerMany(values, options = {}) {
    if (!Array.isArray(values)) throw failure('Parameter descriptor list is required');
    const normalized = values.map((value) => normalizeDescriptor(value, options.owner));
    const keys = new Set();
    normalized.forEach((descriptor) => {
      if (keys.has(descriptor.key)) throw failure(`Duplicate parameter key ${descriptor.key}`, 'duplicate_parameter');
      if (records.has(descriptor.key) && options.replace !== true) {
        throw failure(`Duplicate parameter key ${descriptor.key}`, 'duplicate_parameter');
      }
      keys.add(descriptor.key);
    });
    normalized.forEach((descriptor) => records.set(descriptor.key, descriptor));
    return Object.freeze([...normalized]);
  }

  function unregisterOwner(ownerValue) {
    const owner = boundedText(ownerValue, 80);
    let removed = 0;
    for (const [key, descriptor] of records) {
      if (descriptor.owner !== owner) continue;
      records.delete(key);
      removed += 1;
    }
    return removed;
  }

  function replaceOwner(ownerValue, values) {
    const owner = boundedText(ownerValue, 80);
    if (!OWNER_PATTERN.test(owner)) throw failure('Invalid parameter owner');
    const normalized = (Array.isArray(values) ? values : []).map((value) => normalizeDescriptor(value, owner));
    const keys = new Set();
    normalized.forEach((descriptor) => {
      if (keys.has(descriptor.key)) throw failure(`Duplicate parameter key ${descriptor.key}`, 'duplicate_parameter');
      const existing = records.get(descriptor.key);
      if (existing && existing.owner !== owner) throw failure(`Duplicate parameter key ${descriptor.key}`, 'duplicate_parameter');
      keys.add(descriptor.key);
    });
    unregisterOwner(owner);
    normalized.forEach((descriptor) => records.set(descriptor.key, descriptor));
    return Object.freeze([...normalized]);
  }

  function publicDescriptor(descriptor) {
    return Object.freeze({
      key: descriptor.key,
      name: descriptor.name,
      purpose: descriptor.purpose,
      scope: descriptor.scope,
      category: descriptor.category,
      preset: descriptor.preset,
      type: descriptor.type,
      impact: descriptor.impact,
      available: descriptor.available,
      ...(descriptor.range ? { range: Object.freeze({ ...descriptor.range }) } : {}),
      ...(descriptor.options ? { options: Object.freeze(descriptor.options.map((option) => Object.freeze({ ...option }))) } : {}),
      ...(descriptor.requiresExplicitSelection ? { requiresExplicitSelection: true } : {}),
      ...(descriptor.highImpactValues ? { highImpactValues: Object.freeze([...descriptor.highImpactValues]) } : {}),
      ...(descriptor.sourceProperty ? { sourceProperty: descriptor.sourceProperty } : {})
    });
  }

  function entries() {
    return Object.freeze(Array.from(records.values()).sort((left, right) => left.key.localeCompare(right.key, 'en')));
  }

  function catalog() {
    return Object.freeze(entries().map(publicDescriptor));
  }

  function get(keyValue) {
    return records.get(boundedText(keyValue, 120)) || null;
  }

  function normalizeValue(descriptor, rawValue) {
    if (descriptor.type === 'boolean') {
      if (typeof rawValue === 'boolean') return rawValue;
      const text = boundedText(rawValue, 16).toLowerCase();
      if (['true', '1', 'on', 'yes', '开启', '打开'].includes(text)) return true;
      if (['false', '0', 'off', 'no', '关闭'].includes(text)) return false;
      throw failure('Invalid boolean parameter value');
    }
    if (descriptor.type === 'number') {
      const number = Number(rawValue);
      if (!Number.isFinite(number) || number < descriptor.range.min || number > descriptor.range.max) {
        throw failure('Number parameter value is outside the registered range');
      }
      const steps = Math.round((number - descriptor.range.min) / descriptor.range.step);
      return Number((descriptor.range.min + steps * descriptor.range.step).toFixed(9));
    }
    const text = boundedText(rawValue, 160);
    if (/(?:https?:\/\/|javascript:|<\/?script|\b(?:token|password|secret|api.?key)\b)/i.test(text)) {
      throw failure('Sensitive parameter value is denied', 'sensitive_parameter');
    }
    if (descriptor.type === 'enum') {
      if (!descriptor.options.some((option) => option.value === text)) throw failure('Invalid enum option');
    }
    if (descriptor.type === 'color' && !/^#[0-9a-f]{6}$/i.test(text)) throw failure('Invalid color value');
    return descriptor.type === 'color' ? text.toLowerCase() : text;
  }

  function sameValue(left, right) {
    return typeof left === 'number' && typeof right === 'number'
      ? Math.abs(left - right) <= 1e-7
      : Object.is(left, right);
  }

  async function apply(keyValue, rawValue, context = {}) {
    const descriptor = get(keyValue);
    if (!descriptor) throw failure('Unknown parameter key', 'unknown_parameter');
    if (!descriptor.available) throw failure('Parameter is unavailable', 'parameter_unavailable');
    if (descriptor.impact === 'high' && context.confirmed !== true) {
      throw failure('High-impact parameter requires confirmation', 'confirmation_required');
    }
    const before = normalizeValue(descriptor, descriptor.get());
    const requested = normalizeValue(descriptor, rawValue);
    if (sameValue(before, requested)) {
      return Object.freeze({ key: descriptor.key, before, after: before, changed: false });
    }
    await descriptor.set(requested, context);
    if (descriptor.settle) await descriptor.settle(context);
    const after = normalizeValue(descriptor, descriptor.get());
    if (!sameValue(after, requested)) {
      throw failure('Parameter persistence read-back did not match the requested value', 'parameter_read_back_failed');
    }
    return Object.freeze({ key: descriptor.key, before, after, changed: true });
  }

  global.FeMonsterParameters = Object.freeze({
    version: 1,
    register,
    registerMany,
    replaceOwner,
    unregisterOwner,
    entries,
    catalog,
    get,
    apply,
    normalize: (key, value) => {
      const descriptor = get(key);
      if (!descriptor) throw failure('Unknown parameter key', 'unknown_parameter');
      return normalizeValue(descriptor, value);
    }
  });
})(window);
