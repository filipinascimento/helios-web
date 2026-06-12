import { Behavior } from './Behavior.js';
import {
  cloneMapperSnapshot,
  restoreChannelConfig,
  restoreMapperCollection,
  serializeChannelConfig,
  serializeMapperCollection,
} from './mapperBehaviorShared.js';
import { shallowCloneChannelConfig } from '../ui/utils/channelConfig.js';

function snapshotState(helios) {
  return {
    node: serializeMapperCollection(helios?.nodeMapper),
    edge: serializeMapperCollection(helios?.edgeMapper),
  };
}

function cloneCollectionSnapshot(snapshot) {
  return snapshot ? cloneMapperSnapshot(snapshot) : { mode: null, defaultId: null, mappers: {} };
}

function cloneBehaviorState(state) {
  return {
    node: cloneCollectionSnapshot(state?.node),
    edge: cloneCollectionSnapshot(state?.edge),
  };
}

function getCollection(helios, mode) {
  return mode === 'edge' ? helios?.edgeMapper ?? null : helios?.nodeMapper ?? null;
}

const MAPPER_CHANNEL_ENTRIES = Object.freeze({
  node: Object.freeze({
    color: 'Node Color',
    size: 'Node Size',
    opacity: 'Node Opacity',
    outline: 'Node Outline',
    outlineColor: 'Node Outline Color',
    position: 'Node Position',
  }),
  edge: Object.freeze({
    color: 'Edge Color',
    width: 'Edge Width',
    opacity: 'Edge Opacity',
  }),
});

function createSharedChangeSubscribe(behavior) {
  const listeners = new Set();
  let cleanup = null;
  return (notify) => {
    if (typeof notify !== 'function') return () => {};
    listeners.add(notify);
    if (!cleanup) {
      cleanup = behavior.on('change', (event) => {
        const detail = event?.detail ?? event ?? {};
        for (const listener of listeners) listener(undefined, { ...detail, trackOverride: false });
      });
    }
    return () => {
      listeners.delete(notify);
      if (listeners.size === 0) {
        cleanup?.();
        cleanup = null;
      }
    };
  };
}

/**
 * Built-in behavior for node and edge visual mappers.
 *
 * @public
 * @param {object} [options] - Serializable node/edge mapper snapshots or
 * channel configurations for color, size, opacity, outline, and edge width.
 * @returns {MappersBehavior} Behavior that applies and serializes mapper
 * channel state.
 * @remarks Mapper channel configs should avoid functions when they need to be
 * persisted. Use serializable `constant`, `linear`, `categorical`,
 * `colormap`, `nodeToEdge`, and `passthrough` configurations.
 * @example
 * helios.behavior.mappers.setChannelConfig('node', 'color', {
 *   type: 'colormap',
 *   attributes: 'score',
 *   colormap: 'interpolateViridis',
 *   domain: [0, 1],
 * });
 */
export class MappersBehavior extends Behavior {
  static id = 'mappers';

  constructor(options = {}) {
    super(options);
    this._muteSourceEvents = 0;
    this.state = cloneBehaviorState(options.state);
  }

  attach(context) {
    super.attach(context);
    this.syncFromHelios({ silent: true });
    this.addCleanup(this.context.subscribe(this.context?.helios, 'mappers:changed', () => {
      if (this._muteSourceEvents > 0) return;
      this.syncFromHelios({ silent: true });
      this.emitChange('mappers');
    }));
    this.addCleanup(this.context.subscribe(this.context?.helios, 'network:replaced', () => {
      this.syncFromHelios({ silent: true });
      this.emitChange('network-replaced');
    }));
    if (optionsHasMapperConfig(this.options)) {
      this.update(this.options);
    }
    return this;
  }

  update(options = {}) {
    super.update(options);
    if (!optionsHasMapperConfig(options)) return this;
    if (options.node) this.setModeSnapshot('node', options.node, { reason: 'options' });
    if (options.edge) this.setModeSnapshot('edge', options.edge, { reason: 'options' });
    if (options.nodeChannels) this.replaceDefaultChannels('node', options.nodeChannels, { reason: 'options' });
    if (options.edgeChannels) this.replaceDefaultChannels('edge', options.edgeChannels, { reason: 'options' });
    return this;
  }

  serialize() {
    return {
      options: this.getPublicState(),
    };
  }

  stateEntries() {
    const subscribe = createSharedChangeSubscribe(this);
    const entries = {
      node: {
        description: 'Node mapper collection snapshot.',
        default: cloneCollectionSnapshot(this.state.node),
        type: 'object',
        scope: 'workspace',
        aliases: ['mappers.node'],
        ui: {
          label: 'Node Mappers',
          controller: 'custom',
        },
        getter: () => cloneCollectionSnapshot(this.state.node),
        setter: (value) => this.setModeSnapshot('node', value, { reason: 'storage' }),
        subscribe,
      },
      edge: {
        description: 'Edge mapper collection snapshot.',
        default: cloneCollectionSnapshot(this.state.edge),
        type: 'object',
        scope: 'workspace',
        aliases: ['mappers.edge'],
        ui: {
          label: 'Edge Mappers',
          controller: 'custom',
        },
        getter: () => cloneCollectionSnapshot(this.state.edge),
        setter: (value) => this.setModeSnapshot('edge', value, { reason: 'storage' }),
        subscribe,
      },
    };
    for (const [mode, channels] of Object.entries(MAPPER_CHANNEL_ENTRIES)) {
      for (const [channel, label] of Object.entries(channels)) {
        entries[`${mode}.${channel}`] = {
          description: `${label} mapper channel configuration.`,
          default: this.getSerializedChannelConfig(mode, channel),
          type: 'object',
          scope: 'workspace',
          aliases: [`mappers.${mode}.${channel}`],
          ui: {
            label,
            controller: 'custom',
          },
          getter: () => this.getSerializedChannelConfig(mode, channel),
          setter: (value) => {
            if (!value || typeof value !== 'object') return;
            this.setChannelConfig(mode, channel, value);
          },
          subscribe: (notify) => this.on('change', (event) => {
            const detail = event?.detail ?? event ?? {};
            const matchesChannel = detail.reason === 'channel' && detail.mode === mode && detail.channel === channel;
            if (!matchesChannel) return;
            notify(undefined, detail);
          }),
        };
      }
    }
    return entries;
  }

