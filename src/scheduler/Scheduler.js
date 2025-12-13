/**
 * Coordinates layout, geometry, and rendering cycles.
 */
import { createDebugLogger } from '../utilities/DebugLogger.js';

export class Scheduler {
  constructor(options = {}) {
    this.layout = null;
    this.geometryCallback = null;
    this.renderCallback = null;
    this.running = false;
    this._needsLayout = true;
    this._needsGeometry = true;
    this._needsRender = true;
    this._lastTime = 0;
    this._raf = null;
    this._layoutBusy = false;
    this.currentFrame = null;
    this.performanceMonitor = options.performanceMonitor ?? null;
    this.maxFrameInterval =
      options.maxFps && options.maxFps > 0 ? 1000 / options.maxFps : 0;
    this._lastRenderTime = 0;
    this.debug =
      options.debug && typeof options.debug.log === 'function'
        ? options.debug
        : createDebugLogger(options.debug);
    this.debug.log('scheduler', 'Scheduler created', {
      maxFps: options.maxFps ?? null,
      throttled: this.maxFrameInterval > 0,
    });
  }

  setLayout(layout) {
    this.layout = layout;
    this.debug.log('scheduler', 'Layout attached', { layout: layout?.constructor?.name });
    this.requestLayout();
  }

  setGeometryCallback(callback) {
    this.geometryCallback = callback;
    this.debug.log('scheduler', 'Geometry callback registered');
    this.requestGeometry();
  }

  setRenderCallback(callback) {
    this.renderCallback = callback;
    this.debug.log('scheduler', 'Render callback registered');
  }

  requestLayout() {
    if (!this._needsLayout) {
      this.debug.log('scheduler', 'Layout requested');
    }
    this._needsLayout = true;
  }

  requestGeometry() {
    if (!this._needsGeometry) {
      this.debug.log('scheduler', 'Geometry requested');
    }
    this._needsGeometry = true;
  }

  requestRender() {
    if (!this._needsRender) {
      this.debug.log('scheduler', 'Render requested');
    }
    this._needsRender = true;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._lastTime = performance.now();
    this._lastRenderTime = this._lastTime;
    this.debug.log('scheduler', 'Scheduler started');
    this._raf = requestAnimationFrame((ts) => this.tick(ts));
  }

  stop() {
    this.running = false;
    if (this._raf !== null) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
    this.debug.log('scheduler', 'Scheduler stopped');
  }

  tick(timestamp) {
    if (!this.running) {
      return;
    }
    if (this.maxFrameInterval > 0 && timestamp - this._lastRenderTime < this.maxFrameInterval) {
      this._raf = requestAnimationFrame((ts) => this.tick(ts));
      return;
    }
    const delta = timestamp - this._lastTime;
    this._lastTime = timestamp;
    this._lastRenderTime = timestamp;
    const perf = this.performanceMonitor;

    const layoutShouldRun = Boolean(
      this.layout &&
        (this._needsLayout ||
          (typeof this.layout.shouldRun === 'function' && this.layout.shouldRun())),
    );

    if (layoutShouldRun && !this._layoutBusy) {
      const layoutStart = perf?.enabled ? performance.now() : 0;
      const finalizeLayout = (changed) => {
        if (layoutStart) {
          perf.record('layout', performance.now() - layoutStart);
        }
        if (changed) {
          this.requestGeometry();
        }
      };
      try {
        const result = this.layout.step(delta);
        this._layoutBusy = result instanceof Promise;
        if (this._layoutBusy) {
          result
            .then((changed) => {
              this._layoutBusy = false;
              finalizeLayout(changed);
            })
            .catch((error) => {
              this._layoutBusy = false;
              if (layoutStart) {
                perf.record('layout', performance.now() - layoutStart);
              }
              console.error('Layout execution failed', error);
            });
        } else {
          finalizeLayout(result);
        }
      } finally {
        this._needsLayout = false;
      }
    }

    if (this.geometryCallback && this._needsGeometry && !this._layoutBusy) {
      const geometryStart = perf?.enabled ? performance.now() : 0;
      this.currentFrame = this.geometryCallback();
      if (geometryStart) {
        perf.record('geometry', performance.now() - geometryStart);
      }
      this._needsGeometry = false;
      this._needsRender = true;
    }

    if (this.renderCallback && this.currentFrame && this._needsRender) {
      const renderStart = perf?.enabled ? performance.now() : 0;
      this.renderCallback(this.currentFrame);
      if (renderStart) {
        perf.record('render', performance.now() - renderStart);
      }
      this._needsRender = false;
    }

    perf?.logIfDue();
    this._raf = requestAnimationFrame((ts) => this.tick(ts));
  }
}
