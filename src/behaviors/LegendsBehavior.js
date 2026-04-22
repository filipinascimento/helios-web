import { Behavior } from './Behavior.js';

const LEGEND_KINDS = new Set(['nodeColor', 'density', 'edgeColor', 'nodeSize', 'edgeWidth']);

function cloneTitles(titles = {}) {
  const next = {};
  if (!titles || typeof titles !== 'object') return next;
  for (const [key, value] of Object.entries(titles)) {
    if (!LEGEND_KINDS.has(key)) continue;
    next[key] = value == null ? null : String(value);
  }
  return next;
}

function clonePlacements(placements = {}) {
  const next = {};
  if (!placements || typeof placements !== 'object') return next;
  for (const [key, value] of Object.entries(placements)) {
    if (!LEGEND_KINDS.has(key)) continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      next[key] = {
        x: Number(value.x ?? 0),
        y: Number(value.y ?? 0),
      };
      continue;
    }
    next[key] = value == null ? 'auto' : String(value).trim();
  }
  return next;
}

function cloneState(state = {}) {
  return {
    ...state,
    titles: cloneTitles(state.titles),
    placements: clonePlacements(state.placements),
  };
}

function normalizeConfigPatch(options = {}) {
  const next = {};
  if (!options || typeof options !== 'object') return next;

  const booleanKeys = [
    'enabled',
    'respectDockInsets',
    'illustratorCompatible',
    'zoomAwareSizeIn2D',
    'showPanel',
    'textOutline',
    'showNodeColor',
    'showDensity',
    'showEdgeColor',
    'showNodeSize',
    'showEdgeWidth',
    'scalePreviewLegends',
  ];
  for (const key of booleanKeys) {
    if (Object.prototype.hasOwnProperty.call(options, key)) next[key] = options[key] === true;
  }

  const scalarKeys = [
    'margin',
    'gap',
    'maxChars',
    'maxRows',
    'fontSize',
    'scale',
    'continuousHeight',
    'panelOpacity',
    'textOutlineWidth',
    'maxScale',
  ];
  for (const key of scalarKeys) {
    if (Object.prototype.hasOwnProperty.call(options, key)) next[key] = options[key];
  }

  if (Object.prototype.hasOwnProperty.call(options, 'fontFamily')) {
    next.fontFamily = typeof options.fontFamily === 'string' ? options.fontFamily.trim() : options.fontFamily;
  }
  if (Object.prototype.hasOwnProperty.call(options, 'titles')) {
    next.titles = cloneTitles(options.titles);
  }
  if (Object.prototype.hasOwnProperty.call(options, 'placements')) {
    next.placements = clonePlacements(options.placements);
  }

  return next;
}

export class LegendsBehavior extends Behavior {
  static id = 'legends';

  constructor(options = {}) {
    super(options);
    this.state = {
      enabled: true,
      titles: {},
      placements: {},
      ...normalizeConfigPatch(options),
    };
  }

  attach(context) {
    super.attach(context);
    const current = this.context?.helios?._getLegendsControllerConfig?.() ?? { enabled: true };
    this.state = {
      ...cloneState(current),
      ...cloneState(this.state),
      titles: {
        ...cloneTitles(current?.titles),
        ...cloneTitles(this.state?.titles),
      },
      placements: {
        ...clonePlacements(current?.placements),
        ...clonePlacements(this.state?.placements),
      },
    };
    this.applyConfig({ silent: true, reason: 'attach' });
    this.addCleanup(this.context.subscribe(this.context?.helios, 'network:replaced', () => {
      this.emitChange('network-replaced');
    }));
    return this;
  }

  update(options = {}) {
    super.update(options);
    const patch = normalizeConfigPatch(options);
    if (!Object.keys(patch).length) return this;
    this.state = {
      ...this.state,
      ...patch,
      titles: Object.prototype.hasOwnProperty.call(patch, 'titles')
        ? { ...cloneTitles(this.state.titles), ...cloneTitles(patch.titles) }
        : cloneTitles(this.state.titles),
      placements: Object.prototype.hasOwnProperty.call(patch, 'placements')
        ? { ...clonePlacements(this.state.placements), ...clonePlacements(patch.placements) }
        : clonePlacements(this.state.placements),
    };
    this.applyConfig({ silent: true, reason: 'options' });
    this.emitChange('options');
    return this;
  }

  serialize() {
    return {
      options: cloneState(this.state),
    };
  }

  restore(snapshot = {}) {
    const options = snapshot?.options && typeof snapshot.options === 'object' ? snapshot.options : {};
    this.update(options);
    this.emitChange('restore');
    return this;
  }

  getPublicState() {
    return cloneState(this.state);
  }

  emitChange(reason, detail = {}) {
    this.emit('change', { reason, state: this.getPublicState(), ...detail });
  }

  legends(options) {
    if (arguments.length === 0) return this.getPublicState();
    if (options === false || options == null) return this.update({ enabled: false });
    return this.update(options);
  }

  enabled(value) {
    if (arguments.length === 0) return this.state.enabled === true;
    return this.update({ enabled: value === true });
  }

  titles(value) {
    if (arguments.length === 0) return cloneTitles(this.state.titles);
    return this.update({ titles: value });
  }

  placements(value) {
    if (arguments.length === 0) return clonePlacements(this.state.placements);
    return this.update({ placements: value });
  }

  getLegendItems(options = {}) {
    return this.context?.helios?._getLegendItems?.({
      config: {
        ...cloneState(this.state),
        ...(options?.config && typeof options.config === 'object' ? cloneState(options.config) : {}),
      },
      size: options?.size,
      viewportHeight: options?.viewportHeight,
      projection: options?.projection,
      zoom: options?.zoom,
      distance: options?.distance,
    }) ?? [];
  }

  applyConfig({ silent = false } = {}) {
    const helios = this.context?.helios ?? null;
    helios?._applyLegendsControllerConfig?.(cloneState(this.state), { silent });
    const applied = helios?._getLegendsControllerConfig?.() ?? null;
    if (applied) this.state = cloneState(applied);
    return this;
  }
}

export default LegendsBehavior;
