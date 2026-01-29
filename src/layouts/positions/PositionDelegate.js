/** @typedef {import('helios-network').default} HeliosNetwork */
import { NODE_POSITION_ATTRIBUTE } from '../../pipeline/constants.js';

const DEFAULT_POSITION_STRIDE = 3;

function clampCount(value) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function getTopologyVersion(network) {
  try {
    return network?.getTopologyVersions?.() ?? null;
  } catch (_) {
    return null;
  }
}

function resolveEventName(network, key) {
  return network?.constructor?.EVENTS?.[key] ?? network?.EVENTS?.[key] ?? null;
}

export class PositionDelegate {
  constructor(options = {}) {
    this.options = { ...options };
    this.network = null;
    this.visuals = null;
    this.debug = options.debug ?? null;
    this._positionsVersion = 0;
    this._denseVersion = 0;
    this._denseDirty = true;
    this._subscriptions = [];
  }

  attach({ network, visuals, debug } = {}) {
    this.network = network ?? null;
    this.visuals = visuals ?? null;
    this.debug = debug ?? this.debug ?? null;
    this._denseDirty = true;
    return this;
  }

  detach() {
    for (const unsub of this._subscriptions) {
      try {
        unsub?.();
      } catch (_) {
        // ignore
      }
    }
    this._subscriptions = [];
    this.network = null;
    this.visuals = null;
    return this;
  }

  markPositionsDirty() {
    this._positionsVersion += 1;
    this._denseDirty = true;
  }

  getPositionView() {
    return null;
  }

  getDenseOverrides() {
    return null;
  }

  syncFromNetwork() {}

  syncToNetwork() {}

  onNetworkEvent() {}

  bindNetworkEvents(network) {
    if (!network) return;
    const events = {
      nodesAdded: resolveEventName(network, 'nodesAdded'),
      nodesRemoved: resolveEventName(network, 'nodesRemoved'),
      edgesAdded: resolveEventName(network, 'edgesAdded'),
      edgesRemoved: resolveEventName(network, 'edgesRemoved'),
      topologyChanged: resolveEventName(network, 'topologyChanged'),
      attributeChanged: resolveEventName(network, 'attributeChanged'),
      attributeDefined: resolveEventName(network, 'attributeDefined'),
      attributeRemoved: resolveEventName(network, 'attributeRemoved'),
    };
    Object.values(events).forEach((type) => {
      if (!type) return;
      const unsub = network.on?.(type, (event) => this.onNetworkEvent?.(event));
      if (typeof unsub === 'function') this._subscriptions.push(unsub);
    });
  }
}

export class CpuMirrorPositionDelegate extends PositionDelegate {
  constructor(options = {}) {
    super(options);
    this.positions = null;
    this.stride = DEFAULT_POSITION_STRIDE;
    this._denseNodePositions = null;
    this._denseEdgeSegments = null;
    this._denseTopology = { node: 0, edge: 0 };
    this._syncToNetwork = options.syncToNetwork === true;
  }

  attach({ network, visuals, debug } = {}) {
    super.attach({ network, visuals, debug });
    this.syncFromNetwork();
    this.bindNetworkEvents(network);
    return this;
  }

  getPositionView() {
    return this.positions;
  }

  syncFromNetwork() {
    if (!this.network) return;
    const read = () => {
      const source = this.network.getNodeAttributeBuffer?.(NODE_POSITION_ATTRIBUTE)?.view
        ?? this.network.getNodeAttributeBuffer?.('position')?.view
        ?? null;
      if (!source) return;
      if (!this.positions || this.positions.length !== source.length) {
        this.positions = new Float32Array(source.length);
      }
      this.positions.set(source);
      this.markPositionsDirty();
    };
    if (typeof this.network.withBufferAccess === 'function') {
      this.network.withBufferAccess(read);
    } else {
      read();
    }
  }

  ensureCapacityFromNetwork() {
    if (!this.network) return;
    const source = this.network.getNodeAttributeBuffer?.(NODE_POSITION_ATTRIBUTE)?.view ?? null;
    if (!source) return;
    if (!this.positions || this.positions.length < source.length) {
      const next = new Float32Array(source.length);
      if (this.positions) next.set(this.positions);
      this.positions = next;
      this.markPositionsDirty();
    }
  }

  syncToNetwork() {
    if (!this.network || !this.positions || !this._syncToNetwork) return;
    const write = () => {
      const target = this.network.getNodeAttributeBuffer?.(NODE_POSITION_ATTRIBUTE)?.view
        ?? this.network.getNodeAttributeBuffer?.('position')?.view
        ?? null;
      if (!target) return;
      const count = Math.min(target.length, this.positions.length);
      for (let i = 0; i < count; i += 1) {
        target[i] = this.positions[i];
      }
      try {
        this.network.bumpNodeAttributeVersion?.(NODE_POSITION_ATTRIBUTE);
      } catch (_) {
        // ignore
      }
    };
    if (typeof this.network.withBufferAccess === 'function') {
      this.network.withBufferAccess(write);
    } else {
      write();
    }
  }

