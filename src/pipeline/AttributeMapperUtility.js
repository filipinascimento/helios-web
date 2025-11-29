/** @typedef {import('helios-network').default} HeliosNetwork */

const DEFAULT_COLOR_START = [0.2, 0.6, 1, 1];
const DEFAULT_COLOR_END = [1, 0.4, 0.4, 1];

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpColor(start, end, t) {
  return [
    lerp(start[0], end[0], t),
    lerp(start[1], end[1], t),
    lerp(start[2], end[2], t),
    lerp(start[3], end[3], t),
  ];
}

function computeDomain(view, activity) {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < activity.length; i += 1) {
    if (!activity[i]) continue;
    const value = view[i];
    if (!Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0;
    max = 1;
  }
  if (min === max) {
    max = min + 1;
  }
  return { min, max };
}

export class AttributeMapperUtility {
  constructor(network, visuals) {
    this.network = network;
    this.visuals = visuals;
  }

  mapNodeAttributeToSize(attributeName, options = {}) {
    const targetRange = options.range ?? [4, 16];
    const view = this.network.getNodeAttributeBuffer(attributeName).view;
    const activity = this.network.nodeActivityView;
    const domain = options.domain ?? computeDomain(view, activity);
    const sizes = this.visuals.nodeSizes;
    const [minSize, maxSize] = targetRange;
    for (let i = 0; i < activity.length; i += 1) {
      if (!activity[i]) continue;
      const value = view[i];
      const t = (value - domain.min) / (domain.max - domain.min);
      sizes[i] = minSize + (maxSize - minSize) * t;
    }
    return sizes;
  }

  mapNodeAttributeToColor(attributeName, options = {}) {
    const start = options.startColor ?? DEFAULT_COLOR_START;
    const end = options.endColor ?? DEFAULT_COLOR_END;
    const palette = options.palette ?? ((t) => lerpColor(start, end, t));
    const view = this.network.getNodeAttributeBuffer(attributeName).view;
    const activity = this.network.nodeActivityView;
    const domain = options.domain ?? computeDomain(view, activity);
    const colors = this.visuals.nodeColors;
    for (let i = 0; i < activity.length; i += 1) {
      if (!activity[i]) continue;
      const value = view[i];
      const t = (value - domain.min) / (domain.max - domain.min);
      const [r, g, b, a] = palette(Math.min(1, Math.max(0, t)), value, i);
      const offset = i * 4;
      colors[offset] = r;
      colors[offset + 1] = g;
      colors[offset + 2] = b;
      colors[offset + 3] = a;
    }
    return colors;
  }

  mapEdgeAttributeToColor(attributeName, options = {}) {
    const start = options.startColor ?? [0.4, 0.4, 0.6, 0.6];
    const end = options.endColor ?? [0.9, 0.9, 0.9, 0.8];
    const palette = options.palette ?? ((t) => lerpColor(start, end, t));
    const view = this.network.getEdgeAttributeBuffer(attributeName).view;
    const activity = this.network.edgeActivityView;
    const domain = options.domain ?? computeDomain(view, activity);
    const colors = this.visuals.edgeColors;
    for (let i = 0; i < activity.length; i += 1) {
      if (!activity[i]) continue;
      const value = view[i];
      const t = (value - domain.min) / (domain.max - domain.min);
      const [r, g, b, a] = palette(Math.min(1, Math.max(0, t)), value, i);
      const offset = i * 4;
      colors[offset] = r;
      colors[offset + 1] = g;
      colors[offset + 2] = b;
      colors[offset + 3] = a;
    }
    return colors;
  }
}
