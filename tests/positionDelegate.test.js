import test from 'node:test';
import assert from 'node:assert/strict';
import { Helios, PositionDelegate } from '../src/index.js';
import { GraphLayer } from '../src/rendering/engine/GraphLayer.js';

function createVersionedNetwork() {
  let topologyVersion = 1;
  let nodeIndices = new Uint32Array([0, 1]);
  let edgeIndices = new Uint32Array([0]);
  const positionView = new Float32Array([
    0, 0, 0,
    1, 1, 1,
  ]);
  return {
    network: {
      withBufferAccess: (fn) => fn(),
      getTopologyVersions: () => ({ node: topologyVersion, edge: topologyVersion }),
      getNodeAttributeBuffer: (name) => {
        if (name === '_helios_visuals_position') return { view: positionView, version: topologyVersion };
        if (name === '$index') return { version: topologyVersion };
        return null;
      },
      getEdgeAttributeBuffer: (name) => {
        if (name === '$index') return { version: topologyVersion };
        return null;
      },
      get nodeIndices() { return nodeIndices; },
      get edgeIndices() { return edgeIndices; },
    },
    setTopologyVersion: (value) => { topologyVersion = value; },
    replaceNodeIndices: (next) => { nodeIndices = next; },
    replaceEdgeIndices: (next) => { edgeIndices = next; },
  };
}

test('PositionDelegate is abstract', () => {
  assert.throws(
    () => new PositionDelegate(),
    /abstract/i,
  );
});

test('PositionDelegate synchronizes when topology/index versions change', () => {
  class TrackingDelegate extends PositionDelegate {
    constructor() {
      super();
      this.syncCount = 0;
      this.positionView = null;
    }

    synchronizeTopology({ network }) {
      this.syncCount += 1;
      this.positionView = network?.getNodeAttributeBuffer?.('_helios_visuals_position')?.view ?? null;
    }

    getNodePositionView(context) {
      this.ensureSynchronized(context);
      return this.positionView;
    }
  }

  const { network, setTopologyVersion, replaceNodeIndices, replaceEdgeIndices } = createVersionedNetwork();
  const delegate = new TrackingDelegate();
  delegate.onAttach({ network });
  assert.equal(delegate.syncCount, 1);
  assert.ok(delegate.getVersion({ network }) >= 1);

  delegate.getNodePositionView({ network });
  assert.equal(delegate.syncCount, 1);

  setTopologyVersion(2);
  delegate.getNodePositionView({ network });
  assert.equal(delegate.syncCount, 2);

  replaceNodeIndices(new Uint32Array([0, 1, 2]));
  delegate.getNodePositionView({ network });
  assert.equal(delegate.syncCount, 3);

  replaceEdgeIndices(new Uint32Array([0, 1]));
  delegate.getNodePositionView({ network });
  assert.equal(delegate.syncCount, 4);
});

test('PositionDelegate reads $index versions without direct buffer access', () => {
  class TrackingDelegate extends PositionDelegate {
    synchronizeTopology() {}
  }

  let bufferReads = 0;
  const network = {
    withBufferAccess: (fn) => fn(),
    getTopologyVersions: () => ({ node: 1, edge: 1 }),
    getNodeAttributeVersion: (name) => (name === '$index' ? 7 : 0),
    getEdgeAttributeVersion: (name) => (name === '$index' ? 11 : 0),
    getNodeAttributeBuffer: () => {
      bufferReads += 1;
      throw new Error('buffer access should not be used for $index version reads');
    },
    getEdgeAttributeBuffer: () => {
      bufferReads += 1;
      throw new Error('buffer access should not be used for $index version reads');
    },
    get nodeIndices() { return new Uint32Array([0, 1]); },
    get edgeIndices() { return new Uint32Array([0]); },
  };

  const delegate = new TrackingDelegate();
  const snapshot = delegate.captureNetworkVersionSnapshot(network);

  assert.equal(snapshot.nodeIndexAttributeVersion, 7);
  assert.equal(snapshot.edgeIndexAttributeVersion, 11);
  assert.equal(bufferReads, 0);
});

