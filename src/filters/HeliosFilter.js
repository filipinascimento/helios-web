const FILTER_SCOPE_NODE = 'node';
const FILTER_SCOPE_EDGE = 'edge';
const GRAPH_FILTER_SCOPE_RENDER = 'render';
const GRAPH_FILTER_SCOPE_RENDER_LAYOUT = 'render+layout';

const FILTER_TYPE_NUMERIC = 'numeric';
const FILTER_TYPE_STRING = 'string';
const FILTER_TYPE_CATEGORICAL = 'categorical';
const FILTER_TYPE_QUERY = 'query';

const STRING_OPERATORS = new Set(['contains', 'starts_with', 'ends_with', 'regex']);
const FILTER_TYPES = new Set([
  FILTER_TYPE_NUMERIC,
  FILTER_TYPE_STRING,
  FILTER_TYPE_CATEGORICAL,
  FILTER_TYPE_QUERY,
]);

let filterRuleIdCounter = 1;

function isFilterScope(value) {
  return value === FILTER_SCOPE_NODE || value === FILTER_SCOPE_EDGE;
}

function normalizeFilterScope(value, fallback = FILTER_SCOPE_NODE) {
  const raw = String(value ?? fallback).trim().toLowerCase();
  return raw === FILTER_SCOPE_EDGE ? FILTER_SCOPE_EDGE : FILTER_SCOPE_NODE;
}

function normalizeGraphFilterScope(value, fallback = GRAPH_FILTER_SCOPE_RENDER) {
  const raw = String(value ?? fallback).trim().toLowerCase();
  if (raw === GRAPH_FILTER_SCOPE_RENDER_LAYOUT || raw === 'layout' || raw === 'render_layout') {
    return GRAPH_FILTER_SCOPE_RENDER_LAYOUT;
  }
  return GRAPH_FILTER_SCOPE_RENDER;
}

function normalizeStringOperator(value, fallback = 'contains') {
  const raw = String(value ?? fallback).trim().toLowerCase();
  if (raw === 'startswith') return 'starts_with';
  if (raw === 'endswith') return 'ends_with';
  if (!STRING_OPERATORS.has(raw)) return fallback;
  return raw;
}

function toQueryNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (numeric === 0) return '0';
  return String(Number(numeric.toPrecision(12)));
}

function quoteQueryString(value) {
  return `"${String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')}"`;
}

function escapeRegex(value) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compileNumericRule(rule) {
  const attribute = typeof rule.attribute === 'string' ? rule.attribute.trim() : '';
  if (!attribute) return null;
  let min = Number(rule.min);
  let max = Number(rule.max);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (min > max) {
    const swap = min;
    min = max;
    max = swap;
  }
  const extentMin = Number(rule.extentMin);
  const extentMax = Number(rule.extentMax);
  if (Number.isFinite(extentMin) && Number.isFinite(extentMax)) {
    const epsilon = 1e-9;
    const coversExtent = Math.abs(min - extentMin) <= epsilon && Math.abs(max - extentMax) <= epsilon;
    if (coversExtent) return null;
  }
  const lo = toQueryNumber(min);
  const hi = toQueryNumber(max);
  if (lo == null || hi == null) return null;
  return `${attribute} >= ${lo} AND ${attribute} <= ${hi}`;
}

function compileStringRule(rule) {
  const attribute = typeof rule.attribute === 'string' ? rule.attribute.trim() : '';
  if (!attribute) return null;
  const value = String(rule.value ?? '');
  if (!value.trim().length) return null;
  const operator = normalizeStringOperator(rule.operator, 'contains');
  let pattern = value;
  if (operator === 'contains') {
    pattern = `.*${escapeRegex(value)}.*`;
  } else if (operator === 'starts_with') {
    pattern = `^${escapeRegex(value)}.*`;
  } else if (operator === 'ends_with') {
    pattern = `.*${escapeRegex(value)}$`;
  }
  return `${attribute} =~ ${quoteQueryString(pattern)}`;
}

