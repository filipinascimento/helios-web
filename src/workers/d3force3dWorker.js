import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
} from 'd3-force-3d';

const POSITION_SCALE = 10;

const defaultSettings = {
  use2D: false,
  forcesStrength: 1,
  forcesRatio: 1,
  repulsiveExponent: 1,
  attractiveExponent: 1,
  gravity: 0.05,
  viscosity: 0.05,
  collisionEnabled: false,
  collisionRadius: 50,
  linkDistance: 30,
  forceNormalizationType: 'degree',
  alpha: 1,
  alphaDecay: 0.003,
  alphaTarget: 0,
  alphaMin: 0.001,
  recenter: true,
  center: [0, 0, 0],
};

const state = {
  settings: { ...defaultSettings },
  nodes: [],
  links: [],
  weighted: false,
  simulation: null,
  repulsiveForce: null,
  attractiveForce: null,
  centralForce: null,
  gravityForce: null,
  collisionForce: null,
  lastEdgeCount: 0,
  tickCount: 0,
};

function resolveCenter() {
  const center = Array.isArray(state.settings.center) ? state.settings.center : [0, 0, 0];
  return [
    Number.isFinite(center[0]) ? center[0] : 0,
    Number.isFinite(center[1]) ? center[1] : 0,
    Number.isFinite(center[2]) ? center[2] : 0,
  ];
}

function copyNodePositionsToBuffer(buffer) {
  const use2D = state.settings.use2D;
  for (let i = 0; i < state.nodes.length; i += 1) {
    const node = state.nodes[i];
    const base = i * 3;
    buffer[base] = node.x / POSITION_SCALE;
    buffer[base + 1] = node.y / POSITION_SCALE;
    buffer[base + 2] = use2D ? 0 : node.z / POSITION_SCALE;
  }
}

function computeStdDev(buffer, use2D) {
  if (!buffer || !buffer.length) return 0;
  const stride = 3;
  const count = Math.floor(buffer.length / stride);
  if (count <= 0) return 0;
  const dims = use2D ? 2 : 3;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < count; i += 1) {
    const base = i * stride;
    sum += buffer[base];
    sum += buffer[base + 1];
    if (!use2D) sum += buffer[base + 2];
    n += dims;
  }
  const mean = sum / n;
  let varianceSum = 0;
  for (let i = 0; i < count; i += 1) {
    const base = i * stride;
    const dx = buffer[base] - mean;
    const dy = buffer[base + 1] - mean;
    varianceSum += dx * dx + dy * dy;
    if (!use2D) {
      const dz = buffer[base + 2] - mean;
      varianceSum += dz * dz;
    }
  }
  return Math.sqrt(varianceSum / n);
}

function d3GravityForce() {
  let nodes = [];
  let strength = 0.05;
  let softening = 0.025;
  function force(alpha) {
    const totalStrength = Math.sqrt(nodes.length) * alpha * strength;
    for (let i = 0, n = nodes.length; i < n; i += 1) {
      const node = nodes[i];
      const r2 = node.x * node.x + node.y * node.y + node.z * node.z + softening;
      const distance = Math.sqrt(r2);
      const invDistMag = totalStrength / distance;
      node.vx -= node.x * invDistMag;
      node.vy -= node.y * invDistMag;
      node.vz -= node.z * invDistMag;
    }
  }
  force.initialize = function initialize(next) {
    nodes = next;
  };
  force.strength = function strengthAccessor(next) {
    return arguments.length ? ((strength = +next), force) : strength;
  };
  force.softening = function softeningAccessor(next) {
    return arguments.length ? ((softening = +next), force) : softening;
  };
  return force;
}

function ensureSimulation() {
  if (state.simulation) return;
  state.repulsiveForce = forceManyBody();
  state.attractiveForce = forceLink(state.links);
  state.centralForce = forceCenter();
  state.gravityForce = d3GravityForce();
  state.collisionForce = forceCollide();
  state.simulation = forceSimulation(state.nodes)
    .numDimensions(state.settings.use2D ? 2 : 3)
    .force('repulsive', state.repulsiveForce)
    .force('attractive', state.attractiveForce)
    .force('central', state.centralForce)
    .force('gravity', state.gravityForce);
  state.simulation.stop();
}