test('PositionDelegate uses topology versions for synthetic $index snapshots', () => {
  class TrackingDelegate extends PositionDelegate {
    synchronizeTopology() {}
  }

  let attributeVersionReads = 0;
  const network = {
    withBufferAccess: (fn) => fn(),
    getTopologyVersions: () => ({ node: 13, edge: 17 }),
    hasNodeAttribute: () => false,
    hasEdgeAttribute: () => false,
    getNodeAttributeVersion: () => {
      attributeVersionReads += 1;
      throw new Error('synthetic $index should not require direct attribute version reads');
    },
    getEdgeAttributeVersion: () => {
      attributeVersionReads += 1;
      throw new Error('synthetic $index should not require direct attribute version reads');
    },
    get nodeIndices() { return new Uint32Array([0, 1]); },
    get edgeIndices() { return new Uint32Array([0]); },
  };

  const delegate = new TrackingDelegate();
  const snapshot = delegate.captureNetworkVersionSnapshot(network);

  assert.equal(snapshot.nodeIndexAttributeVersion, 13);
  assert.equal(snapshot.edgeIndexAttributeVersion, 17);
  assert.equal(attributeVersionReads, 0);
});

test('PositionDelegate treats missing internal $index metadata as synthetic even if public getters disagree', () => {
  class TrackingDelegate extends PositionDelegate {
    synchronizeTopology() {}
  }

  const network = {
    _nodeAttributes: new Map(),
    _edgeAttributes: new Map(),
    withBufferAccess: (fn) => fn(),
    getTopologyVersions: () => ({ node: 5, edge: 9 }),
    hasNodeAttribute: () => true,
    hasEdgeAttribute: () => true,
    getNodeAttributeVersion: () => 101,
    getEdgeAttributeVersion: () => 103,
    get nodeIndices() { return new Uint32Array([0, 1]); },
    get edgeIndices() { return new Uint32Array([0]); },
  };

  const delegate = new TrackingDelegate();
  const snapshot = delegate.captureNetworkVersionSnapshot(network);

  assert.equal(snapshot.nodeIndexAttributeVersion, 5);
  assert.equal(snapshot.edgeIndexAttributeVersion, 9);
});

test('PositionDelegate warns when active index snapshot capture fails', () => {
  class TrackingDelegate extends PositionDelegate {
    synchronizeTopology() {}
  }

  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
    const network = {
      withBufferAccess() {
        throw new Error('boom');
      },
      getTopologyVersions() {
        return { node: 1, edge: 1 };
      },
      getNodeAttributeVersion: () => 0,
      getEdgeAttributeVersion: () => 0,
    };
    const delegate = new TrackingDelegate();
    const changed = delegate.ensureSynchronized({ network });
    assert.equal(changed, true);
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(warnings.length, 1);
  assert.match(String(warnings[0][0]), /failed to read active index snapshot/i);
});

test('Helios.positions ignores delegate overrides when active layout has no delegate', () => {
  const helios = Object.create(Helios.prototype);
  helios.debug = { log: () => {} };
  helios._positionsConfig = { source: 'network', delegate: null };
  helios._activePositionDelegate = null;
  helios._resetInterpolationRuntime = () => {};
  helios._applyPositionPipelineToRenderer = () => true;
  helios._layout = {};
  helios.scheduler = { requestGeometry: () => {}, requestRender: () => {} };

  helios.positions({ source: 'delegate', delegate: { getNodePositionView: () => null } });
  assert.deepEqual(helios.positions(), { source: 'network', delegate: null });
});

test('GraphLayer calls delegate synchronization guard before reading resources', () => {
  class TrackingDelegate extends PositionDelegate {
    constructor() {
      super();
      this.syncCount = 0;
      this.view = null;
    }

    synchronizeTopology({ network }) {
      this.syncCount += 1;
      this.view = network?.getNodeAttributeBuffer?.('_helios_visuals_position')?.view ?? null;
    }

    getNodePositionView(context) {
      this.ensureSynchronized(context);
      return this.view;
    }
  }

  const { network } = createVersionedNetwork();
  const delegate = new TrackingDelegate();
  const graphLayer = new GraphLayer();
  graphLayer.setPositionDelegate(delegate);
  delegate.onAttach({ network });

  const override = graphLayer.resolvePositionSourceOverride(network, { backend: 'webgl2' });
  assert.ok(override?.view instanceof Float32Array);
  assert.ok(delegate.syncCount >= 1);
});

