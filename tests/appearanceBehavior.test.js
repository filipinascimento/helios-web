import test from 'node:test';
import assert from 'node:assert/strict';
import { Helios } from '../src/index.js';
import { AppearanceBehavior, BehaviorManager, BehaviorRegistry } from '../src/behaviors/index.js';

function createAppearanceHeliosHarness() {
  const eventTarget = new EventTarget();
  const helios = Object.create(Helios.prototype);
  helios.addEventListener = eventTarget.addEventListener.bind(eventTarget);
  helios.removeEventListener = eventTarget.removeEventListener.bind(eventTarget);
  helios.dispatchEvent = eventTarget.dispatchEvent.bind(eventTarget);
  helios.on = function on(type, handler, options) {
    this.addEventListener(type, handler, options);
    return () => this.removeEventListener(type, handler, options);
  };
  helios.emit = function emit(type, detail) {
    const event = new Event(type);
    event.detail = detail;
    this.dispatchEvent(event);
  };
  helios.options = {};
  helios.scheduler = { requestRender() {} };
  helios.renderer = {
    clearColor: [1, 1, 1, 1],
    device: { type: 'webgpu' },
    graphLayer: {
      edgeTransparencyMode: 'weighted',
      nodeSizeScale: 1,
      nodeOpacityScale: 1,
      nodeOutlineWidthScale: 1,
      edgeWidthScale: 1,
      edgeOpacityScale: 1,
      nodeBlendWithEdges: false,
      edgeWidthClampToNodeDiameter: true,
      edgeFastRendering: false,
      shadedEnabled: false,
      shadedNodes: true,
      shadedEdges: false,
      shadedLightDirection: [0.577350269, 0.577350269, 0.577350269],
      shadedLightColor: [1, 1, 1, 1],
      shadedAmbientTopColor: [1, 1, 1, 1],
      shadedAmbientBottomColor: [163 / 255, 163 / 255, 163 / 255, 1],
      shadedDiffuseStrength: 0.5,
      shadedAmbientStrength: 1,
      shadedSpecularColor: [1, 1, 1, 1],
      shadedSpecularStrength: 0,
      shadedShininess: 16,
      ambientOcclusionEnabled: false,
      ambientOcclusionNodes: true,
      ambientOcclusionEdges: false,
      ambientOcclusionStrength: 1.5,
      ambientOcclusionRadius: 50,
      ambientOcclusionBias: 1.5,
      ambientOcclusionMode: 'fast',
      ambientOcclusionIntensityScale: 1,
      ambientOcclusionIntensityShift: 0,
      ambientOcclusionQuality: 'medium',
    },
  };
  helios._pendingRendererProps = new Map();
  helios._pendingGraphLayerProps = new Map();
  helios._edgeAdaptiveQualityConfig = undefined;
  helios._edgeAdaptiveRuntime = null;
  return helios;
}

function attachAppearanceBehavior(helios = createAppearanceHeliosHarness(), options = {}) {
  const manager = new BehaviorManager(
    helios,
    new BehaviorRegistry().register('appearance', AppearanceBehavior),
  );
  const appearance = manager.use('appearance', options);
  return { helios, manager, appearance };
}

test('appearance behavior registers and exposes public state', () => {
  const { manager, appearance } = attachAppearanceBehavior();

  assert.ok(appearance instanceof AppearanceBehavior);
  assert.equal(manager.get('appearance'), appearance);
  assert.deepEqual(appearance.background(), [1, 1, 1, 1]);
  assert.equal(appearance.edgeTransparencyMode(), 'weighted');
  assert.equal(appearance.supportsAmbientOcclusion(), true);
  assert.equal(appearance.appearance().shaded.enabled, false);
});

