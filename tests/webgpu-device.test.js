import test from 'node:test';
import assert from 'node:assert/strict';
import { WebGPUDevice } from '../src/rendering/engine/WebGPUDevice.js';

function createFakeTexture(width, height) {
  return {
    width,
    height,
    createView() {
      return { width, height };
    },
  };
}

function createFakeCommandEncoder(passDescriptors) {
  return {
    beginRenderPass(descriptor) {
      passDescriptors.push(descriptor);
      return {
        setViewport() {},
        end() {},
      };
    },
    finish() {
      return {};
    },
  };
}

test('WebGPUDevice.beginFrame sizes depth attachments from the current swapchain texture during resize', () => {
  globalThis.GPUTextureUsage ??= {
    RENDER_ATTACHMENT: 1,
    TEXTURE_BINDING: 2,
    COPY_SRC: 4,
    COPY_DST: 8,
  };

  const currentTexture = createFakeTexture(2696, 884);
  const createdTextures = [];
  const passDescriptors = [];
  const canvas = { width: 2696, height: 1284 };
  const gpu = {
    createCommandEncoder() {
      return createFakeCommandEncoder(passDescriptors);
    },
    createTexture(options) {
      createdTextures.push(options);
      const width = options?.size?.width ?? 0;
      const height = options?.size?.height ?? 0;
      return createFakeTexture(width, height);
    },
    queue: {
      submit() {},
    },
  };

  const device = new WebGPUDevice(canvas);
  device.device = gpu;
  device.context = {
    getCurrentTexture() {
      return currentTexture;
    },
  };

  const frame = device.beginFrame(null, [0, 0, 0, 1]);

  assert.equal(frame.width, 2696);
  assert.equal(frame.height, 884);
  assert.equal(device.depthSize.width, 2696);
  assert.equal(device.depthSize.height, 884);
  assert.deepEqual(createdTextures[0]?.size, { width: 2696, height: 884, depthOrArrayLayers: 1 });
  assert.equal(passDescriptors.length, 1);
});

test('WebGPUDevice.beginFrame matches multisampled color attachments to the current swapchain texture size', () => {
  globalThis.GPUTextureUsage ??= {
    RENDER_ATTACHMENT: 1,
    TEXTURE_BINDING: 2,
    COPY_SRC: 4,
    COPY_DST: 8,
  };

  const currentTexture = createFakeTexture(1920, 1080);
  const createdTextures = [];
  const canvas = { width: 1920, height: 1200 };
  const gpu = {
    createCommandEncoder() {
      return createFakeCommandEncoder([]);
    },
    createTexture(options) {
      createdTextures.push(options);
      const width = options?.size?.width ?? 0;
      const height = options?.size?.height ?? 0;
      return createFakeTexture(width, height);
    },
    queue: {
      submit() {},
    },
  };

  const device = new WebGPUDevice(canvas);
  device.device = gpu;
  device.context = {
    getCurrentTexture() {
      return currentTexture;
    },
  };
  device.sampleCount = 4;

  const frame = device.beginFrame(null, [0, 0, 0, 1]);

  assert.equal(frame.width, 1920);
  assert.equal(frame.height, 1080);
  assert.equal(device.colorSize.width, 1920);
  assert.equal(device.colorSize.height, 1080);
  assert.equal(device.depthSize.width, 1920);
  assert.equal(device.depthSize.height, 1080);
  assert.deepEqual(createdTextures[0]?.size, { width: 1920, height: 1080, depthOrArrayLayers: 1 });
  assert.deepEqual(createdTextures[1]?.size, { width: 1920, height: 1080, depthOrArrayLayers: 1 });
});