test('GraphLayer prefers GPU delegate resources without requesting CPU position views', () => {
  class GpuBackedDelegate extends PositionDelegate {
    constructor() {
      super();
      this.syncCount = 0;
      this.cpuViewCalls = 0;
      this.resource = {
        buffer: { label: 'gpu-positions' },
        count: 2,
        version: 11,
      };
    }

    synchronizeTopology() {
      this.syncCount += 1;
    }

    getGpuPositionResource(context) {
      this.ensureSynchronized(context);
      return this.resource;
    }

    getNodePositionView(context) {
      this.ensureSynchronized(context);
      this.cpuViewCalls += 1;
      return new Float32Array([0, 0, 0, 1, 1, 1]);
    }
  }

  const { network } = createVersionedNetwork();
  const delegate = new GpuBackedDelegate();
  const graphLayer = new GraphLayer();
  graphLayer.setPositionDelegate(delegate);
  delegate.onAttach({ network });

  const override = graphLayer.resolvePositionSourceOverride(network, { backend: 'webgpu' });
  assert.equal(delegate.syncCount, 1);
  assert.equal(delegate.cpuViewCalls, 0);
  assert.equal(override?.webgpuBuffer, delegate.resource.buffer);
  assert.equal(override?.count, 2);
  assert.ok(Number.isFinite(override?.version));
});

test('GraphLayer can resolve delegate positions during buffer access without resync throws', () => {
  class TrackingDelegate extends PositionDelegate {
    constructor() {
      super();
      this.syncCount = 0;
      this.view = null;
    }

    synchronizeTopology({ network }) {
      this.syncCount += 1;
      this.view = network?.getNodeAttributeBuffer?.('_helios_visuals_position')?.view ?? null;
    }

    getNodePositionView(context) {
      this.ensureSynchronized(context);
      return this.view;
    }
  }

  let inBufferAccess = false;
  const nodeIndices = new Uint32Array([0, 1]);
  const edgeIndices = new Uint32Array([0]);
  const positionView = new Float32Array([
    0, 0, 0,
    1, 1, 1,
  ]);
  const network = {
    withBufferAccess: (fn) => {
      inBufferAccess = true;
      try {
        return fn();
      } finally {
        inBufferAccess = false;
      }
    },
    getTopologyVersions: () => ({ node: 1, edge: 1 }),
    getNodeAttributeBuffer: (name) => {
      if (name === '_helios_visuals_position') return { view: positionView, version: 1 };
      if (name === '$index') return { version: 1 };
      return null;
    },
    getEdgeAttributeBuffer: (name) => {
      if (name === '$index') return { version: 1 };
      return null;
    },
    get nodeIndices() {
      if (inBufferAccess) {
        throw new Error('Cannot perform nodeIndices during buffer access');
      }
      return nodeIndices;
    },
    get edgeIndices() {
      if (inBufferAccess) {
        throw new Error('Cannot perform edgeIndices during buffer access');
      }
      return edgeIndices;
    },
  };

  const delegate = new TrackingDelegate();
  const graphLayer = new GraphLayer();
  graphLayer.setPositionDelegate(delegate);
  delegate.onAttach({ network });
  assert.equal(delegate.syncCount, 1);

  const override = network.withBufferAccess(() => graphLayer.resolvePositionSourceOverride(network, { backend: 'webgpu' }));
  assert.ok(override?.view instanceof Float32Array);
  assert.equal(delegate.syncCount, 1);
});

test('PositionDelegate does not resynchronize on active-index reference churn when versions are unchanged', () => {
  class TrackingDelegate extends PositionDelegate {
    constructor() {
      super();
      this.syncCount = 0;
      this.view = null;
    }

    synchronizeTopology({ network }) {
      this.syncCount += 1;
      this.view = network?.getNodeAttributeBuffer?.('_helios_visuals_position')?.view ?? null;
    }

    getNodePositionView(context) {
      this.ensureSynchronized(context);
      return this.view;
    }
  }

  const positionView = new Float32Array([
    0, 0, 0,
    1, 1, 1,
  ]);
  const network = {
    withBufferAccess: (fn) => fn(),
    getTopologyVersions: () => ({ node: 1, edge: 1 }),
    getNodeAttributeBuffer: (name) => {
      if (name === '_helios_visuals_position') return { view: positionView, version: 1 };
      if (name === '$index') return { version: 1 };
      return null;
    },
    getEdgeAttributeBuffer: (name) => {
      if (name === '$index') return { version: 1 };
      return null;
    },
    get nodeIndices() {
      return new Uint32Array([0, 1]);
    },
    get edgeIndices() {
      return new Uint32Array([0]);
    },
  };

  const delegate = new TrackingDelegate();
  delegate.onAttach({ network });
  assert.equal(delegate.syncCount, 1);

  delegate.getNodePositionView({ network });
  delegate.getNodePositionView({ network });
  assert.equal(delegate.syncCount, 1);
});
