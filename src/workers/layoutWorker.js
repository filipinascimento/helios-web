const state = {
  nodeCount: 0,
  angle: 0,
  options: { radius: 150, speed: 0.5, center: [0, 0] },
};

self.onmessage = (event) => {
  const data = event.data;
  if (!data) return;
  if (data.type === 'init') {
    state.nodeCount = data.nodeCount ?? 0;
    state.options = { ...state.options, ...data.options };
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
  const { radius = 150, speed = 0.5, center = [0, 0] } = state.options;
  const count = buffer.length / 2;
  const cx = center[0];
  const cy = center[1];
  const offset = timestamp * 0.001 * speed;
  for (let index = 0; index < count; index += 1) {
    const angle = (index / Math.max(1, count)) * Math.PI * 2 + offset;
    buffer[index * 2] = cx + Math.cos(angle) * radius;
    buffer[index * 2 + 1] = cy + Math.sin(angle) * radius;
  }
  self.postMessage({ type: 'positions', positions: buffer }, [buffer.buffer]);
}
