import { test, expect } from '@playwright/test';
import {
  Mapper,
  createDefaultMappers,
} from '../src/pipeline/Mapper.js';
import { AttributeType } from 'helios-network';
import { EDGE_ENDPOINTS_SIZE_ATTRIBUTE } from '../src/pipeline/constants.js';
import { DEFAULT_NODE_SIZE } from '../src/pipeline/constants.js';

test('maps linear channel with rule override', () => {
  const mapper = new Mapper({ mode: 'node' });
  mapper
    .channel('size')
    .from(['degree', 'clustering'])
    .transform(({ degree, clustering }) => degree + clustering)
    .linear([0, 10], [0, 20])
    .default(2)
    .rule({
      attributes: ['betweenness'],
      when: (inputs) => {
        const value = typeof inputs === 'number' ? inputs : inputs?.betweenness;
        return (value ?? 0) > 5;
      },
      type: 'linear',
      domain: [0, 10],
      range: [10, 30],
      defaultValue: 10,
    })
    .done();

  const base = mapper.mapItem({ attributes: { degree: 2, clustering: 3 } });
  expect(base.size).toBeCloseTo(10);

  const overridden = mapper.mapItem({ attributes: { degree: 2, clustering: 3, betweenness: 8 } });
  expect(overridden.size).toBeGreaterThan(20);
});

test('categorical mapping works via config object', () => {
  const mapper = new Mapper({ mode: 'node' });
  mapper.setChannel('color', {
    attributes: 'community',
    type: 'categorical',
    domain: ['A', 'B'],
    range: ['red', 'blue'],
    defaultValue: 'gray',
  });

  const a = mapper.mapItem({ attributes: { community: 'A' } });
  expect(a.color).toBe('red');

  const fallback = mapper.mapItem({ attributes: { community: 'C' } });
  expect(fallback.color).toBe('gray');
});

test('categorical color mapping defaults unmatched values to gray', () => {
  const mapper = new Mapper({ mode: 'node' });
  mapper.setChannel('color', {
    attributes: 'community',
    type: 'categorical',
    domain: ['A', 'B'],
    range: ['red', 'blue'],
  });

  const fallback = mapper.mapItem({ attributes: { community: 'C' } });
  expect(fallback.color).toBe('#888888ff');
});

test('nodeToEdge passthrough returns endpoint values', () => {
  const edgeMapper = new Mapper({ mode: 'edge' });
  edgeMapper.channel('color').from('@node.community').nodeToEdge().done();

  const mapped = edgeMapper.mapItem({
    source: { attributes: { community: 'A' } },
    target: { attributes: { community: 'B' } },
  });
  expect(mapped.color).toEqual({ source: 'A', target: 'B' });
});

test('nodeAttribute mapping duplicates endpoints when requested', () => {
  const sourceOnly = new Mapper({ mode: 'edge' });
  sourceOnly.channel('endpointSize').nodeAttribute('size', 'source').done();
  const mappedSource = sourceOnly.mapItem({
    source: { attributes: { size: 2 } },
    target: { attributes: { size: 7 } },
  });
  expect(mappedSource.endpointSize).toEqual({ source: 2, target: 2 });

  const destOnly = new Mapper({ mode: 'edge' });
  destOnly.channel('endpointSize').nodeAttribute('size', 'destination').done();
  const mappedDest = destOnly.mapItem({
    source: { attributes: { size: 4 } },
    target: { attributes: { size: 9 } },
  });
  expect(mappedDest.endpointSize).toEqual({ source: 9, target: 9 });

  const both = new Mapper({ mode: 'edge' });
  both.channel('endpointSize').nodeAttribute('size', 'both').done();
  const mappedBoth = both.mapItem({
    source: { attributes: { size: 3 } },
    target: { attributes: { size: 5 } },
  });
  expect(mappedBoth.endpointSize).toEqual({ source: 3, target: 5 });
});

test('nodeAttribute mapping registers node-to-edge passthrough and replaces prior mapping', () => {
  class FakeBuffer {
    constructor(dimension, type) {
      this.dimension = dimension;
      this.type = type;
      this.view = new Float32Array(dimension * 4);
    }
  }
  class FakeNetwork {
    constructor() {
      this.nodeAttributes = new Map();
      this.edgeAttributes = new Map();
      this.removed = [];
      this.nodeToEdgeCalls = [];
    }
    defineNodeAttribute(name, type, dimension) {
      this.nodeAttributes.set(name, new FakeBuffer(dimension, type));
    }
    defineEdgeAttribute(name, type, dimension) {
      this.edgeAttributes.set(name, new FakeBuffer(dimension, type));
    }
    defineNodeToEdgeAttribute(source, edge, endpoints, doubleWidth) {
      const dim = this.nodeAttributes.get(source)?.dimension ?? 1;
      const edgeDim = doubleWidth ? dim * 2 : dim;
      this.edgeAttributes.set(edge, new FakeBuffer(edgeDim, AttributeType.Float));
      this.nodeToEdgeCalls.push({ source, edge, endpoints, doubleWidth });
    }
    getNodeAttributeBuffer(name) {
      const buffer = this.nodeAttributes.get(name);
      if (!buffer) throw new Error(`missing node attr ${name}`);
      return buffer;
    }
    getEdgeAttributeBuffer(name) {
      const buffer = this.edgeAttributes.get(name);
      if (!buffer) throw new Error(`missing edge attr ${name}`);
      return buffer;
    }
    removeNodeToEdgeAttribute(edge) {
      this.removed.push(edge);
      this.edgeAttributes.delete(edge);
    }
  }

  const network = new FakeNetwork();
  const mapper = new Mapper({ mode: 'edge', network });

  mapper.channel('endpointSize').nodeAttribute('customSize', 'destination').done();
  expect(network.nodeToEdgeCalls[0]).toMatchObject({
    source: 'customSize',
    edge: EDGE_ENDPOINTS_SIZE_ATTRIBUTE,
    endpoints: 'destination',
    doubleWidth: true,
  });

  mapper.channel('endpointSize').nodeAttribute('otherSize', 'source').done();
  expect(network.removed).toContain(EDGE_ENDPOINTS_SIZE_ATTRIBUTE);
  expect(network.nodeToEdgeCalls.at(-1)).toMatchObject({
    source: 'otherSize',
    edge: EDGE_ENDPOINTS_SIZE_ATTRIBUTE,
    endpoints: 'source',
    doubleWidth: true,
  });
});

