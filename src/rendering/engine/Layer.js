export class Layer {
  constructor(name = 'layer') {
    this.name = name;
    this.device = null;
    this.size = null;
  }

  initialize(device, size) {
    this.device = device;
    this.size = size;
  }

  resize(size) {
    this.size = size;
  }

  // eslint-disable-next-line class-methods-use-this, no-unused-vars
  render(context, frame) {
    // Implemented by subclasses.
  }

  destroy() {
    // Implemented by subclasses if needed.
  }
}
