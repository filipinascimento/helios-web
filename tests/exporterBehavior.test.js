import test from 'node:test';
import assert from 'node:assert/strict';
import { ExporterBehavior } from '../src/behaviors/ExporterBehavior.js';

class MockHelios extends EventTarget {
  constructor() {
    super();
    this.network = {};
    this.layers = { size: { width: 960, height: 540 } };
    this.size = { width: 960, height: 540 };
    this.renderer = {
      camera: {
        mode: '2d',
        projection: 'orthographic',
      },
    };
    this._exportCalls = [];
    this._previewCalls = [];
  }

  on(type, handler, options) {
    this.addEventListener(type, handler, options);
    return () => this.removeEventListener(type, handler, options);
  }

  getFigureExportCapabilities({ supersampling = 1 } = {}) {
    return {
      supersampling,
      maxBitmapDimension: 8192,
      windowDevicePixelRatio: 1,
      defaultPreset: 'window',
      presets: [
        { id: 'window', label: 'Window', available: true },
        { id: 'custom', label: 'Custom', available: true },
      ],
    };
  }

  _resolveFigureExportOptions(options = {}) {
    return {
      filename: `${options.baseName ?? 'figure'}.${options.format ?? 'png'}`,
      format: options.format ?? 'png',
      preset: options.preset ?? 'window',
      width: Number(options.width ?? 960),
      height: Number(options.height ?? 540),
      includeLabels: options.includeLabels === true,
      includeLegends: options.includeLegends !== false,
      includeInterface: options.includeInterface === true,
      legendScale: Number(options.legendScale ?? 1),
      transparentBackground: options.transparentBackground === true,
      alphaMode: options.alphaMode ?? 'straight',
      supersampling: Number(options.supersampling ?? 1),
      previewRect: { x: 0, y: 0, width: 960, height: 540 },
      capability: { maxBitmapDimension: 8192 },
      fitsCapability: true,
    };
  }

  async exportFigureBlob(options = {}) {
    this._exportCalls.push({ ...options });
    return new Blob(['png'], { type: options.format === 'svg' ? 'image/svg+xml' : 'image/png' });
  }

  async exportFigurePreviewBlob(options = {}, previewOptions = {}) {
    this._previewCalls.push({
      options: { ...options },
      previewOptions: { ...previewOptions },
    });
    return new Blob(['preview'], { type: 'image/png' });
  }
}

function createContext(helios, behaviors) {
  return {
    helios,
    get network() {
      return helios.network;
    },
    subscribe(target, eventName, handler, optionsArg) {
      if (typeof target?.on === 'function') return target.on(eventName, handler, optionsArg);
      target?.addEventListener?.(eventName, handler, optionsArg);
      return () => target?.removeEventListener?.(eventName, handler, optionsArg);
    },
    getBehavior(id) {
      return behaviors.get(id) ?? null;
    },
  };
}

test('exporter behavior owns export config and lifecycle state', () => {
  const helios = new MockHelios();
  const exporter = new ExporterBehavior({
    baseName: 'plot',
    format: 'svg',
    includeLabels: true,
    includeInterface: true,
  });
  const behaviors = new Map([['exporter', exporter]]);
  exporter.attach(createContext(helios, behaviors));

  assert.equal(exporter.baseName(), 'plot');
  assert.equal(exporter.format(), 'svg');
  assert.equal(exporter.includeLabels(), true);
  assert.equal(exporter.includeInterface(), true);
  assert.equal(exporter.getPublicState().resolved.filename, 'plot.svg');
});

test('exporter behavior updates config through public commands', () => {
  const helios = new MockHelios();
  const exporter = new ExporterBehavior();
  const behaviors = new Map([['exporter', exporter]]);
  exporter.attach(createContext(helios, behaviors));

  exporter
    .baseName('publication-figure')
    .format('svg')
    .preset('custom')
    .customSize({ width: 1200, height: 800 })
    .supersampling(2)
    .includeLabels(true)
    .includeLegends(false)
    .includeInterface(true)
    .legendScale(1.8)
    .transparentBackground(true)
    .alphaMode('premultiplied')
    .showFrame(true);

  const state = exporter.getPublicState();
  assert.equal(state.baseName, 'publication-figure');
  assert.equal(state.format, 'svg');
  assert.equal(state.preset, 'custom');
  assert.equal(state.width, 1200);
  assert.equal(state.height, 800);
  assert.equal(state.supersampling, 2);
  assert.equal(state.includeLabels, true);
  assert.equal(state.includeLegends, false);
  assert.equal(state.includeInterface, true);
  assert.equal(state.legendScale, 1.8);
  assert.equal(state.transparentBackground, true);
  assert.equal(state.alphaMode, 'premultiplied');
  assert.equal(state.showFrame, true);
});

test('exporter behavior routes export commands through Helios export APIs', async () => {
  const helios = new MockHelios();
  const exporter = new ExporterBehavior({
    baseName: 'chart',
    format: 'svg',
    includeInterface: true,
  });
  const behaviors = new Map([['exporter', exporter]]);
  exporter.attach(createContext(helios, behaviors));

  const blob = await exporter.exportBlob();
  const preview = await exporter.exportPreviewBlob({}, { maxWidth: 320, maxHeight: 180 });

  assert.equal(blob.type, 'image/svg+xml');
  assert.equal(preview.type, 'image/png');
  assert.equal(helios._exportCalls.length, 1);
  assert.equal(helios._exportCalls[0].filename, 'chart.svg');
  assert.equal(helios._exportCalls[0].includeInterface, true);
  assert.equal(helios._previewCalls.length, 1);
  assert.equal(helios._previewCalls[0].options.includeInterface, true);
  assert.equal(helios._previewCalls[0].previewOptions.maxWidth, 320);
});

test('exporter behavior serializes and restores stable export config', () => {
  const helios = new MockHelios();
  const exporter = new ExporterBehavior();
  const behaviors = new Map([['exporter', exporter]]);
  exporter.attach(createContext(helios, behaviors));

  exporter.update({
    baseName: 'snapshot',
    format: 'svg',
    preset: 'custom',
    width: 1400,
    height: 900,
    supersampling: 2,
    includeLabels: true,
    includeLegends: false,
    includeInterface: true,
    legendScale: 1.4,
    transparentBackground: true,
    alphaMode: 'premultiplied',
    showFrame: true,
  });
  const snapshot = exporter.serialize();

  const restored = new ExporterBehavior();
  const restoredBehaviors = new Map([['exporter', restored]]);
  restored.attach(createContext(new MockHelios(), restoredBehaviors));
  restored.restore(snapshot);

  assert.equal(restored.baseName(), 'snapshot');
  assert.equal(restored.format(), 'svg');
  assert.equal(restored.preset(), 'custom');
  assert.deepEqual(restored.customSize(), { width: 1400, height: 900 });
  assert.equal(restored.supersampling(), 2);
  assert.equal(restored.includeLabels(), true);
  assert.equal(restored.includeLegends(), false);
  assert.equal(restored.includeInterface(), true);
  assert.equal(restored.legendScale(), 1.4);
  assert.equal(restored.transparentBackground(), true);
  assert.equal(restored.alphaMode(), 'premultiplied');
  assert.equal(restored.showFrame(), false);
});
