export class FrameGraph {
  constructor() {
    this.passes = [];
    this.resources = new Map();
  }

  addResource(id, descriptor) {
    this.resources.set(id, descriptor);
    return id;
  }

  addPass(pass) {
    this.passes.push(pass);
    return pass.id;
  }

  compile(deviceType) {
    const activePasses = this.passes.filter((p) => !p.backend || p.backend === 'any' || p.backend === deviceType);
    return new CompiledFrameGraph(activePasses, this.resources);
  }
}

class CompiledFrameGraph {
  constructor(passes, resources) {
    this.passes = passes;
    this.resources = resources;
  }

  async execute(ctx) {
    for (const pass of this.passes) {
      await pass.execute(ctx, this.resources);
    }
  }
}
