import { Behavior } from './Behavior.js';
import { HeliosFilter } from '../filters/HeliosFilter.js';

function cloneRules(rules = []) {
  return Array.isArray(rules)
    ? rules.map((rule) => ({
      ...rule,
      values: Array.isArray(rule?.values) ? [...rule.values] : rule?.values,
    }))
    : [];
}

function createFilterModel(options = {}) {
  if (options instanceof HeliosFilter) return options.clone();
  return new HeliosFilter({
    id: options.id,
    name: options.name,
    scope: options.scope,
    rules: cloneRules(options.rules),
  });
}

function summarizeFilter(helios, model) {
  const graphFilter = helios?.getGraphFilter?.() ?? null;
  return {
    enabled: graphFilter?.enabled === true,
    scope: model?.getScope?.() ?? graphFilter?.scope ?? 'render',
    rules: cloneRules(model?.getRules?.() ?? []),
    options: graphFilter?.options ? { ...graphFilter.options } : null,
    nodeCount: graphFilter?.nodeCount ?? null,
    edgeCount: graphFilter?.edgeCount ?? null,
    baseNodeCount: graphFilter?.baseNodeCount ?? null,
    baseEdgeCount: graphFilter?.baseEdgeCount ?? null,
    error: graphFilter?.error ?? null,
  };
}

/**
 * Built-in behavior for graph filtering.
 *
 * @public
 * @param {object|HeliosFilter} [options] - Filter model or rule options for
 * numeric, categorical, string, and query rules.
 * @returns {FilterBehavior} Behavior that applies render-only or
 * render-plus-layout filtered graph views.
 * @remarks `scope: "render"` keeps the layout topology intact; `scope:
 * "render+layout"` rebuilds the active graph view used by both rendering and
 * dynamic layouts.
 */
export class FilterBehavior extends Behavior {
  static id = 'filters';

  constructor(options = {}) {
    super(options);
    this._muteGraphSync = 0;
    this.filterModel = createFilterModel(options.filterModel ?? options);
    this.state = summarizeFilter(null, this.filterModel);
  }

  attach(context) {
    super.attach(context);
    this.syncFromHelios({ preferActiveModel: true, silent: true });
    this.addCleanup(this.context.subscribe(this.context?.helios, 'graph:filter-changed', () => {
      if (this._muteGraphSync > 0) return;
      this.syncFromHelios({ preferActiveModel: true, silent: true });
      this.emitChange('graph-filter');
    }));
    this.addCleanup(this.context.subscribe(this.context?.helios, 'network:replaced', () => {
      this.syncFromHelios({ preferActiveModel: true, silent: true });
      this.emitChange('network-replaced');
    }));
    return this;
  }

  update(options = {}) {
    super.update(options);
    if (!options || typeof options !== 'object') return this;
    if (options.filterModel instanceof HeliosFilter) {
      return this.setFilterModel(options.filterModel);
    }
    const nextModel = createFilterModel({
      id: options.id ?? this.filterModel?.id,
      name: options.name ?? this.filterModel?.name,
      scope: options.scope ?? this.filterModel?.getScope?.(),
      rules: Object.prototype.hasOwnProperty.call(options, 'rules')
        ? options.rules
        : this.filterModel?.getRules?.(),
    });
    return this.setFilterModel(nextModel, { reason: 'options' });
  }

  serialize() {
    return {
      options: {
        id: this.filterModel?.id ?? null,
        name: this.filterModel?.name ?? '',
      },
      filter: {
        scope: this.filterModel?.getScope?.() ?? 'render',
        rules: cloneRules(this.filterModel?.getRules?.() ?? []),
      },
    };
  }