function compileCategoricalRule(rule) {
  const attribute = typeof rule.attribute === 'string' ? rule.attribute.trim() : '';
  if (!attribute) return null;
  const inputValues = Array.isArray(rule.values) ? rule.values : [];
  const values = [];
  const seen = new Set();
  for (const raw of inputValues) {
    const next = String(raw ?? '').trim();
    if (!next || seen.has(next)) continue;
    seen.add(next);
    values.push(next);
  }
  if (!values.length) return null;
  if (values.length === 1) {
    return `${attribute} == ${quoteQueryString(values[0])}`;
  }
  return `${attribute} IN (${values.map((value) => quoteQueryString(value)).join(', ')})`;
}

function compileRawQueryRule(rule) {
  const text = String(rule.query ?? '').trim();
  return text ? text : null;
}

function compileRuleToQuery(rule) {
  if (!rule || rule.enabled === false) return null;
  if (rule.type === FILTER_TYPE_NUMERIC) return compileNumericRule(rule);
  if (rule.type === FILTER_TYPE_STRING) return compileStringRule(rule);
  if (rule.type === FILTER_TYPE_CATEGORICAL) return compileCategoricalRule(rule);
  if (rule.type === FILTER_TYPE_QUERY) return compileRawQueryRule(rule);
  return null;
}

function normalizeRule(nextRule = {}) {
  if (!nextRule || typeof nextRule !== 'object') {
    throw new TypeError('HeliosFilter rule must be an object');
  }
  const type = String(nextRule.type ?? '').trim().toLowerCase();
  if (!FILTER_TYPES.has(type)) {
    throw new Error(`Unsupported HeliosFilter rule type "${type}"`);
  }
  const scope = normalizeFilterScope(nextRule.scope, FILTER_SCOPE_NODE);
  const id = typeof nextRule.id === 'string' && nextRule.id.trim()
    ? nextRule.id.trim()
    : `helios-filter-rule-${filterRuleIdCounter++}`;
  const enabled = nextRule.enabled !== false;
  if (type === FILTER_TYPE_QUERY) {
    return {
      id,
      scope,
      type,
      enabled,
      query: String(nextRule.query ?? ''),
      label: typeof nextRule.label === 'string' ? nextRule.label : '',
    };
  }
  const attribute = typeof nextRule.attribute === 'string' ? nextRule.attribute.trim() : '';
  if (!attribute) {
    throw new Error(`HeliosFilter ${type} rule requires a non-empty attribute`);
  }
  if (type === FILTER_TYPE_NUMERIC) {
    return {
      id,
      scope,
      type,
      enabled,
      attribute,
      min: Number(nextRule.min),
      max: Number(nextRule.max),
      extentMin: Number(nextRule.extentMin),
      extentMax: Number(nextRule.extentMax),
      label: typeof nextRule.label === 'string' ? nextRule.label : '',
    };
  }
  if (type === FILTER_TYPE_STRING) {
    return {
      id,
      scope,
      type,
      enabled,
      attribute,
      operator: normalizeStringOperator(nextRule.operator, 'contains'),
      value: String(nextRule.value ?? ''),
      label: typeof nextRule.label === 'string' ? nextRule.label : '',
    };
  }
  return {
    id,
    scope,
    type,
    enabled,
    attribute,
    values: Array.isArray(nextRule.values)
      ? nextRule.values.map((entry) => String(entry ?? ''))
      : [],
    label: typeof nextRule.label === 'string' ? nextRule.label : '',
  };
}

function cloneRule(rule) {
  if (!rule || typeof rule !== 'object') return null;
  const out = { ...rule };
  if (Array.isArray(rule.values)) out.values = [...rule.values];
  return out;
}

export class HeliosFilter {
  constructor(options = {}) {
    this.id = typeof options.id === 'string' && options.id.trim()
      ? options.id.trim()
      : `helios-filter-${filterRuleIdCounter++}`;
    this.name = typeof options.name === 'string' ? options.name : '';
    this.scope = normalizeGraphFilterScope(options.scope, GRAPH_FILTER_SCOPE_RENDER);
    this.rules = [];
    const initialRules = Array.isArray(options.rules) ? options.rules : [];
    for (const rule of initialRules) {
      this.addRule(rule);
    }
  }

  clone() {
    return new HeliosFilter({
      id: this.id,
      name: this.name,
      scope: this.scope,
      rules: this.rules.map((rule) => cloneRule(rule)),
    });
  }

  setScope(scope) {
    this.scope = normalizeGraphFilterScope(scope, this.scope);
    return this;
  }

