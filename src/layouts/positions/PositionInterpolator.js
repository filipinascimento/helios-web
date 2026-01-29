function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function ensureBuffer(buffer, length) {
  if (!buffer || buffer.length !== length) {
    return new Float32Array(length);
  }
  return buffer;
}

export class CpuLinearPositionInterpolator {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.durationMs = Number.isFinite(options.durationMs) ? Math.max(1, options.durationMs) : 60;
    this._previousNodes = null;
    this._currentNodes = null;
    this._previousEdges = null;
    this._currentEdges = null;
    this._interpolatedNodes = null;
    this._interpolatedEdges = null;
    this._lastUpdateTime = 0;
    this._frameVersion = 0;
    this._renderVersion = 0;
  }

  capture(overrides, timestamp = performance.now()) {
    if (!this.enabled || !overrides?.nodes?.positions?.view) return;
    const nodeView = overrides.nodes.positions.view;
    const edgeView = overrides.edges?.segments?.view ?? null;

    this._previousNodes = this._currentNodes;
    this._currentNodes = new Float32Array(nodeView.length);
    this._currentNodes.set(nodeView);

    if (edgeView) {
      this._previousEdges = this._currentEdges;
      this._currentEdges = new Float32Array(edgeView.length);
      this._currentEdges.set(edgeView);
    } else {
      this._previousEdges = null;
      this._currentEdges = null;
    }

    this._lastUpdateTime = timestamp;
    this._frameVersion += 1;
    this._renderVersion = 0;
  }

  getOverrides(timestamp = performance.now()) {
    if (!this.enabled || !this._currentNodes) return null;
    if (!this._previousNodes || this._previousNodes.length !== this._currentNodes.length) {
      return {
        nodes: {
          positions: {
            view: this._currentNodes,
            version: this._frameVersion,
            count: Math.floor(this._currentNodes.length / 3),
            topologyVersion: 0,
          },
        },
        edges: this._currentEdges
          ? {
              segments: {
                view: this._currentEdges,
                version: this._frameVersion,
                count: Math.floor(this._currentEdges.length / 6),
                topologyVersion: 0,
              },
            }
          : null,
      };
    }

    const alpha = clamp01((timestamp - this._lastUpdateTime) / this.durationMs);
    if (alpha >= 1) {
      return {
        nodes: {
          positions: {
            view: this._currentNodes,
            version: this._frameVersion,
            count: Math.floor(this._currentNodes.length / 3),
            topologyVersion: 0,
          },
        },
        edges: this._currentEdges
          ? {
              segments: {
                view: this._currentEdges,
                version: this._frameVersion,
                count: Math.floor(this._currentEdges.length / 6),
                topologyVersion: 0,
              },
            }
          : null,
      };
    }

    this._renderVersion += 1;
    const version = this._frameVersion + this._renderVersion;

    const length = this._currentNodes.length;
    this._interpolatedNodes = ensureBuffer(this._interpolatedNodes, length);
    for (let i = 0; i < length; i += 1) {
      this._interpolatedNodes[i] =
        this._previousNodes[i] + (this._currentNodes[i] - this._previousNodes[i]) * alpha;
    }

    let edgesPayload = null;
    if (this._currentEdges && this._previousEdges && this._currentEdges.length === this._previousEdges.length) {
      const edgeLength = this._currentEdges.length;
      this._interpolatedEdges = ensureBuffer(this._interpolatedEdges, edgeLength);
      for (let i = 0; i < edgeLength; i += 1) {
        this._interpolatedEdges[i] =
          this._previousEdges[i] + (this._currentEdges[i] - this._previousEdges[i]) * alpha;
      }
      edgesPayload = {
        segments: {
          view: this._interpolatedEdges,
          version,
          count: Math.floor(this._interpolatedEdges.length / 6),
          topologyVersion: 0,
        },
      };
    }

    return {
      nodes: {
        positions: {
          view: this._interpolatedNodes,
          version,
          count: Math.floor(this._interpolatedNodes.length / 3),
          topologyVersion: 0,
        },
      },
      edges: edgesPayload,
    };
  }
}
