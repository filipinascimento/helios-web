export const DEFAULT_UI_SLIDER_FPS = 30;

function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now();
  return Date.now();
}

export function createFpsThrottle(callback, fps = DEFAULT_UI_SLIDER_FPS) {
  const safeCallback = typeof callback === 'function' ? callback : () => {};
  const intervalMs = Number.isFinite(fps) && fps > 0 ? 1000 / fps : 0;

  let timeoutId = null;
  let lastInvokeTime = -Infinity;
  let pendingArgs = null;
  let pendingThis = null;

  const clearScheduled = () => {
    if (timeoutId == null) return;
    globalThis.clearTimeout(timeoutId);
    timeoutId = null;
  };

  const invokePending = () => {
    if (!pendingArgs) return;
    const args = pendingArgs;
    const context = pendingThis;
    pendingArgs = null;
    pendingThis = null;
    lastInvokeTime = nowMs();
    safeCallback.apply(context, args);
  };

  const schedulePending = () => {
    if (timeoutId != null || !pendingArgs || intervalMs <= 0) return;
    const remainingMs = Math.max(0, intervalMs - (nowMs() - lastInvokeTime));
    timeoutId = globalThis.setTimeout(() => {
      timeoutId = null;
      invokePending();
      if (pendingArgs) schedulePending();
    }, remainingMs);
  };

  function throttled(...args) {
    pendingArgs = args;
    pendingThis = this;

    if (intervalMs <= 0) {
      clearScheduled();
      invokePending();
      return;
    }

    if (timeoutId == null && (nowMs() - lastInvokeTime) >= intervalMs) {
      invokePending();
      return;
    }

    schedulePending();
  }

  throttled.flush = () => {
    clearScheduled();
    invokePending();
  };

  throttled.cancel = () => {
    clearScheduled();
    pendingArgs = null;
    pendingThis = null;
  };

  return throttled;
}

export default createFpsThrottle;