  getScope() {
    return this.scope;
  }

  getRules(scope = null) {
    if (scope == null) {
      return this.rules.map((rule) => cloneRule(rule));
    }
    if (!isFilterScope(scope)) {
      throw new Error(`Unknown HeliosFilter scope "${scope}"`);
    }
    return this.rules.filter((rule) => rule.scope === scope).map((rule) => cloneRule(rule));
  }

  _assertUniqueRule(nextRule, existingRuleId = null) {
    if (!nextRule) return;
    for (const candidate of this.rules) {
      if (!candidate || candidate.id === existingRuleId) continue;
      if (candidate.scope !== nextRule.scope) continue;
      if (nextRule.type === FILTER_TYPE_QUERY && candidate.type === FILTER_TYPE_QUERY) {
        throw new Error(`Only one query filter is allowed for ${nextRule.scope}`);
      }
      if (nextRule.attribute && candidate.attribute && candidate.attribute === nextRule.attribute) {
        throw new Error(`Only one filter is allowed per attribute ("${nextRule.attribute}") on ${nextRule.scope}`);
      }
    }
  }

  addRule(rule) {
    const normalized = normalizeRule(rule);
    this._assertUniqueRule(normalized, null);
    this.rules.push(normalized);
    return cloneRule(normalized);
  }

  updateRule(ruleId, patch = {}) {
    const index = this.rules.findIndex((rule) => rule.id === ruleId);
    if (index < 0) {
      throw new Error(`Unknown HeliosFilter rule "${ruleId}"`);
    }
    const merged = { ...this.rules[index], ...patch, id: this.rules[index].id };
    const normalized = normalizeRule(merged);
    this._assertUniqueRule(normalized, ruleId);
    this.rules[index] = normalized;
    return cloneRule(normalized);
  }

  upsertRule(rule) {
    const id = typeof rule?.id === 'string' ? rule.id : null;
    if (id && this.rules.some((entry) => entry.id === id)) {
      return this.updateRule(id, rule);
    }
    return this.addRule(rule);
  }

  removeRule(ruleId) {
    const index = this.rules.findIndex((rule) => rule.id === ruleId);
    if (index < 0) return false;
    this.rules.splice(index, 1);
    return true;
  }

  clear(scope = null) {
    if (scope == null) {
      this.rules.length = 0;
      return this;
    }
    if (!isFilterScope(scope)) {
      throw new Error(`Unknown HeliosFilter scope "${scope}"`);
    }
    this.rules = this.rules.filter((rule) => rule.scope !== scope);
    return this;
  }

  compileScopeQuery(scope) {
    if (!isFilterScope(scope)) {
      throw new Error(`Unknown HeliosFilter scope "${scope}"`);
    }
    const queries = [];
    for (const rule of this.rules) {
      if (!rule || rule.scope !== scope) continue;
      const query = compileRuleToQuery(rule);
      if (!query) continue;
      queries.push(query);
    }
    if (!queries.length) return null;
    if (queries.length === 1) return queries[0];
    return queries.map((query) => `(${query})`).join(' AND ');
  }

  hasCriteria() {
    return Boolean(this.compileScopeQuery(FILTER_SCOPE_NODE) || this.compileScopeQuery(FILTER_SCOPE_EDGE));
  }

  toGraphFilterOptions() {
    const out = {
      scope: this.scope,
    };
    const nodeQuery = this.compileScopeQuery(FILTER_SCOPE_NODE);
    const edgeQuery = this.compileScopeQuery(FILTER_SCOPE_EDGE);
    if (nodeQuery) out.nodeQuery = nodeQuery;
    if (edgeQuery) out.edgeQuery = edgeQuery;
    return out;
  }
}

export const HELIOS_FILTER_SCOPE_NODE = FILTER_SCOPE_NODE;
export const HELIOS_FILTER_SCOPE_EDGE = FILTER_SCOPE_EDGE;
export const HELIOS_FILTER_TYPE_NUMERIC = FILTER_TYPE_NUMERIC;
export const HELIOS_FILTER_TYPE_STRING = FILTER_TYPE_STRING;
export const HELIOS_FILTER_TYPE_CATEGORICAL = FILTER_TYPE_CATEGORICAL;
export const HELIOS_FILTER_TYPE_QUERY = FILTER_TYPE_QUERY;
