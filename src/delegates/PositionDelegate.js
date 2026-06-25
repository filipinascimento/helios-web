const NETWORK_REPLACED_EVENT = 'network:replaced';
const INDEX_ATTRIBUTE = '$index';

function safeVersion(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return numeric;
}

function nextCounter(value) {
  const current = safeVersion(value, 0);
  if (current >= Number.MAX_SAFE_INTEGER) return 0;
  return current + 1;
}

function warnOnce(owner, key, message, detail) {
  if (!owner) return;
  owner._warnedIssues ??= new Set();
  if (owner._warnedIssues.has(key)) return;
  owner._warnedIssues.add(key);
  console.warn(message, detail);
}

/**
 * Abstract source for layout positions owned outside the network buffers.
 *
 * @public
 * @returns {PositionDelegate} Subclasses provide synchronized topology and
 * position snapshots for renderers.
 * @remarks Use position delegates when layout state lives in GPU buffers or
 * another external system. Subclasses must implement synchronization hooks and
 * bump `version` whenever positions change.
 */
export class PositionDelegate {
  constructor() {
    if (new.target === PositionDelegate) {
      throw new TypeError('PositionDelegate is abstract. Extend it and implement synchronizeTopology(context).');
    }
    this.version = 0;
    this._attached = false;
    this._context = null;
    this._versionSnapshot = null;
    this._versionKey = '';
    this._topologyDirty = true;
    this._topologyDirtyReason = 'init';
    this._unsubscribeNetworkReplaced = null;
    this._warnedIssues = new Set();
    this._onNetworkReplacedBound = (event) => {
      const helios = this._context?.helios ?? null;
      const nextNetwork = event?.detail?.network ?? helios?.network ?? this._context?.network ?? null;
      const merged = this._mergeContext({
        ...this._context,
        helios,
        network: nextNetwork,
        visuals: helios?.visuals ?? this._context?.visuals ?? null,
        renderer: helios?.renderer ?? this._context?.renderer ?? null,
        scheduler: helios?.scheduler ?? this._context?.scheduler ?? null,
      });
      this.markTopologyDirty('network:replaced');
      this.ensureSynchronized(merged);
      if (typeof this.didReplaceNetwork === 'function') {
        this.didReplaceNetwork({ ...merged, event });
      }
    };
  }

  onAttach(context = {}) {
    const merged = this._mergeContext(context);
    this._context = merged;
    this._attached = true;
    this._bindNetworkReplaced(merged.helios);
    this.markTopologyDirty('attach');
    this.ensureSynchronized(merged);
    if (typeof this.didAttach === 'function') {
      this.didAttach(merged);
    }
  }

  onDetach(context = {}) {
    const merged = this._mergeContext(context);
    this._unbindNetworkReplaced();
    this._attached = false;
    this._context = null;
    this._versionSnapshot = null;
    this._versionKey = '';
    this.markTopologyDirty('detach');
    if (typeof this.didDetach === 'function') {
      this.didDetach(merged);
    }
  }

  markTopologyDirty(reason = 'manual') {
    this._topologyDirty = true;
    this._topologyDirtyReason = reason;
  }

  bumpVersion() {
    this.version = nextCounter(this.version);
    return this.version;
  }

  getVersion(context = {}) {
    this.ensureSynchronized(context);
    return safeVersion(this.version, 0);
  }

  getNodePositionView(context = {}) {
    this.ensureSynchronized(context);
    return null;
  }

  getPositionView(context = {}) {
    return this.getNodePositionView(context);
  }

  getWebGPUPositionBuffer(context = {}) {
    this.ensureSynchronized(context);
    return null;
  }

  getWebGLPositionTexture(context = {}) {
    this.ensureSynchronized(context);
    return null;
  }

  getGpuPositionResource(context = {}) {
    this.ensureSynchronized(context);
    return null;
  }

  getPositionResource(context = {}) {
    return this.getGpuPositionResource(context);
  }

  async flattenNodeDepthToPlane(context = {}, zValue = 0) {
    this.ensureSynchronized(context);
    void zValue;
    return false;
  }

