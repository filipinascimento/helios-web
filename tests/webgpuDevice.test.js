import assert from 'node:assert/strict';
import test from 'node:test';
import { WebGPUDevice } from '../src/rendering/engine/WebGPUDevice.js';

function installNavigatorGpu(gpu) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { gpu },
  });
  return () => {
    if (original) {
      Object.defineProperty(globalThis, 'navigator', original);
    } else {
      delete globalThis.navigator;
    }
  };
}

test('WebGPUDevice.initialize forwards adapter, device, and canvas options', async () => {
  const calls = {};
  const fakeDevice = {
    limits: {
      maxStorageBufferBindingSize: 384 * 1024 * 1024,
      maxBufferSize: 300 * 1024 * 1024,
    },
  };
  const fakeAdapter = {
    limits: {
      maxStorageBufferBindingSize: 512 * 1024 * 1024,
      maxBufferSize: 1024 * 1024 * 1024,
      maxStorageBuffersPerShaderStage: 12,
    },
    async requestDevice(descriptor) {
      calls.deviceDescriptor = descriptor;
      return fakeDevice;
    },
  };
  const restoreNavigator = installNavigatorGpu({
    async requestAdapter(options) {
      calls.adapterOptions = options;
      return fakeAdapter;
    },
    getPreferredCanvasFormat() {
      return 'bgra8unorm';
    },
  });
  try {
    const canvas = {
      getContext(type) {
        calls.contextType = type;
        return {
          configure(config) {
            calls.canvasConfiguration = config;
          },
        };
      },
    };
    const device = new WebGPUDevice(canvas, {
      webgpuAdapterOptions: {
        powerPreference: 'low-power',
        forceFallbackAdapter: true,
      },
      webgpuDeviceDescriptor: {
        label: 'custom-device',
        requiredFeatures: ['timestamp-query'],
        requiredLimits: {
          maxBufferSize: 300 * 1024 * 1024,
        },
      },
      webgpuCanvasConfiguration: {
        alphaMode: 'opaque',
        format: 'rgba8unorm',
        usage: 0x10,
      },
    });
    device.createQuadBuffer = () => {};
    device.createPresentPipeline = () => {};

    await device.initialize();

    assert.deepEqual(calls.adapterOptions, {
      powerPreference: 'low-power',
      forceFallbackAdapter: true,
    });
    assert.equal(calls.deviceDescriptor.label, 'custom-device');
    assert.deepEqual(calls.deviceDescriptor.requiredFeatures, ['timestamp-query']);
    assert.equal(calls.deviceDescriptor.requiredLimits.maxStorageBufferBindingSize, 384 * 1024 * 1024);
    assert.equal(calls.deviceDescriptor.requiredLimits.maxBufferSize, 300 * 1024 * 1024);
    assert.equal(calls.deviceDescriptor.requiredLimits.maxStorageBuffersPerShaderStage, 10);
    assert.equal(calls.contextType, 'webgpu');
    assert.equal(calls.canvasConfiguration.device, fakeDevice);
    assert.equal(calls.canvasConfiguration.format, 'rgba8unorm');
    assert.equal(calls.canvasConfiguration.alphaMode, 'opaque');
    assert.equal(calls.canvasConfiguration.usage, 0x10);
  } finally {
    restoreNavigator();
  }
});
