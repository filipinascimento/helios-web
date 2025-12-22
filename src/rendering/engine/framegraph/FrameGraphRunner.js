// Minimal pass runner that executes a list of pass functions in order.
// Each pass receives (context, resources) and may be async. Context is the
// backend-specific per-frame context produced by the device.
export class FrameGraphRunner {
  constructor() {
    this.resources = Object.create(null);
  }

  setResource(name, value) {
    this.resources[name] = value;
  }

  clearResources() {
    this.resources = Object.create(null);
  }

  async run(passes, context) {
    if (!Array.isArray(passes) || !passes.length) return;
    for (const pass of passes) {
      // Run sync passes without yielding; only await when a pass returns a promise.
      const result = pass(context, this.resources);
      if (result && typeof result.then === 'function') {
        // eslint-disable-next-line no-await-in-loop
        await result;
      }
    }
  }
}

export default FrameGraphRunner;
