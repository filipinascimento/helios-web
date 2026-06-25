import assert from 'node:assert/strict';
import test from 'node:test';
import { WebGL2Device } from '../src/rendering/engine/WebGL2Device.js';

function createFakeGl() {
  return {
    FRAMEBUFFER: 0x8D40,
    FRAMEBUFFER_COMPLETE: 0x8CD5,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    NO_ERROR: 0,
    boundFramebuffer: null,
    readPixelsCalls: 0,
    bindFramebuffer(_target, framebuffer) {
      this.boundFramebuffer = framebuffer;
    },
    isContextLost() {
      return false;
    },
    isFramebuffer() {
      return false;
    },
    isTexture() {
      return true;
    },
    checkFramebufferStatus() {
      return this.FRAMEBUFFER_COMPLETE;
    },
    getError() {
      return this.NO_ERROR;
    },
    readPixels() {
      this.readPixelsCalls += 1;
    },
  };
}

test('WebGL2Device.readPixels skips invalid framebuffers before issuing a GPU read', async () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
    const device = new WebGL2Device({ width: 4, height: 4 });
    device.gl = createFakeGl();
    const pixels = await device.readPixels({ handle: { stale: true }, texture: {}, width: 4, height: 4 }, {
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });
    assert.equal(device.gl.readPixelsCalls, 0);
    assert.deepEqual(Array.from(pixels), []);
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(warnings.length, 1);
  assert.match(String(warnings[0][0]), /invalid framebuffer target/i);
});

test('WebGL2Device.initialize forwards the antialias option to the WebGL context', async () => {
  const fakeGl = {
    BLEND: 0x0BE2,
    SRC_ALPHA: 0x0302,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    DEPTH_TEST: 0x0B71,
    LEQUAL: 0x0203,
    enable() {},
    blendFunc() {},
    depthFunc() {},
    clearDepth() {},
  };
  const calls = [];
  const canvas = {
    getContext(type, options) {
      calls.push({ type, options });
      return fakeGl;
    },
  };
  const device = new WebGL2Device(canvas, { antialias: false });
  device.setupPresentPipeline = () => {};
  await device.initialize();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, 'webgl2');
  assert.equal(calls[0].options.antialias, false);
  assert.equal(calls[0].options.premultipliedAlpha, true);
  assert.equal(calls[0].options.powerPreference, 'high-performance');
});

test('WebGL2Device.initialize forwards explicit WebGL context attributes', async () => {
  const fakeGl = {
    BLEND: 0x0BE2,
    SRC_ALPHA: 0x0302,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    DEPTH_TEST: 0x0B71,
    LEQUAL: 0x0203,
    enable() {},
    blendFunc() {},
    depthFunc() {},
    clearDepth() {},
  };
  const calls = [];
  const canvas = {
    getContext(type, options) {
      calls.push({ type, options });
      return fakeGl;
    },
  };
  const device = new WebGL2Device(canvas, {
    antialias: false,
    webglContextAttributes: {
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: 'low-power',
    },
  });
  device.setupPresentPipeline = () => {};
  await device.initialize();
  assert.equal(calls[0].options.antialias, true);
  assert.equal(calls[0].options.alpha, false);
  assert.equal(calls[0].options.preserveDrawingBuffer, true);
  assert.equal(calls[0].options.powerPreference, 'low-power');
});