function applySettings() {
  if (!state.simulation) return;
  state.simulation.numDimensions(state.settings.use2D ? 2 : 3);
  state.simulation.velocityDecay(state.settings.viscosity);
  state.simulation.alpha(state.settings.alpha);
  state.simulation.alphaDecay(state.settings.alphaDecay);
  state.simulation.alphaTarget(state.settings.alphaTarget);
  state.simulation.alphaMin(state.settings.alphaMin);

  const [centerX, centerY, centerZ] = resolveCenter();
  state.centralForce?.x?.(centerX);
  state.centralForce?.y?.(centerY);
  state.centralForce?.z?.(centerZ);
  state.gravityForce?.strength(state.settings.gravity);
  state.collisionForce?.radius(state.settings.collisionRadius);

  if (state.settings.recenter !== false) {
    if (!state.simulation.force('central')) {
      state.simulation.force('central', state.centralForce);
    }
  } else if (state.simulation.force('central')) {
    state.simulation.force('central', null);
  }

  if (state.settings.collisionEnabled) {
    if (!state.simulation.force('collision')) {
      state.simulation.force('collision', state.collisionForce);
    }
  } else if (state.simulation.force('collision')) {
    state.simulation.force('collision', null);
  }

  updateStrengths();
}

function rebuildNodes(positions) {
  const count = Math.floor(positions.length / 3);
  state.nodes = new Array(count);
  for (let i = 0; i < count; i += 1) {
    const base = i * 3;
    const node = {
      x: positions[base] * POSITION_SCALE,
      y: positions[base + 1] * POSITION_SCALE,
      z: positions[base + 2] * POSITION_SCALE,
      vx: 0,
      vy: 0,
      vz: 0,
      ID: i,
      strength: 1,
      degree: 0,
    };
    state.nodes[i] = node;
  }
  if (state.simulation) {
    state.simulation.nodes(state.nodes);
  }
}

function syncNodePositionsFromBuffer(positions, { resetVelocity = false } = {}) {
  const count = Math.min(state.nodes.length, Math.floor(positions.length / 3));
  for (let i = 0; i < count; i += 1) {
    const base = i * 3;
    const node = state.nodes[i];
    node.x = positions[base] * POSITION_SCALE;
    node.y = positions[base + 1] * POSITION_SCALE;
    node.z = positions[base + 2] * POSITION_SCALE;
    if (resetVelocity) {
      node.vx = 0;
      node.vy = 0;
      node.vz = 0;
    }
  }
}

function rebuildLinks(edges, weights) {
  const linkCount = Math.floor(edges.length / 2);
  state.links = new Array(linkCount);
  for (let i = 0; i < linkCount; i += 1) {
    const source = state.nodes[edges[i * 2]];
    const target = state.nodes[edges[i * 2 + 1]];
    const link = { source, target };
    if (weights && weights.length === linkCount) {
      link.weight = weights[i];
    }
    state.links[i] = link;
  }
  state.weighted = Boolean(weights && weights.length === linkCount);
  if (state.attractiveForce) {
    state.attractiveForce.links(state.links);
  }
  state.lastEdgeCount = edges.length;
  recalculateNodeStrengths();
  updateStrengths();
}

function recalculateNodeStrengths() {
  for (let i = 0; i < state.nodes.length; i += 1) {
    const node = state.nodes[i];
    node.strength = 0;
    node.degree = 0;
  }
  if (state.links.length === 0) return;
  for (let i = 0; i < state.links.length; i += 1) {
    const link = state.links[i];
    const weight = state.weighted ? link.weight : 1;
    link.source.strength += weight;
    link.target.strength += weight;
    link.source.degree += 1;
    link.target.degree += 1;
  }
}