  ensureSynchronized(context = {}) {
    const merged = this._mergeContext(context);
    this._context = merged;
    const network = merged.network ?? null;
    if (!network) return false;
    const previous = this._versionSnapshot;
    let snapshot = context.versionSnapshot ?? null;
    if (!snapshot) {
      try {
        snapshot = this.captureNetworkVersionSnapshot(network);
      } catch (_) {
        warnOnce(
          this,
          'capture-network-version-snapshot',
          'PositionDelegate: failed to capture network version snapshot during synchronization.',
          { context: merged },
        );
        return false;
      }
    }
    const lostNodeIndices = previous?.nodeIndicesReadable && !snapshot?.nodeIndicesReadable;
    const lostEdgeIndices = previous?.edgeIndicesReadable && !snapshot?.edgeIndicesReadable;
    if (!this._topologyDirty && (lostNodeIndices || lostEdgeIndices)) {
      return false;
    }
    const versionKey = this._snapshotKey(snapshot);
    const changed = this._topologyDirty || versionKey !== this._versionKey;
    if (!changed) return false;
    this.synchronizeTopology({
      ...merged,
      previousVersionSnapshot: previous,
      versionSnapshot: snapshot,
      reason: this._topologyDirty ? this._topologyDirtyReason : 'version-change',
    });
    this._versionSnapshot = snapshot;
    this._versionKey = versionKey;
    this._topologyDirty = false;
    this._topologyDirtyReason = null;
    this.bumpVersion();
    return true;
  }

  captureNetworkVersionSnapshot(network) {
    const topology = this._readTopologyVersions(network);
    const active = this._readActiveIndexSnapshot(network);
    const nodeIndexAttributeVersion = this._readIndexAttributeVersion(network, 'node');
    const edgeIndexAttributeVersion = this._readIndexAttributeVersion(network, 'edge');
    return {
      topologyNode: topology.node,
      topologyEdge: topology.edge,
      nodeIndicesVersion: safeVersion(active?.node?.version, 0),
      edgeIndicesVersion: safeVersion(active?.edge?.version, 0),
      nodeIndicesCount: safeVersion(active?.node?.length, 0),
      edgeIndicesCount: safeVersion(active?.edge?.length, 0),
      nodeIndexAttributeVersion,
      edgeIndexAttributeVersion,
      nodeIndicesReadable: active?.node instanceof Uint32Array,
      edgeIndicesReadable: active?.edge instanceof Uint32Array,
    };
  }

  synchronizeTopology() {
    throw new Error('PositionDelegate subclasses must implement synchronizeTopology(context).');
  }

  _readTopologyVersions(network) {
    if (!network || typeof network.getTopologyVersions !== 'function') {
      return { node: 0, edge: 0 };
    }
    try {
      const versions = network.getTopologyVersions() ?? {};
      return {
        node: safeVersion(versions.node, 0),
        edge: safeVersion(versions.edge, 0),
      };
    } catch (_) {
      warnOnce(
        this,
        'read-topology-versions',
        'PositionDelegate: failed to read topology versions; using zero versions.',
        { network },
      );
      return { node: 0, edge: 0 };
    }
  }

  _readActiveIndexSnapshot(network) {
    if (!network) return null;
    try {
      if (typeof network.withBufferAccess === 'function') {
        return network.withBufferAccess(() => ({
          node: network.nodeIndices ?? null,
          edge: network.edgeIndices ?? null,
        }), { nodeIndices: true, edgeIndices: true });
      }
      return {
        node: network.nodeIndices ?? null,
        edge: network.edgeIndices ?? null,
      };
    } catch (_) {
      warnOnce(
        this,
        'read-active-index-snapshot',
        'PositionDelegate: failed to read active index snapshot; topology sync may be skipped.',
        { network },
      );
      return null;
    }
  }

