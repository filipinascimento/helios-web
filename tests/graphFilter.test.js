import test from 'node:test';
import assert from 'node:assert/strict';
import { Helios, HeliosFilter } from '../src/index.js';

function createHarness({
  filteredNodes = [1, 2],
  filteredEdges = [1],
} = {}) {
  let topologyNodeVersion = 1;
  let topologyEdgeVersion = 1;
  let filterCalls = 0;
  const filterInputs = [];

  const network = {
    nodeCount: 4,
    edgeCount: 3,
    nodeIndices: new Uint32Array([0, 1, 2, 3]),
    edgeIndices: new Uint32Array([0, 1, 2]),
    getTopologyVersions() {
      return { node: topologyNodeVersion, edge: topologyEdgeVersion };
    },
    filterSubgraph(options) {
      filterCalls += 1;
      filterInputs.push(options);
      return {
        nodeIndices: new Uint32Array(filteredNodes),
        edgeIndices: new Uint32Array(filteredEdges),
      };
    },
  };

  let geometryRequests = 0;
  let renderRequests = 0;
  const layoutRequests = [];
  let layoutUpdates = 0;
  let labelReselects = 0;
  const emitted = [];

  const helios = Object.create(Helios.prototype);
  helios.network = network;
  helios.scheduler = {
    requestGeometry: () => { geometryRequests += 1; },
    requestRender: () => { renderRequests += 1; },
    requestLayout: (reason) => { layoutRequests.push(reason); },
  };
  helios._layout = {
    network,
    requestUpdate: () => { layoutUpdates += 1; },
  };
  helios._labels = {
    requestFullReselect: () => { labelReselects += 1; },
  };
  helios.debug = { log: () => {} };
  helios.emit = (type, detail) => {
    emitted.push({ type, detail });
    return null;
  };

  return {
    helios,
    network,
    emitted,
    layoutRequests,
    getGeometryRequests: () => geometryRequests,
    getRenderRequests: () => renderRequests,
    getLayoutUpdates: () => layoutUpdates,
    getLabelReselects: () => labelReselects,
    getFilterCalls: () => filterCalls,
    getFilterInputs: () => filterInputs,
    setTopologyVersions(nodeVersion, edgeVersion) {
      topologyNodeVersion = nodeVersion;
      topologyEdgeVersion = edgeVersion;
    },
  };
}

test('setGraphFilter() applies filtered render network with render-only scope', () => {
  const harness = createHarness({ filteredNodes: [1], filteredEdges: [0] });
  const { helios, network, getFilterCalls, getFilterInputs, getGeometryRequests, getRenderRequests } = harness;

  helios.setGraphFilter({ nodeQuery: 'weight >= 0.5', scope: 'render' });

  assert.equal(getFilterCalls(), 1);
  assert.equal(getFilterInputs()[0].nodeQuery, 'weight >= 0.5');
  const renderNetwork = helios._getRenderNetwork();
  assert.notEqual(renderNetwork, network);
  assert.deepEqual(Array.from(renderNetwork.nodeIndices), [1]);
  assert.deepEqual(Array.from(renderNetwork.edgeIndices), [0]);
  assert.equal(helios._getLayoutNetwork(), network);
  assert.equal(getGeometryRequests(), 1);
  assert.equal(getRenderRequests(), 1);

  const filterState = helios.getGraphFilter();
  assert.equal(filterState.enabled, true);
  assert.equal(filterState.scope, 'render');
  assert.equal(filterState.nodeCount, 1);
  assert.equal(filterState.edgeCount, 1);
});

test('setGraphFilter() with render+layout scope updates layout network', () => {
  const harness = createHarness({ filteredNodes: [0, 2], filteredEdges: [2] });
  const { helios, network, layoutRequests, getLayoutUpdates } = harness;

  helios.setGraphFilter({
    nodeSelection: new Uint32Array([0, 2]),
    scope: 'render+layout',
  });

  const renderNetwork = helios._getRenderNetwork();
  assert.notEqual(renderNetwork, network);
  assert.equal(helios._getLayoutNetwork(), renderNetwork);
  assert.equal(helios._layout.network, renderNetwork);
  assert.ok(layoutRequests.length >= 1);
  assert.ok(getLayoutUpdates() >= 1);
});

test('active graph filters recompute when topology versions change', () => {
  const harness = createHarness({ filteredNodes: [1], filteredEdges: [1] });
  const { helios, getFilterCalls, setTopologyVersions } = harness;

  helios.setGraphFilter({ nodeQuery: 'weight >= 0.5' });
  assert.equal(getFilterCalls(), 1);
  assert.deepEqual(Array.from(helios._getRenderNetwork().nodeIndices), [1]);

  setTopologyVersions(2, 2);
  // Swap filter output to prove recomputation happened.
  helios.network.filterSubgraph = () => ({
    nodeIndices: new Uint32Array([3]),
    edgeIndices: new Uint32Array([]),
  });
  assert.deepEqual(Array.from(helios._getRenderNetwork().nodeIndices), [3]);
});

test('clearGraphFilter() restores base network for rendering and layout', () => {
  const harness = createHarness({ filteredNodes: [2], filteredEdges: [1] });
  const { helios, network, getGeometryRequests, getRenderRequests } = harness;

  helios.setGraphFilter({ nodeQuery: 'weight >= 0.5', scope: 'render+layout' });
  assert.notEqual(helios._getRenderNetwork(), network);

  helios.clearGraphFilter();
  assert.equal(helios._getRenderNetwork(), network);
  assert.equal(helios._getLayoutNetwork(), network);
  assert.equal(helios._layout.network, network);
  assert.equal(helios.getGraphFilter().enabled, false);
  assert.ok(getGeometryRequests() >= 2);
  assert.ok(getRenderRequests() >= 2);
});

test('activateHeliosFilter() applies a HeliosFilter instance and tracks it as active', () => {
  const harness = createHarness({ filteredNodes: [1, 3], filteredEdges: [1] });
  const { helios, getFilterInputs } = harness;

  const filter = new HeliosFilter({ scope: 'render+layout' });
  filter.addRule({
    scope: 'node',
    type: 'numeric',
    attribute: 'weight',
    min: 0.25,
    max: 0.75,
    extentMin: 0,
    extentMax: 1,
  });
  filter.addRule({
    scope: 'edge',
    type: 'query',
    query: 'intensity >= 0.3',
  });

  helios.activateHeliosFilter(filter);

  assert.equal(helios.getActiveHeliosFilter(), filter);
  assert.equal(getFilterInputs().length, 1);
  assert.match(getFilterInputs()[0].nodeQuery, /weight >= 0\.25/);
  assert.equal(getFilterInputs()[0].edgeQuery, 'intensity >= 0.3');
  assert.equal(helios.getGraphFilter().scope, 'render+layout');
});
