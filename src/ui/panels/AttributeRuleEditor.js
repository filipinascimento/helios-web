import { AttributeType } from 'helios-network';
import { TwoHandleRange } from '../controls/TwoHandleRange.js';
import { isPublicAttributeName } from '../utils/attributes.js';

const FILTER_IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const FILTER_RANGE_EPSILON = 1e-9;

function warnUiDerivationFailure(message, detail) {
  if (!import.meta.env?.DEV) return;
  console.warn(`[AttributeRuleEditor] ${message}`, detail);
}

function isNumericAttributeType(type) {
  return type === AttributeType.Boolean
    || type === AttributeType.Float
    || type === AttributeType.Double
    || type === AttributeType.Integer
    || type === AttributeType.UnsignedInteger
    || type === AttributeType.BigInteger
    || type === AttributeType.UnsignedBigInteger;
}

function isIntegerAttributeType(type) {
  return type === AttributeType.Integer
    || type === AttributeType.UnsignedInteger
    || type === AttributeType.BigInteger
    || type === AttributeType.UnsignedBigInteger;
}

function isStringAttributeType(type) {
  return type === AttributeType.String;
}

function isCategoricalAttributeType(type) {
  return type === AttributeType.Category;
}

function parseCsvValues(text) {
  const seen = new Set();
  const out = [];
  for (const raw of String(text ?? '').split(',')) {
    const value = raw.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function formatCompactCount(value) {
  const count = Number(value);
  if (!Number.isFinite(count) || count < 0) return '';
  if (count >= 1000000) return `${Number((count / 1000000).toPrecision(3))}M`;
  if (count >= 1000) return `${Number((count / 1000).toPrecision(3))}k`;
  return String(Math.floor(count));
}

function suggestHistogramBins(count) {
  if (!Number.isFinite(count) || count <= 1) return 1;
  return Math.max(8, Math.min(40, Math.round(Math.sqrt(count))));
}

function buildHistogram(view, min, max, indices) {
  if (!view || typeof view.length !== 'number' || view.length <= 0) return null;
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;
  if (!indices || typeof indices.length !== 'number' || indices.length <= 0) return null;
  const bins = suggestHistogramBins(indices.length);
  const counts = new Array(bins).fill(0);
  const span = max - min;
  let maxCount = 0;
  let seen = 0;
  for (let i = 0; i < indices.length; i += 1) {
    const idxValue = indices[i];
    const value = Number(view[idxValue]);
    if (!Number.isFinite(value)) continue;
    let idx = Math.floor(((value - min) / span) * bins);
    if (idx < 0) idx = 0;
    if (idx >= bins) idx = bins - 1;
    const next = counts[idx] + 1;
    counts[idx] = next;
    if (next > maxCount) maxCount = next;
    seen += 1;
  }
  if (!seen || maxCount <= 0) return null;
  return { counts, maxCount };
}

function suggestStepFromExtent(extent) {
  if (!extent) return 0.01;
  if (extent.isInteger) return 1;
  const span = Math.abs(Number(extent.max) - Number(extent.min));
  if (!Number.isFinite(span) || span <= 0) return 0.01;
  return Math.max(span / 400, 1e-6);
}

function formatRangeInputValue(value, isInteger = false) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '';
  if (isInteger) return String(Math.round(numeric));
  return String(Number(numeric.toPrecision(12)));
}

function clampRangeToExtent(range, extent) {
  if (!extent) return null;
  const loRaw = Number(Array.isArray(range) ? range[0] : extent.min);
  const hiRaw = Number(Array.isArray(range) ? range[1] : extent.max);
  const lo = Number.isFinite(loRaw) ? Math.max(extent.min, Math.min(extent.max, loRaw)) : extent.min;
  const hi = Number.isFinite(hiRaw) ? Math.max(extent.min, Math.min(extent.max, hiRaw)) : extent.max;
  return lo <= hi ? [lo, hi] : [hi, lo];
}

function rangesClose(range, extent) {
  if (!Array.isArray(range) || !extent) return false;
  return Math.abs(Number(range[0]) - Number(extent.min)) <= FILTER_RANGE_EPSILON
    && Math.abs(Number(range[1]) - Number(extent.max)) <= FILTER_RANGE_EPSILON;
}

function createRuleShell(attribute, kindLabel, removeTestId, onRemove) {
  const row = document.createElement('div');
  row.style.display = 'grid';
  row.style.gap = '6px';
  row.style.padding = '8px';
  row.style.borderRadius = '10px';
  row.style.border = '1px solid var(--helios-ui-border)';
  row.style.background = 'color-mix(in srgb, var(--helios-ui-bg-solid) 88%, transparent)';

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'space-between';
  header.style.gap = '8px';

  const label = document.createElement('div');
  label.textContent = `${attribute} (${kindLabel})`;
  label.style.fontWeight = '600';
  label.style.overflowWrap = 'anywhere';
  header.appendChild(label);

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'helios-ui-button';
  removeButton.textContent = 'X';
  if (removeTestId) removeButton.dataset.testid = removeTestId;
  removeButton.addEventListener('click', onRemove);
  header.appendChild(removeButton);

  const body = document.createElement('div');
  body.style.display = 'grid';
  body.style.gap = '6px';

  row.appendChild(header);
  row.appendChild(body);
  return { row, body };
}

export function createAttributeRuleEditor(options = {}) {
  const {
    helios = null,
    scope = 'node',
    addPlaceholder = 'Add filter...',
    onDirty = null,
    testIds = {},
  } = options;

  const element = document.createElement('div');
  element.style.display = 'grid';
  element.style.gap = '8px';

  const rulesHost = document.createElement('div');
  rulesHost.style.display = 'grid';
  rulesHost.style.gap = '8px';
  element.appendChild(rulesHost);

  const addSelect = document.createElement('select');
  addSelect.className = 'helios-ui-select helios-ui-select--compact';
  addSelect.style.maxWidth = '220px';
  addSelect.style.minWidth = '160px';
  if (testIds.addSelect) addSelect.dataset.testid = testIds.addSelect;

  const state = {
    scope,
    addSelect,
    rulesHost,
    catalog: [],
    catalogByName: new Map(),
    rules: new Map(),
  };

  const markDirty = () => {
    onDirty?.();
  };

  const getNetwork = () => helios?.network ?? null;

  const getFilterableAttributes = () => {
    const network = getNetwork();
    if (!network) return [];
    const getNames = scope === 'edge'
      ? network.getEdgeAttributeNames
      : network.getNodeAttributeNames;
    const getInfo = scope === 'edge'
      ? network.getEdgeAttributeInfo
      : network.getNodeAttributeInfo;
    if (typeof getNames !== 'function' || typeof getInfo !== 'function') return [];

    const out = [];
    const names = getNames.call(network) ?? [];
    for (const name of names) {
      if (typeof name !== 'string') continue;
      if (!isPublicAttributeName(name)) continue;
      if (!FILTER_IDENTIFIER_RE.test(name)) continue;
      const info = getInfo.call(network, name);
      if (!info || info.dimension !== 1) continue;
      let type = null;
      let label = '';
      if (isNumericAttributeType(info.type)) {
        type = 'numeric';
        label = 'Numeric';
      } else if (isStringAttributeType(info.type)) {
        type = 'string';
        label = 'String';
      } else if (isCategoricalAttributeType(info.type)) {
        type = 'categorical';
        label = 'Categorical';
      }
      if (!type) continue;
      out.push({ name, type, label });
    }
    out.push({ name: '__query__', type: 'query', label: 'Query', displayName: 'Query filter' });
    out.sort((a, b) => {
      if (a.type === 'query' && b.type !== 'query') return 1;
      if (b.type === 'query' && a.type !== 'query') return -1;
      return a.name.localeCompare(b.name);
    });
    return out;
  };

  const getCategoryEntries = (attributeName) => {
    const network = getNetwork();
    if (!network || typeof attributeName !== 'string' || !attributeName) return [];
    const getter = scope === 'edge'
      ? network.getEdgeAttributeCategoryDictionary
      : network.getNodeAttributeCategoryDictionary;
    if (typeof getter !== 'function') return [];
    try {
      const dictionary = getter.call(network, attributeName, { sortById: false }) ?? {};
      const sourceEntries = Array.isArray(dictionary.entries)
        ? dictionary.entries
        : Array.isArray(dictionary.labels)
          ? dictionary.labels.map((label, index) => ({ id: dictionary.ids?.[index], label }))
          : [];
      const countsById = new Map();
      try {
        const countValues = () => {
          const buffer = scope === 'edge'
            ? network.getEdgeAttributeBuffer?.(attributeName)
            : network.getNodeAttributeBuffer?.(attributeName);
          const indices = scope === 'edge' ? network.edgeIndices : network.nodeIndices;
          const view = buffer?.view ?? null;
          if (!view || !indices || !indices.length) return;
          for (let i = 0; i < indices.length; i += 1) {
            const id = Number(view[indices[i]]);
            if (!Number.isFinite(id)) continue;
            countsById.set(id, (countsById.get(id) ?? 0) + 1);
          }
        };
        if (typeof network.withBufferAccess === 'function') network.withBufferAccess(countValues);
        else countValues();
      } catch (error) {
        warnUiDerivationFailure('Categorical count computation failed', { scope, attributeName, error });
      }

      const seen = new Set();
      const out = [];
      for (const raw of sourceEntries) {
        const label = String(raw?.label ?? raw ?? '').trim();
        if (!label || seen.has(label)) continue;
        seen.add(label);
        const id = Number(raw?.id);
        out.push({
          label,
          id: Number.isFinite(id) ? id : null,
          count: Number.isFinite(id) ? (countsById.get(id) ?? 0) : null,
        });
      }
      out.sort((a, b) => a.label.localeCompare(b.label));
      return out;
    } catch (_) {
      return [];
    }
  };

  const computeNumericExtent = (attributeName) => {
    const network = getNetwork();
    if (!network || typeof attributeName !== 'string' || !attributeName) return null;
    try {
      const getInfo = scope === 'edge'
        ? network.getEdgeAttributeInfo
        : network.getNodeAttributeInfo;
      const info = typeof getInfo === 'function' ? getInfo.call(network, attributeName) : null;
      const isInteger = Boolean(info && isIntegerAttributeType(info.type));
      const read = () => {
        const buffer = scope === 'edge'
          ? network.getEdgeAttributeBuffer?.(attributeName)
          : network.getNodeAttributeBuffer?.(attributeName);
        const indices = scope === 'edge' ? network.edgeIndices : network.nodeIndices;
        if (!indices || !indices.length) return null;
        const view = buffer?.view ?? null;
        if (!view || !view.length) return null;
        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < indices.length; i += 1) {
          const id = indices[i];
          const value = Number(view[id]);
          if (!Number.isFinite(value)) continue;
          if (value < min) min = value;
          if (value > max) max = value;
        }
        if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
        if (isInteger) {
          const minInt = Math.floor(min);
          const maxInt = Math.ceil(max);
          if (minInt === maxInt) return { min: minInt, max: minInt + 1, isInteger: true };
          return { min: minInt, max: maxInt, isInteger: true };
        }
        if (min === max) return { min, max: min + 1, isInteger: false };
        return { min, max, isInteger: false };
      };
      if (typeof network.withBufferAccess === 'function') {
        try {
          return network.withBufferAccess(read);
        } catch (error) {
          warnUiDerivationFailure('Numeric extent fallback outside buffer access', {
            scope,
            attributeName,
            error,
          });
          return read();
        }
      }
      return read();
    } catch (error) {
      warnUiDerivationFailure('Numeric extent computation failed', { scope, attributeName, error });
      return null;
    }
  };

  const createRangeHistogram = ({ attributeName, range, extent }) => {
    const network = getNetwork();
    if (!network || !extent || !attributeName) return null;
    let data = null;
    try {
      const compute = () => {
        const getBuffer = scope === 'edge'
          ? network.getEdgeAttributeBuffer
          : network.getNodeAttributeBuffer;
        if (typeof getBuffer !== 'function') return null;
        const buffer = getBuffer.call(network, attributeName);
        const indices = scope === 'edge' ? network.edgeIndices : network.nodeIndices;
        if (!indices || !indices.length) return null;
        const view = buffer?.view ?? null;
        if (!view || !view.length) return null;
        return buildHistogram(view, extent.min, extent.max, indices);
      };
      if (typeof network.withBufferAccess === 'function') {
        try {
          data = network.withBufferAccess(compute);
        } catch (error) {
          warnUiDerivationFailure('Numeric histogram fallback outside buffer access', {
            scope,
            attributeName,
            error,
          });
          data = compute();
        }
      } else {
        data = compute();
      }
    } catch (error) {
      warnUiDerivationFailure('Numeric histogram computation failed', { scope, attributeName, error });
      data = null;
    }
    if (!data) return null;

    const histogram = document.createElement('div');
    histogram.className = 'helios-ui-range2__histogram';
    for (const count of data.counts) {
      const bar = document.createElement('div');
      bar.className = 'helios-ui-range2__histogram-bin';
      bar.style.height = `${Math.max(1, Math.round((count / data.maxCount) * 100))}%`;
      histogram.appendChild(bar);
    }

    const minMarker = document.createElement('div');
    minMarker.className = 'helios-ui-range2__histogram-marker';
    const maxMarker = document.createElement('div');
    maxMarker.className = 'helios-ui-range2__histogram-marker';
    histogram.appendChild(minMarker);
    histogram.appendChild(maxMarker);

    const setMarkers = (lo, hi) => {
      const span = extent.max - extent.min;
      const toPct = (value) => {
        if (span === 0) return 0;
        const raw = (value - extent.min) / span;
        return Math.max(0, Math.min(1, raw));
      };
      const toLeft = (pct) =>
        `calc(${pct} * (100% - var(--helios-ui-range2-thumb)) + (var(--helios-ui-range2-thumb) / 2))`;
      minMarker.style.left = toLeft(toPct(lo));
      maxMarker.style.left = toLeft(toPct(hi));
    };

    setMarkers(Number(range?.[0] ?? extent.min), Number(range?.[1] ?? extent.max));
    return { element: histogram, setMarkers };
  };

  const refreshAttributeSelect = () => {
    const previous = String(addSelect.value ?? '').trim();
    addSelect.replaceChildren();
    const none = document.createElement('option');
    none.value = '';
    none.textContent = addPlaceholder;
    addSelect.appendChild(none);

    const available = state.catalog.filter((entry) => !state.rules.has(entry.name));
    for (const entry of available) {
      const option = document.createElement('option');
      option.value = entry.name;
      const display = entry.displayName ?? entry.name;
      option.textContent = `${display} (${entry.label})`;
      addSelect.appendChild(option);
    }
    addSelect.value = available.some((entry) => entry.name === previous) ? previous : '';
    addSelect.disabled = available.length === 0;
  };

  const setNumericRangeInUi = (rule, nextRange) => {
    if (!rule.extent) return;
    let clamped = clampRangeToExtent(nextRange, rule.extent);
    if (!clamped) return;
    if (rule.extent.isInteger) {
      clamped = clampRangeToExtent([Math.round(clamped[0]), Math.round(clamped[1])], rule.extent);
      if (!clamped) return;
    }
    rule.range = clamped;
    if (rule.slider) {
      rule.slider.aInput.value = String(clamped[0]);
      rule.slider.bInput.value = String(clamped[1]);
      rule.slider.setVisual(clamped[0], clamped[1]);
    }
    rule.setMarkers?.(clamped[0], clamped[1]);
    if (rule.minInput) rule.minInput.value = formatRangeInputValue(clamped[0], rule.extent.isInteger);
    if (rule.maxInput) rule.maxInput.value = formatRangeInputValue(clamped[1], rule.extent.isInteger);
  };

  const rebuildNumericRule = (rule, { resetRange = false } = {}) => {
    rule.sliderHost?.replaceChildren();
    rule.histogramHost?.replaceChildren();
    if (rule.slider) {
      rule.slider.destroy();
      rule.slider = null;
    }
    rule.setMarkers = null;
    rule.extent = computeNumericExtent(rule.attribute);
    if (!rule.extent) {
      if (rule.minInput) {
        rule.minInput.disabled = true;
        rule.minInput.value = '';
      }
      if (rule.maxInput) {
        rule.maxInput.disabled = true;
        rule.maxInput.value = '';
      }
      return;
    }

    rule.range = resetRange || !Array.isArray(rule.range)
      ? [rule.extent.min, rule.extent.max]
      : clampRangeToExtent(rule.range, rule.extent);

    if (rule.minInput) {
      rule.minInput.disabled = false;
      rule.minInput.step = rule.extent.isInteger ? '1' : 'any';
      rule.minInput.min = formatRangeInputValue(rule.extent.min, rule.extent.isInteger);
      rule.minInput.max = formatRangeInputValue(rule.extent.max, rule.extent.isInteger);
    }
    if (rule.maxInput) {
      rule.maxInput.disabled = false;
      rule.maxInput.step = rule.extent.isInteger ? '1' : 'any';
      rule.maxInput.min = formatRangeInputValue(rule.extent.min, rule.extent.isInteger);
      rule.maxInput.max = formatRangeInputValue(rule.extent.max, rule.extent.isInteger);
    }

    const slider = new TwoHandleRange({
      min: rule.extent.min,
      max: rule.extent.max,
      value: rule.range,
      step: suggestStepFromExtent(rule.extent),
      onChange: (nextRange) => {
        setNumericRangeInUi(rule, nextRange);
        markDirty();
      },
    });
    if (rule.sliderMinTestId) slider.aInput.dataset.testid = rule.sliderMinTestId;
    if (rule.sliderMaxTestId) slider.bInput.dataset.testid = rule.sliderMaxTestId;
    rule.slider = slider;
    rule.sliderHost?.appendChild(slider.element);

    const histogram = createRangeHistogram({
      attributeName: rule.attribute,
      range: rule.range,
      extent: rule.extent,
    });
    if (histogram) {
      rule.setMarkers = histogram.setMarkers;
      rule.histogramHost?.appendChild(histogram.element);
    }
    setNumericRangeInUi(rule, rule.range);
  };

  const removeRule = (attribute, { notify = true } = {}) => {
    const rule = state.rules.get(attribute);
    if (!rule) return;
    rule.slider?.destroy?.();
    rule.row?.remove?.();
    state.rules.delete(attribute);
    refreshAttributeSelect();
    if (notify) markDirty();
  };

  const refreshCategoricalRuleValues = (rule) => {
    const entries = getCategoryEntries(rule.attribute);
    const selected = new Set(Array.from(rule.listSelect?.selectedOptions ?? []).map((option) => option.value));
    rule.listSelect?.replaceChildren();
    rule.checklist?.replaceChildren();
    for (const entry of entries) {
      const label = entry.label;
      const option = document.createElement('option');
      option.value = label;
      option.textContent = label;
      if (selected.has(label)) option.selected = true;
      rule.listSelect?.appendChild(option);

      if (rule.checklist) {
        const item = document.createElement('label');
        item.className = 'helios-ui-categorical-checklist__item';
        item.dataset.value = label;

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = label;
        input.checked = selected.has(label);
        input.addEventListener('change', () => {
          const matching = Array.from(rule.listSelect?.options ?? []).find((candidate) => candidate.value === label);
          if (matching) matching.selected = input.checked;
          syncCategoricalChecklist(rule);
          markDirty();
        });
        item.appendChild(input);

        const text = document.createElement('span');
        text.className = 'helios-ui-categorical-checklist__label';
        text.textContent = label;
        item.appendChild(text);

        const count = document.createElement('span');
        count.className = 'helios-ui-categorical-checklist__count';
        count.textContent = formatCompactCount(entry.count);
        item.appendChild(count);

        rule.checklist.appendChild(item);
      }
    }
    if (rule.listSelect) {
      rule.listSelect.disabled = entries.length === 0;
      rule.listSelect.size = Math.max(2, Math.min(6, entries.length || 2));
    }
    syncCategoricalChecklist(rule);
  };

  const syncCategoricalChecklist = (rule) => {
    const selected = new Set(Array.from(rule.listSelect?.selectedOptions ?? []).map((option) => option.value));
    const options = Array.from(rule.listSelect?.options ?? []);
    const total = options.length;
    if (rule.summary) {
      rule.summary.textContent = !total
        ? 'No categories'
        : selected.size === total
          ? `All ${total} selected`
          : `${selected.size} of ${total} selected`;
    }
    for (const item of rule.checklist?.querySelectorAll?.('.helios-ui-categorical-checklist__item') ?? []) {
      const checked = selected.has(item.dataset.value);
      item.dataset.checked = checked ? 'true' : 'false';
      const input = item.querySelector('input[type="checkbox"]');
      if (input) input.checked = checked;
    }
  };

  const createNumericRule = (attribute) => {
    const shell = createRuleShell(attribute, 'Numeric', testIds.numericRemove, () => removeRule(attribute));
    const rule = {
      attribute,
      type: 'numeric',
      row: shell.row,
      extent: null,
      range: null,
      sliderHost: document.createElement('div'),
      histogramHost: document.createElement('div'),
      slider: null,
      setMarkers: null,
      minInput: null,
      maxInput: null,
      sliderMinTestId: testIds.sliderMin,
      sliderMaxTestId: testIds.sliderMax,
    };
    rule.sliderHost.style.width = '100%';
    rule.histogramHost.style.width = '100%';

    const valuesHost = document.createElement('div');
    valuesHost.className = 'helios-ui-range2__values';
    valuesHost.style.width = '100%';

    const minInput = document.createElement('input');
    minInput.type = 'number';
    minInput.className = 'helios-ui-number';
    if (testIds.minInput) minInput.dataset.testid = testIds.minInput;
    minInput.disabled = true;

    const maxInput = document.createElement('input');
    maxInput.type = 'number';
    maxInput.className = 'helios-ui-number';
    if (testIds.maxInput) maxInput.dataset.testid = testIds.maxInput;
    maxInput.disabled = true;

    rule.minInput = minInput;
    rule.maxInput = maxInput;
    valuesHost.appendChild(minInput);
    valuesHost.appendChild(maxInput);

    const commitFromInputs = () => {
      if (!rule.extent) return;
      const loRaw = Number(minInput.value);
      const hiRaw = Number(maxInput.value);
      if (!Number.isFinite(loRaw) || !Number.isFinite(hiRaw)) {
        setNumericRangeInUi(rule, rule.range ?? [rule.extent.min, rule.extent.max]);
        return;
      }
      setNumericRangeInUi(rule, [loRaw, hiRaw]);
      markDirty();
    };

    minInput.addEventListener('change', commitFromInputs);
    maxInput.addEventListener('change', commitFromInputs);
    minInput.addEventListener('blur', commitFromInputs);
    maxInput.addEventListener('blur', commitFromInputs);
    minInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      commitFromInputs();
    });
    maxInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      commitFromInputs();
    });

    shell.body.appendChild(rule.histogramHost);
    shell.body.appendChild(rule.sliderHost);
    shell.body.appendChild(valuesHost);

    rebuildNumericRule(rule, { resetRange: true });
    rulesHost.appendChild(rule.row);
    state.rules.set(attribute, rule);
    refreshAttributeSelect();
    markDirty();
  };

  const createStringRule = (attribute) => {
    const shell = createRuleShell(attribute, 'String', testIds.stringRemove, () => removeRule(attribute));
    const rule = {
      attribute,
      type: 'string',
      row: shell.row,
      operatorSelect: null,
      valueInput: null,
    };

    const operator = document.createElement('select');
    operator.className = 'helios-ui-select';
    operator.style.maxWidth = 'none';
    if (testIds.stringOperator) operator.dataset.testid = testIds.stringOperator;
    const operators = [
      { value: 'contains', label: 'Contains' },
      { value: 'starts_with', label: 'Starts with' },
      { value: 'ends_with', label: 'Ends with' },
      { value: 'regex', label: 'Regex' },
    ];
    for (const entry of operators) {
      const option = document.createElement('option');
      option.value = entry.value;
      option.textContent = entry.label;
      operator.appendChild(option);
    }

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.className = 'helios-ui-text';
    valueInput.placeholder = 'Value';
    if (testIds.stringValue) valueInput.dataset.testid = testIds.stringValue;

    operator.addEventListener('change', markDirty);
    valueInput.addEventListener('input', markDirty);

    rule.operatorSelect = operator;
    rule.valueInput = valueInput;

    shell.body.appendChild(operator);
    shell.body.appendChild(valueInput);

    rulesHost.appendChild(rule.row);
    state.rules.set(attribute, rule);
    refreshAttributeSelect();
    markDirty();
  };

  const createCategoricalRule = (attribute) => {
    const shell = createRuleShell(attribute, 'Categorical', testIds.categoricalRemove, () => removeRule(attribute));
    const rule = {
      attribute,
      type: 'categorical',
      row: shell.row,
      modeSelect: null,
      listSelect: null,
      textInput: null,
      checklist: null,
      summary: null,
    };

    const mode = document.createElement('select');
    mode.className = 'helios-ui-select';
    mode.style.maxWidth = 'none';
    if (testIds.categoricalMode) mode.dataset.testid = testIds.categoricalMode;

    const listOption = document.createElement('option');
    listOption.value = 'list';
    listOption.textContent = 'From list';
    mode.appendChild(listOption);

    const textOption = document.createElement('option');
    textOption.value = 'text';
    textOption.textContent = 'Text (comma separated)';
    mode.appendChild(textOption);

    const listSelect = document.createElement('select');
    listSelect.className = 'helios-ui-select helios-ui-categorical-select-bridge';
    listSelect.multiple = true;
    if (testIds.categoricalList) listSelect.dataset.testid = testIds.categoricalList;

    const checklistHeader = document.createElement('div');
    checklistHeader.className = 'helios-ui-categorical-checklist__header';
    const summary = document.createElement('div');
    summary.className = 'helios-ui-categorical-checklist__summary';
    checklistHeader.appendChild(summary);

    const actions = document.createElement('div');
    actions.className = 'helios-ui-categorical-checklist__actions';
    const selectAll = document.createElement('button');
    selectAll.type = 'button';
    selectAll.className = 'helios-ui-button helios-ui-button--link';
    selectAll.textContent = 'All';
    const clearAll = document.createElement('button');
    clearAll.type = 'button';
    clearAll.className = 'helios-ui-button helios-ui-button--link';
    clearAll.textContent = 'None';
    actions.appendChild(selectAll);
    actions.appendChild(clearAll);
    checklistHeader.appendChild(actions);

    const checklist = document.createElement('div');
    checklist.className = 'helios-ui-categorical-checklist';
    if (testIds.categoricalList) checklist.dataset.testid = `${testIds.categoricalList}-checklist`;

    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.className = 'helios-ui-text';
    textInput.placeholder = 'cat1, cat2';
    if (testIds.categoricalText) textInput.dataset.testid = testIds.categoricalText;
    textInput.hidden = true;

    const syncMode = () => {
      const isText = mode.value === 'text';
      checklistHeader.hidden = isText;
      checklist.hidden = isText;
      textInput.hidden = !isText;
    };

    mode.addEventListener('change', () => {
      syncMode();
      markDirty();
    });
    listSelect.addEventListener('change', () => {
      syncCategoricalChecklist(rule);
      markDirty();
    });
    textInput.addEventListener('input', markDirty);
    selectAll.addEventListener('click', () => {
      for (const option of Array.from(listSelect.options)) option.selected = true;
      syncCategoricalChecklist(rule);
      markDirty();
    });
    clearAll.addEventListener('click', () => {
      for (const option of Array.from(listSelect.options)) option.selected = false;
      syncCategoricalChecklist(rule);
      markDirty();
    });

    rule.modeSelect = mode;
    rule.listSelect = listSelect;
    rule.textInput = textInput;
    rule.checklist = checklist;
    rule.summary = summary;

    syncMode();
    refreshCategoricalRuleValues(rule);

    shell.body.appendChild(mode);
    shell.body.appendChild(checklistHeader);
    shell.body.appendChild(checklist);
    shell.body.appendChild(listSelect);
    shell.body.appendChild(textInput);

    rulesHost.appendChild(rule.row);
    state.rules.set(attribute, rule);
    refreshAttributeSelect();
    markDirty();
  };

  const createQueryRule = () => {
    const attribute = '__query__';
    const shell = createRuleShell('Query filter', 'Query', testIds.queryRemove, () => removeRule(attribute));
    const rule = {
      attribute,
      type: 'query',
      row: shell.row,
      input: null,
    };

    const queryInput = document.createElement('input');
    queryInput.type = 'text';
    queryInput.className = 'helios-ui-text';
    queryInput.placeholder = 'Query language expression';
    if (testIds.queryInput) queryInput.dataset.testid = testIds.queryInput;
    queryInput.addEventListener('input', markDirty);
    rule.input = queryInput;
    shell.body.appendChild(queryInput);

    rulesHost.appendChild(rule.row);
    state.rules.set(attribute, rule);
    refreshAttributeSelect();
    markDirty();
  };

  const addRuleForAttribute = (attribute) => {
    const name = String(attribute ?? '').trim();
    if (!name || state.rules.has(name)) return;
    const entry = state.catalogByName.get(name);
    if (!entry) return;
    if (entry.type === 'numeric') createNumericRule(name);
    else if (entry.type === 'string') createStringRule(name);
    else if (entry.type === 'categorical') createCategoricalRule(name);
    else if (entry.type === 'query') createQueryRule();
  };

  addSelect.addEventListener('change', () => {
    const attribute = String(addSelect.value ?? '').trim();
    if (!attribute) return;
    addRuleForAttribute(attribute);
    addSelect.value = '';
  });

  const refreshFromNetwork = () => {
    state.catalog = getFilterableAttributes();
    state.catalogByName = new Map(state.catalog.map((entry) => [entry.name, entry]));

    for (const attribute of Array.from(state.rules.keys())) {
      if (!state.catalogByName.has(attribute)) {
        removeRule(attribute, { notify: false });
      }
    }

    for (const rule of state.rules.values()) {
      if (rule.type === 'numeric') {
        rebuildNumericRule(rule, { resetRange: false });
      } else if (rule.type === 'categorical') {
        refreshCategoricalRuleValues(rule);
      }
    }

    refreshAttributeSelect();
  };

  const collectRules = () => {
    const rules = [];
    for (const rule of state.rules.values()) {
      if (rule.type === 'numeric') {
        if (!rule.extent || !Array.isArray(rule.range)) continue;
        if (rangesClose(rule.range, rule.extent)) continue;
        rules.push({
          id: `${scope}-${rule.attribute}`,
          scope,
          type: 'numeric',
          attribute: rule.attribute,
          min: rule.range[0],
          max: rule.range[1],
          extentMin: rule.extent.min,
          extentMax: rule.extent.max,
        });
        continue;
      }
      if (rule.type === 'string') {
        const value = String(rule.valueInput?.value ?? '').trim();
        if (!value) continue;
        rules.push({
          id: `${scope}-${rule.attribute}`,
          scope,
          type: 'string',
          attribute: rule.attribute,
          operator: String(rule.operatorSelect?.value ?? 'contains'),
          value,
        });
        continue;
      }
      if (rule.type === 'categorical') {
        const useText = String(rule.modeSelect?.value ?? 'list') === 'text';
        const values = useText
          ? parseCsvValues(rule.textInput?.value ?? '')
          : Array.from(rule.listSelect?.selectedOptions ?? []).map((option) => option.value);
        if (!values.length) continue;
        rules.push({
          id: `${scope}-${rule.attribute}`,
          scope,
          type: 'categorical',
          attribute: rule.attribute,
          values,
        });
        continue;
      }
      if (rule.type === 'query') {
        const query = String(rule.input?.value ?? '').trim();
        if (!query) continue;
        rules.push({
          id: `${scope}-query`,
          scope,
          type: 'query',
          query,
        });
      }
    }
    return rules;
  };

  const destroy = () => {
    for (const rule of state.rules.values()) {
      rule.slider?.destroy?.();
    }
    state.rules.clear();
    addSelect.remove();
    element.remove();
  };

  refreshFromNetwork();

  return {
    element,
    addSelect,
    refreshFromNetwork,
    collectRules,
    destroy,
  };
}

export default createAttributeRuleEditor;
