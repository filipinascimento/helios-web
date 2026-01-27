import test from 'node:test';
import assert from 'node:assert/strict';

import { GraphLayer } from '../src/rendering/engine/GraphLayer.js';
import { VISUAL_ATTRIBUTE_NAMES } from '../src/pipeline/constants.js';

test('derived edge versions include source node version for node-to-edge passthroughs', () => {
  const layer = new GraphLayer();
  const { EDGE_COLOR_ATTRIBUTE, NODE_COLOR_ATTRIBUTE } = VISUAL_ATTRIBUTE_NAMES;
  const {
    NODE_POSITION_ATTRIBUTE,
    NODE_SIZE_ATTRIBUTE,
    NODE_STATE_ATTRIBUTE,
    NODE_OUTLINE_WIDTH_ATTRIBUTE,
    NODE_OUTLINE_COLOR_ATTRIBUTE,
    EDGE_OPACITY_ATTRIBUTE,
    EDGE_WIDTH_ATTRIBUTE,
    EDGE_STATE_ATTRIBUTE,
    EDGE_ENDPOINTS_POSITION_ATTRIBUTE,
    EDGE_ENDPOINTS_SIZE_ATTRIBUTE,
    EDGE_ENDPOINTS_STATE_ATTRIBUTE,
  } = VISUAL_ATTRIBUTE_NAMES;

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
      const makeFloat = (length = 0, count = 0) => ({
        view: new Float32Array(length),
        version: 0,
        count,
        topologyVersion: 0,
      });
      const makeUint = (length = 0, count = 0) => ({
        view: new Uint32Array(length),
        version: 0,
        count,
        topologyVersion: 0,
      });

      views.node[NODE_POSITION_ATTRIBUTE] = makeFloat(0, 0);
      views.node[NODE_COLOR_ATTRIBUTE] = makeFloat(0, 0);
      views.node[NODE_SIZE_ATTRIBUTE] = makeFloat(0, 0);
      views.node[NODE_STATE_ATTRIBUTE] = makeUint(0, 0);
      views.node[NODE_OUTLINE_WIDTH_ATTRIBUTE] = makeFloat(0, 0);
      views.node[NODE_OUTLINE_COLOR_ATTRIBUTE] = makeFloat(0, 0);

      views.edge[EDGE_COLOR_ATTRIBUTE] = makeFloat(8, 1);
      views.edge[EDGE_OPACITY_ATTRIBUTE] = makeFloat(0, 1);
      views.edge[EDGE_WIDTH_ATTRIBUTE] = makeFloat(0, 1);
      views.edge[EDGE_STATE_ATTRIBUTE] = makeUint(0, 1);
      views.edge[EDGE_ENDPOINTS_POSITION_ATTRIBUTE] = makeFloat(0, 1);
      views.edge[EDGE_ENDPOINTS_SIZE_ATTRIBUTE] = makeFloat(0, 1);
      views.edge[EDGE_ENDPOINTS_STATE_ATTRIBUTE] = makeUint(0, 1);

      views.edge[EDGE_COLOR_ATTRIBUTE].version = 11;
      for (const [scope, name] of requests) {
        if (scope === 'edge' && name === EDGE_COLOR_ATTRIBUTE) {
          // Dense edge color already provided above.
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