  restore(snapshot = {}) {
    const filter = snapshot?.filter && typeof snapshot.filter === 'object' ? snapshot.filter : {};
    const options = snapshot?.options && typeof snapshot.options === 'object' ? snapshot.options : {};
    const restored = createFilterModel({
      id: options.id ?? this.filterModel?.id,
      name: options.name ?? this.filterModel?.name,
      scope: filter.scope ?? this.filterModel?.getScope?.(),
      rules: filter.rules ?? [],
    });
    this.setFilterModel(restored, { reason: 'restore' });
    this.emitChange('restore');
    return this;
  }

  emitChange(reason, detail = {}) {
    this.emit('change', { reason, state: this.getPublicState(), ...detail });
  }

  getPublicState() {
    return {
      ...this.state,
      rules: cloneRules(this.state.rules),
      options: this.state.options ? { ...this.state.options } : null,
    };
  }

  getModel() {
    return this.filterModel?.clone?.() ?? createFilterModel();
  }

  filters(options) {
    if (arguments.length === 0) return this.getPublicState();
    if (options == null || options === false || options?.enabled === false) return this.clear();
    if (options instanceof HeliosFilter) return this.setFilterModel(options);
    return this.update(options);
  }

  setScope(scope) {
    const next = this.getModel();
    next.setScope(scope);
    return this.setFilterModel(next, { reason: 'scope' });
  }

  /**
   * Replace all active node and edge filter rules.
   *
   * @public
   * @param {object} [options] - Replacement filter options.
   * @param {Array<object>} [options.nodeRules] - Node rules to apply.
   * @param {Array<object>} [options.edgeRules] - Edge rules to apply.
   * @param {'render'|'render+layout'} [options.scope] - Filter scope.
   * @returns {FilterBehavior} This behavior instance.
   * @remarks `render+layout` changes the graph view consumed by dynamic
   * layouts. Use `render` when hiding items should not change layout forces.
   */
  replaceRules({ nodeRules = [], edgeRules = [], scope } = {}) {
    const next = createFilterModel({
      id: this.filterModel?.id,
      name: this.filterModel?.name,
      scope: scope ?? this.filterModel?.getScope?.(),
      rules: [...cloneRules(nodeRules), ...cloneRules(edgeRules)],
    });
    return this.setFilterModel(next, { reason: 'rules' });
  }

  /**
   * Remove the active graph filter and restore the unfiltered render view.
   *
   * @public
   * @returns {FilterBehavior} This behavior instance.
   */
  clear() {
    const helios = this.context?.helios ?? null;
    this.filterModel = createFilterModel({
      id: this.filterModel?.id,
      name: this.filterModel?.name,
      scope: 'render',
      rules: [],
    });
    if (helios?.clearGraphFilter) {
      this._muteGraphSync += 1;
      try {
        helios.clearGraphFilter();
      } finally {
        this._muteGraphSync -= 1;
      }
    }
    this.state = summarizeFilter(helios, this.filterModel);
    this.emitChange('clear');
    return this;
  }

  setFilterModel(model, { reason = 'model' } = {}) {
    this.filterModel = createFilterModel(model);
    const helios = this.context?.helios ?? null;
    if (helios?.activateHeliosFilter) {
      this._muteGraphSync += 1;
      try {
        if (this.filterModel.hasCriteria()) helios.activateHeliosFilter(this.filterModel.clone());
        else helios.clearGraphFilter?.();
      } finally {
        this._muteGraphSync -= 1;
      }
    }
    this.state = summarizeFilter(helios, this.filterModel);
    this.emitChange(reason);
    return this;
  }

  syncFromHelios({ preferActiveModel = false, silent = false } = {}) {
    const helios = this.context?.helios ?? null;
    const activeModel = preferActiveModel ? (helios?.getActiveHeliosFilter?.() ?? null) : null;
    if (activeModel instanceof HeliosFilter) {
      this.filterModel = activeModel.clone();
    } else if (!this.filterModel) {
      this.filterModel = createFilterModel();
    }
    this.state = summarizeFilter(helios, this.filterModel);
    if (!silent) this.emitChange('sync');
    return this;
  }
}

export default FilterBehavior;
