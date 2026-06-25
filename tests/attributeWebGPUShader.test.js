import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAttributeWebGPUSources } from '../src/rendering/engine/shaders/attributeWebGPU.js';

test('attributeWebGPU WGSL applies +1 offset only for raw index encoded inputs', () => {
  const raw = createAttributeWebGPUSources({
    node: { indexEncodedRaw: true },
    edge: { indexEncodedRaw: true },
    encodedOutputMode: 'uint32',
    encodedInputMode: 'uint32',
  });
  assert.match(raw.nodeWGSL, /output\.encoded = input\.encoded \+ 1u;/);
  assert.match(raw.edgeWGSL, /output\.encoded = input\.encoded \+ 1u;/);

  const encoded = createAttributeWebGPUSources({
    node: { indexEncodedRaw: false },
    edge: { indexEncodedRaw: false },
    encodedOutputMode: 'uint32',
    encodedInputMode: 'uint32',
  });
  assert.equal(/output\.encoded = input\.encoded \+ 1u;/.test(encoded.nodeWGSL), false);
  assert.equal(/output\.encoded = input\.encoded \+ 1u;/.test(encoded.edgeWGSL), false);
});