test('appearance behavior updates appearance policy through public commands', () => {
  const { helios, appearance } = attachAppearanceBehavior();

  appearance.update({
    background: '#102030cc',
    edgeTransparencyMode: 'alpha',
    nodeStyle: {
      sizeScale: 2.5,
      opacityScale: 0.75,
      outlineWidthScale: 1.3,
      blendWithEdges: true,
    },
    edgeStyle: {
      widthScale: 1.8,
      opacityScale: 0.45,
      fastRendering: true,
      clampToNodeDiameter: false,
      adaptiveQuality: {
        enabled: false,
        slowFrameThresholdMs: 33,
        averageWindowFrames: 5,
        probeIntervalMs: 1200,
        interactionHoldMs: 240,
        fastDuringCamera: false,
        fastDuringLayout: false,
      },
    },
    shaded: {
      enabled: true,
      nodes: false,
      edges: true,
      lightDirection: [0, 0, 1],
      diffuseStrength: 0.7,
      ambientStrength: 1.4,
      shininess: 24,
    },
    ambientOcclusion: {
      enabled: true,
      nodes: false,
      edges: true,
      strength: 2,
      mode: 'smooth',
      quality: 'high',
    },
  });

  assert.deepEqual(helios.background(), [0x10 / 255, 0x20 / 255, 0x30 / 255, 0xcc / 255]);
  assert.equal(helios.edgeTransparencyMode(), 'alpha');
  assert.equal(helios.nodeSizeScale(), 2.5);
  assert.equal(helios.nodeOpacityScale(), 0.75);
  assert.equal(helios.nodeOutlineWidthScale(), 1.3);
  assert.equal(helios.nodeBlendWithEdges(), true);
  assert.equal(helios.edgeWidthScale(), 1.8);
  assert.equal(helios.edgeOpacityScale(), 0.45);
  assert.equal(helios.edgeFastRendering(), true);
  assert.equal(helios.edgeWidthClampToNodeDiameter(), false);
  assert.equal(helios.edgeAdaptiveQuality().enabled, false);
  assert.equal(helios.edgeAdaptiveQuality().slowFrameThresholdMs, 33);
  assert.equal(helios.shadedEnabled(), true);
  assert.equal(helios.shadedNodes(), false);
  assert.equal(helios.shadedEdges(), true);
  assert.deepEqual(appearance.shadedLightDirection(), [0, 0, 1]);
  assert.equal(helios.ambientOcclusionEnabled(), true);
  assert.equal(helios.ambientOcclusionNodes(), false);
  assert.equal(helios.ambientOcclusionEdges(), true);
  assert.equal(helios.ambientOcclusionMode(), 'smooth');
  assert.equal(helios.ambientOcclusionQuality(), 'high');
});

test('appearance behavior emits change events when Helios appearance state changes externally', () => {
  const { helios, appearance } = attachAppearanceBehavior();
  const observed = [];

  appearance.on('change', (event) => {
    observed.push(event.detail?.name ?? event.detail?.reason ?? null);
  });

  helios.background('#223344ff');
  helios.edgeTransparencyMode('screen');

  assert.equal(observed.includes('clearColor'), true);
  assert.equal(observed.includes('edgeTransparencyMode'), true);
  assert.deepEqual(appearance.background(), [0x22 / 255, 0x33 / 255, 0x44 / 255, 1]);
  assert.equal(appearance.edgeTransparencyMode(), 'screen');
});

test('appearance behavior serializes and restores public appearance config', () => {
  const { appearance } = attachAppearanceBehavior();
  appearance.update({
    background: '#203040ff',
    edgeTransparencyMode: 'screen',
    nodeStyle: { sizeScale: 1.6, blendWithEdges: true },
    edgeStyle: {
      widthScale: 2.2,
      adaptiveQuality: { enabled: false, averageWindowFrames: 4 },
    },
    shaded: { enabled: true, edges: true, diffuseStrength: 0.4 },
    ambientOcclusion: { enabled: true, strength: 2.4, quality: 'ultra' },
  });
  const snapshot = appearance.serialize();

  const { appearance: restored } = attachAppearanceBehavior();
  restored.restore(snapshot);

  assert.deepEqual(restored.background(), [0x20 / 255, 0x30 / 255, 0x40 / 255, 1]);
  assert.equal(restored.edgeTransparencyMode(), 'screen');
  assert.equal(restored.nodeSizeScale(), 1.6);
  assert.equal(restored.nodeBlendWithEdges(), true);
  assert.equal(restored.edgeWidthScale(), 2.2);
  assert.equal(restored.edgeAdaptiveQuality().enabled, false);
  assert.equal(restored.edgeAdaptiveQuality().slowFrameConsecutiveFrames, 4);
  assert.equal(restored.shadedEnabled(), true);
  assert.equal(restored.shadedEdges(), true);
  assert.equal(restored.shadedDiffuseStrength(), 0.4);
  assert.equal(restored.ambientOcclusionEnabled(), true);
  assert.equal(restored.ambientOcclusionStrength(), 2.4);
  assert.equal(restored.ambientOcclusionQuality(), 'ultra');
});
