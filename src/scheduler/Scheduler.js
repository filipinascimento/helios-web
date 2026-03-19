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
    this._layoutActive = false;
    this.layoutEnabled = options.layoutEnabled !== false;
    this.layoutState = this.layoutEnabled ? 'running' : 'stopped';
    this._layoutStartReason = null;
    this._layoutStopReason = null;
    this._layoutStartTimestamp = 0;
    this._layoutEventHandlers = {
      start: typeof options.onLayoutStart === 'function' ? options.onLayoutStart : null,
      stop: typeof options.onLayoutStop === 'function' ? options.onLayoutStop : null,
    };
    this.currentFrame = null;
    this.performanceMonitor = options.performanceMonitor ?? null;
    this.maxFrameInterval =
      options.maxFps && options.maxFps > 0 ? 1000 / options.maxFps : 0;
    this._lastRenderTime = 0;
    this._renderCount = 0;
    this.attributeCallback = null;
    this.attributeUpdateConfig = {
      autoUpdate: options.attributeAutoUpdate === true,
      maxFrameInterval:
        options.attributeMaxFps && options.attributeMaxFps > 0
          ? 1000 / options.attributeMaxFps
          : 0,
      frameSkip:
        Number.isFinite(options.attributeFrameSkip) && options.attributeFrameSkip > 0
          ? Math.floor(options.attributeFrameSkip)
          : 0,
      runWhenIdle: options.attributeRunWhenIdle === true,
    };
    this._attributeTimer = null;
    this._lastAttributeTime = -Infinity;
    this._lastAttributeRenderCount = 0;
    this.renderPump = null;
    this.debug =
      options.debug && typeof options.debug.log === 'function'
        ? options.debug
        : createDebugLogger(options.debug);
    this.debug.log('scheduler', 'Scheduler created', {
      maxFps: options.maxFps ?? null,
      throttled: this.maxFrameInterval > 0,
      attributeAutoUpdate: this.attributeUpdateConfig.autoUpdate,
      attributeMaxFps: options.attributeMaxFps ?? null,
      attributeFrameSkip: this.attributeUpdateConfig.frameSkip,
      layoutEnabled: this.layoutEnabled,
    });
  }

  _resolveDisabledLayoutState(reason = null) {
    return reason === 'alpha-min' || reason === 'idle' || reason === 'temperature'
      ? 'idle'
      : 'stopped';
  }

  getLayoutState() {
    return this.layoutState;
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

  setRenderPump(callback) {
    this.renderPump = typeof callback === 'function' ? callback : null;
  }

  requestLayout() {
    // Backwards-compatible signature: requestLayout(reason)
    const reason = arguments.length ? arguments[0] : null;
    if (!this._needsLayout) {
      this.debug.log('scheduler', 'Layout requested');
    }
    this._needsLayout = true;
    if (reason != null) {
      this._layoutStartReason = reason;
    }
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

  setLayoutEnabled(enabled, reason = null) {
    const next = enabled !== false;
    if (next === this.layoutEnabled) {
      if (!next && reason != null) {
        this._layoutStopReason = reason;
        this.layoutState = this._resolveDisabledLayoutState(reason);
      } else if (next) {
        this.layoutState = 'running';
      }
      return;
    }
    this.layoutEnabled = next;
    if (!next) {
      this._layoutStopReason = reason ?? 'user';
      this._needsLayout = false;
      this.layoutState = this._resolveDisabledLayoutState(this._layoutStopReason);
    } else {
      this._layoutStartReason = reason ?? 'user';
      this._needsLayout = true;
      this.layoutState = 'running';
    }
  }

  setLayoutEventHandlers(handlers = {}) {
    if (typeof handlers.start === 'function') {
      this._layoutEventHandlers.start = handlers.start;
    }
    if (typeof handlers.stop === 'function') {
      this._layoutEventHandlers.stop = handlers.stop;
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._lastTime = performance.now();
    this._lastRenderTime = this._lastTime;
    this._lastAttributeTime = -Infinity;
    this._lastAttributeRenderCount = this._renderCount;
    this.debug.log('scheduler', 'Scheduler started');
    this._restartAttributeTimer();
    this._raf = requestAnimationFrame((ts) => this.tick(ts));
  }

  stop() {
    this.running = false;
    if (this._raf !== null) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
    this._clearAttributeTimer();
    this._layoutBusy = false;
    if (this._layoutActive) {
      this._layoutActive = false;
      const handler = this._layoutEventHandlers.stop;
      if (handler) {
        handler({
          timestamp: performance.now(),
          durationMs: Math.max(0, performance.now() - (this._layoutStartTimestamp || 0)),
          reason: this._layoutStopReason ?? 'stopped',
        });
      }
    }
    this.debug.log('scheduler', 'Scheduler stopped');
  }

  setAttributeCallback(callback, options = {}) {
    this.attributeCallback = callback;
    this.configureAttributeUpdates(options);
  }

  configureAttributeUpdates(options = {}) {
    const cfg = { ...this.attributeUpdateConfig };
    if (options.autoUpdate != null) {
      cfg.autoUpdate = options.autoUpdate === true;
    }
    if (options.maxFps != null) {
      cfg.maxFrameInterval = options.maxFps > 0 ? 1000 / options.maxFps : 0;
    }
    if (options.frameSkip != null) {
      cfg.frameSkip = Number.isFinite(options.frameSkip) && options.frameSkip > 0
        ? Math.floor(options.frameSkip)
        : 0;
    }
    if (options.runWhenIdle != null) {
      cfg.runWhenIdle = options.runWhenIdle === true;
    }
    this.attributeUpdateConfig = cfg;
    this._restartAttributeTimer();
  }

  _clearAttributeTimer() {
    if (this._attributeTimer) {
      clearTimeout(this._attributeTimer);
      this._attributeTimer = null;
    }
  }

  _restartAttributeTimer() {
    this._clearAttributeTimer();
    if (!this.running) return;
    if (!this.attributeUpdateConfig.autoUpdate) return;
    if (!this.attributeUpdateConfig.runWhenIdle) return;
    if (!this.attributeCallback) return;
    const interval = this.attributeUpdateConfig.maxFrameInterval;
    const delay = interval > 0 ? interval : 16;
    this._attributeTimer = setTimeout(() => this._attributeTick(), delay);
  }

  _attributeTick() {
    if (!this.running) return;
    this._maybeRunAttributeUpdate('timer');
    this._restartAttributeTimer();
  }

  _maybeRunAttributeUpdate(reason) {
    if (!this.attributeUpdateConfig.autoUpdate) return;
    if (!this.attributeCallback) return;
    if (!this.currentFrame) return;
    if (!this.attributeUpdateConfig.runWhenIdle && reason !== 'render') return;
    const now = performance.now();
    const elapsed = now - this._lastAttributeTime;
    const interval = this.attributeUpdateConfig.maxFrameInterval;
    if (interval > 0 && elapsed < interval) return;
    const frameSkip = this.attributeUpdateConfig.frameSkip ?? 0;
    const framesSince = this._renderCount - this._lastAttributeRenderCount;
    if (frameSkip > 0 && this._lastAttributeRenderCount > 0 && framesSince < frameSkip + 1) return;
    this._lastAttributeTime = now;
    this._lastAttributeRenderCount = this._renderCount;
    try {
      this.attributeCallback(this.currentFrame);
    } catch (error) {
      console.error('Attribute update failed', { reason, error });
    }
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

    const layoutWanted = Boolean(
      this.layoutEnabled &&
        this.layout &&
        (this._needsLayout ||
          (typeof this.layout.shouldRun === 'function' && this.layout.shouldRun())),
    );
    const layoutActiveNow = Boolean(layoutWanted || this._layoutBusy);
    if (layoutActiveNow && !this._layoutActive) {
      this._layoutActive = true;
      this._layoutStartTimestamp = timestamp;
      const handler = this._layoutEventHandlers.start;
      if (handler) {
        handler({
          timestamp,
          reason: this._layoutStartReason ?? 'requested',
        });
      }
      this._layoutStartReason = null;
      this._layoutStopReason = null;
    } else if (!layoutActiveNow && this._layoutActive) {
      this._layoutActive = false;
      const handler = this._layoutEventHandlers.stop;
      if (handler) {
        handler({
          timestamp,
          durationMs: Math.max(0, timestamp - (this._layoutStartTimestamp || timestamp)),
          reason: this._layoutStopReason ?? 'idle',
        });
      }
      this._layoutStopReason = null;
      this._layoutStartTimestamp = 0;
    }

    if (layoutWanted && !this._layoutBusy) {
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

    if (this.renderPump && this.currentFrame) {
      try {
        const wantsRender = this.renderPump({ timestamp, frame: this.currentFrame });
        if (wantsRender) this.requestRender();
      } catch (error) {
        console.warn('Scheduler render pump failed', error);
      }
    }

    if (this.renderCallback && this.currentFrame && this._needsRender) {
      const renderStart = perf?.enabled ? performance.now() : 0;
      this.renderCallback(this.currentFrame);
      if (renderStart) {
        perf.record('render', performance.now() - renderStart);
      }
      this._needsRender = false;
      this._renderCount += 1;
      this._maybeRunAttributeUpdate('render');
    }

    perf?.logIfDue();
    this._raf = requestAnimationFrame((ts) => this.tick(ts));
  }
}
