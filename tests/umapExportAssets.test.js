import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import HeliosNetwork from 'helios-network';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_UMAP_DIR = path.resolve(__dirname, '../public/assets/umap');
const EXPORTED_CASES = [
  { nodeCount: 200, file: 'gaussian-200.zxnet' },
  { nodeCount: 2000, file: 'gaussian-2000.zxnet' },
  { nodeCount: 20000, file: 'gaussian-20000.zxnet' },
];

for (const exportedCase of EXPORTED_CASES) {
  test(`real exported UMAP asset ${exportedCase.file} loads with expected metadata`, async () => {
    const target = path.join(PUBLIC_UMAP_DIR, exportedCase.file);
    const payload = await fs.readFile(target);
    const network = await HeliosNetwork.fromZXNet(new Uint8Array(payload));

    try {
      assert.equal(network.nodeCount, exportedCase.nodeCount);
      assert.equal(network.getNetworkStringAttribute('umap'), 'true');
      assert.equal(network.getNetworkStringAttribute('umap_graph_kind'), 'fuzzy_simplicial_set');
      assert.equal(network.getNetworkStringAttribute('umap_edge_weight_attr'), 'umap_weight');
      assert.equal(network.getNetworkStringAttribute('umap_node_mass_attr'), 'umap_mass');
      assert.equal(network.getNetworkAttributeInfo('umap_embedding_attr'), null);
      assert.equal(network.getNetworkAttributeInfo('umap_position_attr'), null);
      assert.equal(network.getNetworkStringAttribute('umap_example_name'), `gaussian-${exportedCase.nodeCount}`);
      assert.equal(network.hasNodeAttribute('test_cluster'), true);
      assert.equal(network.hasNodeAttribute('category'), true);
      assert.equal(network.hasNodeAttribute('label'), true);
      assert.equal(network.hasNodeAttribute('weight'), true);
      assert.equal(network.hasNodeAttribute('umap_embedding'), false);
      assert.equal(network.hasNodeAttribute('_helios_visuals_position'), false);
      assert.equal(network.hasNodeAttribute('umap_mass'), true);
      assert.equal(network.hasEdgeAttribute('umap_weight'), true);

      let uniqueClusterCount = 0;
      network.withBufferAccess(() => {
        const clusterView = network.getNodeAttributeBuffer('test_cluster')?.view ?? null;
        if (clusterView) {
          uniqueClusterCount = new Set(Array.from(clusterView)).size;
        }
      });

      assert.ok(uniqueClusterCount >= 4);
      assert.ok(network.edgeCount > exportedCase.nodeCount);
    } finally {
      network.dispose?.();
    }
  });
}