test('nodeAttribute mapping retries node-to-edge registration when edge attribute removal fails once', () => {
  class FakeBuffer {
    constructor(dimension, type) {
      this.dimension = dimension;
      this.type = type;
      this.view = new Float32Array(dimension * 4);
      this.stride = dimension * Float32Array.BYTES_PER_ELEMENT;
    }
  }

  class FakeNetwork {
    constructor() {
      this.nodeAttributes = new Map();
      this.edgeAttributes = new Map();
      this.nodeToEdgeCalls = [];
      this.nodeToEdge = new Map();
      this.removeEdgeCalls = 0;
    }
    defineNodeAttribute(name, type, dimension) {
      if (!this.nodeAttributes.has(name)) {
        this.nodeAttributes.set(name, new FakeBuffer(dimension, type));
      }
    }
    defineEdgeAttribute(name, type, dimension) {
      if (!this.edgeAttributes.has(name)) {
        this.edgeAttributes.set(name, new FakeBuffer(dimension, type));
      }
    }
    removeNodeToEdgeAttribute(edge) {
      this.nodeToEdge.delete(edge);
    }
    removeEdgeAttribute(name) {
      this.removeEdgeCalls += 1;
      if (this.removeEdgeCalls === 1) {
        throw new Error('simulated removeEdgeAttribute failure');
      }
      this.edgeAttributes.delete(name);
    }
    hasNodeToEdgeAttribute(edge) {
      return this.nodeToEdge.has(edge);
    }
    defineNodeToEdgeAttribute(source, edge, endpoints, doubleWidth) {
      if (this.edgeAttributes.has(edge)) {
        throw new Error(`Edge attribute "${edge}" already exists; remove it before registering a node-to-edge passthrough`);
      }
      const dim = this.nodeAttributes.get(source)?.dimension ?? 1;
      const edgeDim = doubleWidth ? dim * 2 : dim;
      this.edgeAttributes.set(edge, new FakeBuffer(edgeDim, AttributeType.Float));
      this.nodeToEdgeCalls.push({ source, edge, endpoints, doubleWidth });
      this.nodeToEdge.set(edge, { source, endpoints, doubleWidth });
    }
    getNodeAttributeBuffer(name) {
      const buffer = this.nodeAttributes.get(name);
      if (!buffer) throw new Error(`missing node attr ${name}`);
      return buffer;
    }
    getEdgeAttributeBuffer(name) {
      const buffer = this.edgeAttributes.get(name);
      if (!buffer) throw new Error(`missing edge attr ${name}`);
      return buffer;
    }
  }

  const network = new FakeNetwork();
  const mapper = new Mapper({ mode: 'edge', network });

  // Ensure the target edge attribute already exists so the first defineNodeToEdgeAttribute will
  // throw if removal fails.
  network.defineEdgeAttribute(EDGE_ENDPOINTS_SIZE_ATTRIBUTE, AttributeType.Float, 2);

  mapper.channel('endpointSize').nodeAttribute('size', 'source').done();

  expect(network.nodeToEdgeCalls.at(-1)).toMatchObject({
    edge: EDGE_ENDPOINTS_SIZE_ATTRIBUTE,
    endpoints: 'source',
    doubleWidth: true,
  });
  expect(network.removeEdgeCalls).toBeGreaterThanOrEqual(2);
  expect(network.hasNodeToEdgeAttribute(EDGE_ENDPOINTS_SIZE_ATTRIBUTE)).toBe(true);
});

test('default mappers expose sensible defaults', () => {
  const { nodeMapper, edgeMapper } = createDefaultMappers();
  const node = nodeMapper.mapItem({ attributes: {} }, { index: 3 });
  expect(node.size).toBe(DEFAULT_NODE_SIZE);
  expect(node.outline).toBeGreaterThan(0);
  expect(node.color).toBeTruthy();

  const edge = edgeMapper.mapItem({
    source: { attributes: { color: '#111111' } },
    target: { attributes: { color: '#222222' } },
  });
  expect(edge.width).toBe(1);
  expect(edge.color).toEqual({ source: '#111111', target: '#222222' });
});