function updateStrengths() {
  const baseStrength = state.settings.forcesStrength;
  const ratio = Math.max(1e-6, Number(state.settings.forcesRatio) || defaultSettings.forcesRatio);
  const repulsiveExponent = state.settings.repulsiveExponent;
  const attractiveExponent = state.settings.attractiveExponent;
  const repulsiveStrength = baseStrength * Math.pow(1 / ratio, repulsiveExponent / 2);
  const attractiveStrength = baseStrength * Math.pow(ratio, attractiveExponent / 2);

  if (!state.repulsiveForce || !state.attractiveForce) return;

  if (state.weighted) {
    if (state.settings.forceNormalizationType === 'strength') {
      state.attractiveForce.strength((d) => {
        if (!d.weight) return 0;
        const minStrength = Math.max(1, Math.min(d.target.strength, d.source.strength));
        return (attractiveStrength * d.weight) / minStrength;
      });
    } else if (state.settings.forceNormalizationType === 'degree') {
      state.attractiveForce.strength((d) => {
        if (!d.weight) return 0;
        const minDegree = Math.max(1, Math.min(d.target.degree, d.source.degree));
        return (attractiveStrength * d.weight) / minDegree;
      });
    } else {
      state.attractiveForce.strength((d) => attractiveStrength * (d.weight ?? 1));
    }
  } else if (state.settings.forceNormalizationType === 'strength') {
    state.attractiveForce.strength((d) => {
      const minStrength = Math.max(1, Math.min(d.target.strength, d.source.strength));
      return attractiveStrength / minStrength;
    });
  } else if (state.settings.forceNormalizationType === 'degree') {
    state.attractiveForce.strength((d) => {
      const minDegree = Math.max(1, Math.min(d.target.degree, d.source.degree));
      return attractiveStrength / minDegree;
    });
  } else {
    state.attractiveForce.strength(attractiveStrength);
  }

  state.repulsiveForce.exponent(state.settings.repulsiveExponent);
  state.attractiveForce.exponent(state.settings.attractiveExponent);
  state.repulsiveForce.strength(-repulsiveStrength);
  state.attractiveForce.distance(state.settings.linkDistance);
}

function stepSimulation(buffer) {
  if (!state.simulation) return;
  state.simulation.tick();
  copyNodePositionsToBuffer(buffer);
  state.settings.alpha = state.simulation.alpha();
  state.tickCount += 1;
}

self.onmessage = (event) => {
  const data = event.data;
  if (!data) return;
  if (data.type === 'init') {
    if (data.options?.settings) {
      state.settings = { ...state.settings, ...data.options.settings };
    }
    ensureSimulation();
    applySettings();
    self.postMessage({ type: 'ready' });
    return;
  }
  if (data.type === 'options') {
    if (data.settings) {
      state.settings = { ...state.settings, ...data.settings };
    }
    ensureSimulation();
    applySettings();
    return;
  }
  if (data.type === 'tick' && data.positions instanceof Float32Array) {
    let settingsChanged = false;
    if (data.options?.settings) {
      state.settings = { ...state.settings, ...data.options.settings };
      settingsChanged = true;
    }

    const nodeCount = Math.floor(data.positions.length / 3);
    if (!state.nodes.length || state.nodes.length !== nodeCount) {
      rebuildNodes(data.positions);
      ensureSimulation();
      applySettings();
      settingsChanged = false;
    }

    if (data.edges instanceof Uint32Array) {
      const edgesChanged = data.edges.length !== state.lastEdgeCount;
      if (!state.links.length || edgesChanged) {
        rebuildLinks(data.edges, data.weights);
      }
    }

    if (settingsChanged) {
      ensureSimulation();
      applySettings();
    }

    if (data.adoptOnly === true) {
      ensureSimulation();
      syncNodePositionsFromBuffer(data.positions, { resetVelocity: true });
      state.simulation.nodes(state.nodes);
      applySettings();
      copyNodePositionsToBuffer(data.positions);
      self.postMessage({ type: 'positions', positions: data.positions, alpha: state.settings.alpha }, [data.positions.buffer]);
      return;
    }

    stepSimulation(data.positions);
    self.postMessage({ type: 'positions', positions: data.positions, alpha: state.settings.alpha }, [data.positions.buffer]);
  }
};