  restore(snapshot = {}) {
    const options = snapshot?.options && typeof snapshot.options === 'object' ? snapshot.options : {};
    if (options.node) this.setModeSnapshot('node', options.node, { reason: 'restore', trackOverride: false });
    if (options.edge) this.setModeSnapshot('edge', options.edge, { reason: 'restore', trackOverride: false });
    this.syncFromHelios({ silent: true });
    this.emitChange('restore');
    return this;
  }

  emitChange(reason, detail = {}) {
    this.emit('change', { reason, state: this.getPublicState(), ...detail });
  }

  getPublicState() {
    return cloneBehaviorState(this.state);
  }

  mappers(options) {
    if (arguments.length === 0) return this.getPublicState();
    return this.update(options);
  }

  getChannelConfig(mode, channel) {
    const collection = getCollection(this.context?.helios, mode);
    const mapper = collection?.defaultMapper ?? null;
    if (!mapper || typeof mapper.getChannel !== 'function') return null;
    return shallowCloneChannelConfig(mapper.getChannel(channel));
  }

  /**
   * Return a serializable snapshot for one visual channel.
   *
   * @public
   * @apiSection Mapper Configuration
   * @param {'node'|'edge'} mode - Mapper collection to inspect.
   * @param {string} channel - Visual channel name such as `color`, `size`,
   * `opacity`, `outline`, or `width`.
   * @returns {object|null} JSON-safe channel configuration, or `null` when
   * the channel is not registered.
   */
  getSerializedChannelConfig(mode, channel) {
    return serializeChannelConfig(this.getChannelConfig(mode, channel));
  }

  /**
   * Replace the default mapper configuration for one visual channel.
   *
   * @public
   * @apiSection Mapper Configuration
   * @param {'node'|'edge'} mode - Mapper collection to update.
   * @param {string} channel - Visual channel name.
   * @param {object} config - Serializable channel configuration.
   * @returns {boolean} `true` when the channel was applied.
   * @remarks This mutates the active default mapper and emits a mapper change
   * event. Persisted configurations should avoid functions.
   * @example
   * helios.behavior.mappers.setChannelConfig('node', 'color', {
   *   type: 'colormap',
   *   attributes: 'score',
   *   colormap: 'interpolateViridis',
   *   domain: [0, 1],
   * });
   */
  setChannelConfig(mode, channel, config, options = {}) {
    const collection = getCollection(this.context?.helios, mode);
    const mapper = collection?.defaultMapper ?? null;
    if (!collection || !mapper || typeof mapper.setChannel !== 'function') return false;
    this._muteSourceEvents += 1;
    try {
      mapper.setChannel(channel, config);
      collection.touch?.();
    } finally {
      this._muteSourceEvents -= 1;
    }
    this.syncFromHelios({ silent: true });
    this.emitChange('channel', {
      mode,
      channel,
      trackOverride: options.trackOverride !== false,
      storageKeys: [`mappers.${mode}.${channel}`],
    });
    return true;
  }

  replaceDefaultChannels(mode, channels = {}, { reason = 'channels', trackOverride = true } = {}) {
    const collection = getCollection(this.context?.helios, mode);
    const mapper = collection?.defaultMapper ?? null;
    if (!collection || !mapper) return this;
    this._muteSourceEvents += 1;
    try {
      for (const config of mapper.channels.values()) mapper.unregisterChannel?.(config);
      mapper.channels.clear();
      for (const [channelName, channelConfig] of Object.entries(channels ?? {})) {
        const restored = restoreChannelConfig(channelConfig) ?? channelConfig;
        if (!restored) continue;
        mapper.setChannel(channelName, restored);
      }
      collection.touch?.();
    } finally {
      this._muteSourceEvents -= 1;
    }
    this.syncFromHelios({ silent: true });
    this.emitChange(reason, { mode, trackOverride: trackOverride !== false });
    return this;
  }

  setModeSnapshot(mode, snapshot, { reason = 'mode', trackOverride = true } = {}) {
    const collection = getCollection(this.context?.helios, mode);
    if (!collection) return this;
    this._muteSourceEvents += 1;
    try {
      restoreMapperCollection(collection, snapshot);
    } finally {
      this._muteSourceEvents -= 1;
    }
    this.syncFromHelios({ silent: true });
    this.emitChange(reason, { mode, trackOverride: trackOverride !== false });
    return this;
  }

  syncFromHelios({ silent = false } = {}) {
    this.state = snapshotState(this.context?.helios);
    if (!silent) this.emitChange('sync');
    return this;
  }
}

function optionsHasMapperConfig(options) {
  return Boolean(
    options
    && typeof options === 'object'
    && (
      options.node
      || options.edge
      || options.nodeChannels
      || options.edgeChannels
    )
  );
}

export default MappersBehavior;
