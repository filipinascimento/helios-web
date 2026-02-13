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

  ensureSynchronized(context = {}) {
    const merged = this._mergeContext(context);
    this._context = merged;
    const network = merged.network ?? null;
    if (!network) return false;
    const snapshot = this.captureNetworkVersionSnapshot(network);
    const versionKey = this._snapshotKey(snapshot);
    const previous = this._versionSnapshot;
    const indicesReplaced = Boolean(
      previous
      && (previous.nodeIndicesRef !== snapshot.nodeIndicesRef || previous.edgeIndicesRef !== snapshot.edgeIndicesRef),
    );
    const changed = this._topologyDirty || versionKey !== this._versionKey || indicesReplaced;
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
    const nodeIndices = this._readActiveIndices(network, 'node');
    const edgeIndices = this._readActiveIndices(network, 'edge');
    const nodeIndexAttributeVersion = this._readIndexAttributeVersion(network, 'node');
    const edgeIndexAttributeVersion = this._readIndexAttributeVersion(network, 'edge');
    return {
      topologyNode: topology.node,
      topologyEdge: topology.edge,
      nodeIndicesVersion: safeVersion(nodeIndices?.version, 0),
      edgeIndicesVersion: safeVersion(edgeIndices?.version, 0),
      nodeIndicesCount: safeVersion(nodeIndices?.length, 0),
      edgeIndicesCount: safeVersion(edgeIndices?.length, 0),
      nodeIndexAttributeVersion,
      edgeIndexAttributeVersion,
      nodeIndicesRef: nodeIndices ?? null,
      edgeIndicesRef: edgeIndices ?? null,
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
      return { node: 0, edge: 0 };
    }
  }

  _readActiveIndices(network, kind) {
    if (!network) return null;
    try {
      return kind === 'edge'
        ? (network.edgeIndices ?? null)
        : (network.nodeIndices ?? null);
    } catch (_) {
      return null;
    }
  }

  _readIndexAttributeVersion(network, kind) {
    if (!network) return 0;
    try {
      if (kind === 'edge') {
        return safeVersion(network.getEdgeAttributeBuffer?.(INDEX_ATTRIBUTE)?.version, 0);
      }
      return safeVersion(network.getNodeAttributeBuffer?.(INDEX_ATTRIBUTE)?.version, 0);
    } catch (_) {
      return 0;
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
      this._unsubscribeNetworkReplaced = null;
    }
  }

  _unbindNetworkReplaced() {
    if (typeof this._unsubscribeNetworkReplaced === 'function') {
      try {
        this._unsubscribeNetworkReplaced();
      } catch (_) {
        // ignore
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