  onNetworkEvent(event) {
    const type = event?.type;
    if (!type) return;
    if (type.includes('nodes:') || type.includes('topology:')) {
      this.ensureCapacityFromNetwork();
    }
    this._denseDirty = true;
  }

  getDenseOverrides() {
    if (!this.network || !this.positions) return null;
    try {
      this.network.updateDenseNodeIndexBuffer?.();
      this.network.updateDenseEdgeIndexBuffer?.();
    } catch (_) {
      // ignore dense update failures
    }
    const nodeIndexDesc = this.network.getDenseNodeIndexView?.();
    const edgeIndexDesc = this.network.getDenseEdgeIndexView?.();
    const nodeIndices = nodeIndexDesc?.view ?? null;
    const edgeIndices = edgeIndexDesc?.view ?? null;
    const nodeCount = clampCount(nodeIndexDesc?.count ?? nodeIndices?.length ?? this.network.nodeCount);
    const edgeCount = clampCount(edgeIndexDesc?.count ?? edgeIndices?.length ?? this.network.edgeCount);
    if (!nodeIndices) return null;

    const topology = getTopologyVersion(this.network);
    const nodeTopology = topology?.node ?? nodeIndexDesc?.topologyVersion ?? this._denseTopology.node ?? 0;
    const edgeTopology = topology?.edge ?? edgeIndexDesc?.topologyVersion ?? this._denseTopology.edge ?? 0;

    const needsNode = !this._denseNodePositions || this._denseNodePositions.length !== nodeCount * this.stride;
    if (needsNode) {
      this._denseNodePositions = new Float32Array(nodeCount * this.stride);
    }

    if (this._denseDirty || needsNode || nodeTopology !== this._denseTopology.node) {
      for (let i = 0; i < nodeCount; i += 1) {
        const nodeId = nodeIndices[i];
        const srcOffset = nodeId * this.stride;
        const dstOffset = i * this.stride;
        this._denseNodePositions[dstOffset] = this.positions[srcOffset] ?? 0;
        this._denseNodePositions[dstOffset + 1] = this.positions[srcOffset + 1] ?? 0;
        this._denseNodePositions[dstOffset + 2] = this.positions[srcOffset + 2] ?? 0;
      }
    }

    if (edgeIndices && edgeCount) {
      const needsEdge = !this._denseEdgeSegments || this._denseEdgeSegments.length !== edgeCount * this.stride * 2;
      if (needsEdge) {
        this._denseEdgeSegments = new Float32Array(edgeCount * this.stride * 2);
      }
      if (this._denseDirty || needsEdge || edgeTopology !== this._denseTopology.edge) {
        const edgesView = this.network.edgesView;
        for (let i = 0; i < edgeCount; i += 1) {
          const edgeId = edgeIndices[i];
          const edgeOffset = edgeId * 2;
          const source = edgesView?.[edgeOffset] ?? 0;
          const target = edgesView?.[edgeOffset + 1] ?? 0;
          const dstOffset = i * this.stride * 2;
          const srcOffset = source * this.stride;
          const tgtOffset = target * this.stride;
          this._denseEdgeSegments[dstOffset] = this.positions[srcOffset] ?? 0;
          this._denseEdgeSegments[dstOffset + 1] = this.positions[srcOffset + 1] ?? 0;
          this._denseEdgeSegments[dstOffset + 2] = this.positions[srcOffset + 2] ?? 0;
          this._denseEdgeSegments[dstOffset + 3] = this.positions[tgtOffset] ?? 0;
          this._denseEdgeSegments[dstOffset + 4] = this.positions[tgtOffset + 1] ?? 0;
          this._denseEdgeSegments[dstOffset + 5] = this.positions[tgtOffset + 2] ?? 0;
        }
      }
    }

    if (this._denseDirty) {
      this._denseVersion += 1;
      this._denseDirty = false;
      this._denseTopology.node = nodeTopology;
      this._denseTopology.edge = edgeTopology;
    }

    return {
      nodes: {
        positions: {
          view: this._denseNodePositions,
          version: this._denseVersion,
          topologyVersion: nodeTopology ?? 0,
          count: nodeCount,
        },
      },
      edges: {
        segments: this._denseEdgeSegments
          ? {
              view: this._denseEdgeSegments,
              version: this._denseVersion,
              topologyVersion: edgeTopology ?? 0,
              count: edgeCount,
            }
          : null,
      },
    };
  }
}

export class ExternalBufferPositionDelegate extends CpuMirrorPositionDelegate {
  constructor(bufferView, options = {}) {
    super({ ...options, syncToNetwork: options.syncToNetwork === true });
    this.positions = bufferView ?? null;
    this._denseDirty = true;
  }

  syncFromNetwork() {
    // External delegate assumes caller owns the buffer.
  }
}

export function createPositionDelegateFromOptions(options = {}) {
  if (!options || typeof options !== 'object') return null;
  if (options.type === 'external' && options.buffer) {
    return new ExternalBufferPositionDelegate(options.buffer, options);
  }
  if (options.type === 'mirror') {
    return new CpuMirrorPositionDelegate(options);
  }
  return null;
}
