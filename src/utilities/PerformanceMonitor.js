export class PerformanceMonitor {
  constructor({ enabled = true, windowSize = 60, logEvery = 60 } = {}) {
    this.enabled = enabled;
    this.windowSize = windowSize;
    this.logEvery = logEvery;
    this.samples = new Map();
    this.frameCounter = 0;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }

  record(label, durationMs) {
    if (!this.enabled || !Number.isFinite(durationMs)) return;
    const bucket = this.samples.get(label) ?? [];
    bucket.push(durationMs);
    if (bucket.length > this.windowSize) {
      bucket.shift();
    }
    this.samples.set(label, bucket);
  }

  average(label) {
    const bucket = this.samples.get(label);
    if (!bucket || !bucket.length) return null;
    const total = bucket.reduce((sum, value) => sum + value, 0);
    return total / bucket.length;
  }

  getSummary() {
    const summary = {};
    for (const [label, values] of this.samples.entries()) {
      if (!values.length) continue;
      summary[label] = {
        avg: this.round(this.average(label)),
        min: this.round(Math.min(...values)),
        max: this.round(Math.max(...values)),
        samples: values.length,
        window: this.windowSize,
      };
    }
    return summary;
  }

  logIfDue() {
    if (!this.enabled || !this.logEvery) return;
    this.frameCounter += 1;
    if (this.frameCounter % this.logEvery !== 0) return;
    const summary = this.getSummary();
    const labels = Object.keys(summary);
    if (!labels.length) return;
    console.log(`[Helios perf avg] over last ~${this.windowSize} samples:`, summary);
  }

  round(value) {
    if (!Number.isFinite(value)) return value;
    return Math.round(value * 100) / 100;
  }
}