  _readIndexAttributeVersion(network, kind) {
    if (!network) return 0;
    const topologyVersions = this._readTopologyVersions(network);
    const internalMap = kind === 'edge' ? network._edgeAttributes : network._nodeAttributes;
    if (internalMap?.has?.(INDEX_ATTRIBUTE) === false) {
      return safeVersion(kind === 'edge' ? topologyVersions.edge : topologyVersions.node, 0);
    }
    const hasGetter = kind === 'edge' ? network.hasEdgeAttribute : network.hasNodeAttribute;
    const infoGetter = kind === 'edge' ? network.getEdgeAttributeInfo : network.getNodeAttributeInfo;
    let attributeExists = null;
    if (typeof hasGetter === 'function') {
      try {
        attributeExists = Boolean(hasGetter.call(network, INDEX_ATTRIBUTE));
      } catch (_) {
        attributeExists = null;
      }
    } else if (typeof infoGetter === 'function') {
      try {
        attributeExists = Boolean(infoGetter.call(network, INDEX_ATTRIBUTE));
      } catch (_) {
        attributeExists = null;
      }
    }
    try {
      if (kind === 'edge') {
        if (attributeExists === false && Number.isFinite(topologyVersions.edge)) {
          return safeVersion(topologyVersions.edge, 0);
        }
        if (typeof network.getEdgeAttributeVersion === 'function') {
          return safeVersion(network.getEdgeAttributeVersion(INDEX_ATTRIBUTE), 0);
        }
        if (typeof network.withBufferAccess === 'function') {
          return safeVersion(
            network.withBufferAccess(() => network.getEdgeAttributeBuffer?.(INDEX_ATTRIBUTE)?.version, { edgeIndices: true }),
            0,
          );
        }
        return safeVersion(network.getEdgeAttributeBuffer?.(INDEX_ATTRIBUTE)?.version, 0);
      }
      if (attributeExists === false && Number.isFinite(topologyVersions.node)) {
        return safeVersion(topologyVersions.node, 0);
      }
      if (typeof network.getNodeAttributeVersion === 'function') {
        return safeVersion(network.getNodeAttributeVersion(INDEX_ATTRIBUTE), 0);
      }
      if (typeof network.withBufferAccess === 'function') {
        return safeVersion(
          network.withBufferAccess(() => network.getNodeAttributeBuffer?.(INDEX_ATTRIBUTE)?.version, { nodeIndices: true }),
          0,
        );
      }
      return safeVersion(network.getNodeAttributeBuffer?.(INDEX_ATTRIBUTE)?.version, 0);
    } catch (_) {
      warnOnce(
        this,
        `read-index-attribute-version:${kind}`,
        `PositionDelegate: failed to read ${kind} $index attribute version; using zero.`,
        { network },
      );
      return safeVersion(kind === 'edge' ? topologyVersions.edge : topologyVersions.node, 0);
    }
  }

  _snapshotKey(snapshot) {
    if (!snapshot) return '';
    return [
      snapshot.topologyNode,
      snapshot.topologyEdge,
      snapshot.nodeIndicesVersion,
      snapshot.edgeIndicesVersion,
      snapshot.nodeIndicesCount,
      snapshot.edgeIndicesCount,
      snapshot.nodeIndexAttributeVersion,
      snapshot.edgeIndexAttributeVersion,
    ].join('|');
  }

  _bindNetworkReplaced(helios) {
    this._unbindNetworkReplaced();
    if (!helios || typeof helios.on !== 'function') return;
    try {
      this._unsubscribeNetworkReplaced = helios.on(NETWORK_REPLACED_EVENT, this._onNetworkReplacedBound);
    } catch (_) {
      warnOnce(
        this,
        'bind-network-replaced',
        'PositionDelegate: failed to subscribe to network:replaced events.',
        { helios },
      );
      this._unsubscribeNetworkReplaced = null;
    }
  }

  _unbindNetworkReplaced() {
    if (typeof this._unsubscribeNetworkReplaced === 'function') {
      try {
        this._unsubscribeNetworkReplaced();
      } catch (error) {
        console.warn('PositionDelegate: failed to unsubscribe network-replaced listener.', error);
      }
    }
    this._unsubscribeNetworkReplaced = null;
  }

  _mergeContext(context = {}) {
    const previous = this._context ?? {};
    return {
      helios: context.helios ?? previous.helios ?? null,
      network: context.network ?? previous.network ?? null,
      visuals: context.visuals ?? previous.visuals ?? null,
      renderer: context.renderer ?? previous.renderer ?? null,
      scheduler: context.scheduler ?? previous.scheduler ?? null,
      graphLayer: context.graphLayer ?? previous.graphLayer ?? null,
      backend: context.backend ?? previous.backend ?? null,
      device: context.device ?? previous.device ?? null,
      gl: context.gl ?? previous.gl ?? null,
    };
  }
}

export default PositionDelegate;
