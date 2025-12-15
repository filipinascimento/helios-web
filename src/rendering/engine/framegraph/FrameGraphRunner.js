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
      // Pass can be sync or async; await to allow async when needed.
      // eslint-disable-next-line no-await-in-loop
      await pass(context, this.resources);
    }
  }
}

export default FrameGraphRunner;