const state = {
  nodeCount: 0,
  angle: 0,
  options: { radius: 150, jitter: 4, center: [0, 0], depth: 0, mode: '2d' },
  seeded: false,
  lastTimestamp: 0,
};

self.onmessage = (event) => {
  const data = event.data;
  if (!data) return;
  if (data.type === 'init') {
    state.nodeCount = data.nodeCount ?? 0;
    state.options = { ...state.options, ...data.options };
    state.seeded = false;
    state.lastTimestamp = 0;
    self.postMessage({ type: 'ready' });
    return;
  }
  if (data.type === 'resize') {
    state.options.center = data.center ?? state.options.center;
    return;
  }
  if (data.type === 'tick' && data.positions instanceof Float32Array) {
    stepLayout(data.positions, data.timestamp ?? performance.now());
  }
};

function stepLayout(buffer, timestamp) {
  const { radius = 150, jitter = 4, center = [0, 0], depth = 0, mode = '2d' } = state.options;
  const stride = 4;
  const count = buffer.length / stride;
  const cx = center[0];
  const cy = center[1];
  const useDepth = mode === '3d' ? depth : 0;

  // Seed random starting positions once.
  if (!state.seeded) {
    for (let index = 0; index < count; index += 1) {
      const pos = index * stride;
      buffer[pos] = cx + (Math.random() - 0.5) * radius;
      buffer[pos + 1] = cy + (Math.random() - 0.5) * radius;
      buffer[pos + 2] = (Math.random() - 0.5) * useDepth;
      buffer[pos + 3] = 1;
    }
    state.seeded = true;
    state.lastTimestamp = timestamp ?? performance.now();
    self.postMessage({ type: 'positions', positions: buffer }, [buffer.buffer]);
    return;
  }

  const now = timestamp || performance.now();
  const last = state.lastTimestamp || now;
  const dtMs = Math.max(1, now - last);
  state.lastTimestamp = now;
  // Clamp delta for stability and scale to ~60 FPS units.
  const dt = Math.min(0.1, Math.max(0.008, dtMs * 0.001));
  const timeScale = dt * 60; // 1 at ~60fps, >1 when slower.
  const jitterScale = jitter * timeScale;
  const spring = 0.0 * timeScale;

  for (let index = 0; index < count; index += 1) {
    const pos = index * stride;
    buffer[pos] += (Math.random() - 0.5) * jitterScale + (cx - buffer[pos]) * spring;
    buffer[pos + 1] += (Math.random() - 0.5) * jitterScale + (cy - buffer[pos + 1]) * spring;
    buffer[pos + 2] += (Math.random() - 0.5) * jitterScale * (useDepth ? 1 : 0) - buffer[pos + 2] * spring;
    buffer[pos + 3] = 1;
  }
  self.postMessage({ type: 'positions', positions: buffer }, [buffer.buffer]);
}
