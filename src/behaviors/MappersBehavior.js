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

  restore(snapshot = {}) {
    const options = snapshot?.options && typeof snapshot.options === 'object' ? snapshot.options : {};
    if (options.node) this.setModeSnapshot('node', options.node, { reason: 'restore' });
    if (options.edge) this.setModeSnapshot('edge', options.edge, { reason: 'restore' });
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

  getSerializedChannelConfig(mode, channel) {
    return serializeChannelConfig(this.getChannelConfig(mode, channel));
  }

  setChannelConfig(mode, channel, config) {
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
    this.emitChange('channel', { mode, channel });
    return true;
  }

  replaceDefaultChannels(mode, channels = {}, { reason = 'channels' } = {}) {
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
    this.emitChange(reason, { mode });
    return this;
  }

  setModeSnapshot(mode, snapshot, { reason = 'mode' } = {}) {
    const collection = getCollection(this.context?.helios, mode);
    if (!collection) return this;
    this._muteSourceEvents += 1;
    try {
      restoreMapperCollection(collection, snapshot);
    } finally {
      this._muteSourceEvents -= 1;
    }
    this.syncFromHelios({ silent: true });
    this.emitChange(reason, { mode });
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
