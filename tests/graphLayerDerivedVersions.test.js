import test from 'node:test';
import assert from 'node:assert/strict';

import { GraphLayer } from '../src/rendering/engine/GraphLayer.js';
import { VISUAL_ATTRIBUTE_NAMES } from '../src/pipeline/constants.js';

test('derived edge versions include source node version for node-to-edge passthroughs', () => {
  const layer = new GraphLayer();
  const { EDGE_COLOR_ATTRIBUTE, NODE_COLOR_ATTRIBUTE } = VISUAL_ATTRIBUTE_NAMES;

  const network = {
    updateDenseNodeIndexBuffer() {},
    updateDenseEdgeIndexBuffer() {},
    updateDenseNodeAttributeBuffer() {},
    updateDenseEdgeAttributeBuffer() {},
    getDenseNodePackingInfo() {
      return { indicesAreIdentity: true, count: 0 };
    },
    getDenseEdgePackingInfo() {
      return { indicesAreIdentity: true, count: 1 };
    },
    withDenseBufferViews(requests, cb) {
      const views = { node: {}, edge: {} };
      for (const [scope, name] of requests) {
        if (scope === 'edge' && name === EDGE_COLOR_ATTRIBUTE) {
          views.edge[name] = {
            view: new Float32Array(8),
            version: 11,
            count: 1,
            topologyVersion: 0,
          };
        }
      }
      return cb(views);
    },
    hasNodeToEdgeAttribute(name) {
      return name === EDGE_COLOR_ATTRIBUTE;
    },
    getNodeToEdgePassthroughs() {
      return [
        {
          edgeName: EDGE_COLOR_ATTRIBUTE,
          sourceName: NODE_COLOR_ATTRIBUTE,
          endpoints: 'both',
          doubleWidth: true,
        },
      ];
    },
    getEdgeAttributeVersion(name) {
      return name === EDGE_COLOR_ATTRIBUTE ? 5 : 0;
    },
    getNodeAttributeVersion(name) {
      return name === NODE_COLOR_ATTRIBUTE ? 7 : 0;
    },
  };

  const geometry = layer.withDenseGraph(network, (g) => g, [['edge', EDGE_COLOR_ATTRIBUTE]]);
  const version = geometry?.edges?.versions?.colors ?? null;

  assert.equal(typeof version, 'string');
  assert.ok(version.includes('srcVer:7'), `expected srcVer in ${version}`);
});
