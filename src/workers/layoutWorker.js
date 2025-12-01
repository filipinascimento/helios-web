const defaultOptions = {
  layout: 'force3d', // 'force3d' | 'jitter'
  mode: '2d', // '2d' | '3d'
  center: [0, 0, 0],
  radius: 150,
  depth: 0,
  jitter: 3,
  // Force-directed controls
  repulsionExponent: 2,
  attractionExponent: 1,
  kRepulsion: 6,
  kAttraction: 0.0035,
  kGravity: 0.0005,
  epsilon: 0.25,
  minDistance: 0.25,
  maxForce: 50,
  maxStep: 3,
  eta: 0.04,
  damping: 0.9,
  theta: 0.6,
  leafSize: 16,
  repulsionStrategy: 'barnes-hut', // 'barnes-hut' | 'negative' | 'full'
  negativeSampling: false,
  negativesPerNode: 48,
  recenter: true,
};

const state = {
  nodeCount: 0,
  options: { ...defaultOptions },
  seeded: false,
  lastTimestamp: 0,
  velocities: null,
  forces: null,
  edges: new Uint32Array(0),
  nodeActivity: null,
};

self.onmessage = (event) => {
  const data = event.data;
  if (!data) return;
  if (data.type === 'init') {
    state.nodeCount = data.nodeCount ?? 0;
    state.options = { ...defaultOptions, ...state.options, ...data.options };
    state.seeded = false;
    state.lastTimestamp = 0;
    state.velocities = new Float32Array(state.nodeCount * 3);
    state.forces = new Float32Array(state.nodeCount * 3);
    self.postMessage({ type: 'ready' });
    return;
  }
  if (data.type === 'resize') {
    const center = data.center ?? state.options.center ?? [0, 0];
    state.options.center = [center[0] ?? 0, center[1] ?? 0, state.options.center?.[2] ?? 0];
    return;
  }
  if (data.type === 'tick' && data.positions instanceof Float32Array) {
    stepLayout(data);
  }
};

function stepLayout(message) {
  if (!(message.positions instanceof Float32Array)) return;
  if (message.options) {
    state.options = { ...state.options, ...message.options };
  }
  if (message.edges instanceof Uint32Array) {
    state.edges = message.edges;
  }
  if (message.nodeActivity instanceof Uint8Array) {
    state.nodeActivity = message.nodeActivity;
  }

  const layoutMode = (state.options.layout || 'force3d').toLowerCase();
  if (layoutMode === 'jitter') {
    runJitterLayout(message.positions, message.timestamp ?? performance.now());
    return;
  }
  runForceDirectedLayout(message.positions, message.timestamp ?? performance.now());
}

function runJitterLayout(buffer, timestamp) {
  const { radius, jitter, center = [0, 0], depth = 0, mode = '2d' } = state.options;
  const stride = 4;
  const count = buffer.length / stride;
  const cx = center[0] ?? 0;
  const cy = center[1] ?? 0;
  const useDepth = mode === '3d' ? depth : 0;

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
  const dt = Math.min(0.1, Math.max(0.008, dtMs * 0.001));
  const timeScale = dt * 60;
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

function runForceDirectedLayout(buffer, timestamp) {
  const stride = 4;
  const count = buffer.length / stride;
  if (!state.velocities || state.velocities.length < count * 3) {
    state.velocities = new Float32Array(count * 3);
  }
  if (!state.forces || state.forces.length < count * 3) {
    state.forces = new Float32Array(count * 3);
  }
  const useDepth = (state.options.mode ?? '2d') === '3d';
  const activeNodes = collectActiveNodes(state.nodeActivity, count);

  if (!state.seeded) {
    seedPositions(buffer, activeNodes, useDepth);
    state.seeded = true;
    state.lastTimestamp = timestamp ?? performance.now();
    self.postMessage({ type: 'positions', positions: buffer }, [buffer.buffer]);
    return;
  }

  const { dt, timeScale } = computeTimestep(timestamp);
  const effectiveEta = (state.options.eta ?? defaultOptions.eta) * timeScale;
  const damping = clamp01(state.options.damping ?? defaultOptions.damping);

  zeroForces(state.forces, count);
  applyRepulsion(buffer, activeNodes, useDepth);
  applyAttraction(buffer, activeNodes, useDepth);
  applyGravity(buffer, activeNodes, useDepth);

  integrate(buffer, activeNodes, useDepth, effectiveEta, damping);
  if (state.options.recenter !== false) {
    recenter(buffer, activeNodes, useDepth);
  }
  state.lastTimestamp = timestamp;
  self.postMessage({ type: 'positions', positions: buffer }, [buffer.buffer]);
}

function collectActiveNodes(activity, count) {
  if (!(activity instanceof Uint8Array)) {
    return Array.from({ length: count }, (_, i) => i);
  }
  const active = [];
  const limit = Math.min(count, activity.length);
  for (let i = 0; i < limit; i += 1) {
    if (activity[i]) {
      active.push(i);
    }
  }
  return active;
}

function seedPositions(buffer, activeNodes, useDepth) {
  const stride = 4;
  const { radius, depth, center } = state.options;
  const cz = center?.[2] ?? 0;
  for (let i = 0; i < activeNodes.length; i += 1) {
    const index = activeNodes[i];
    const pos = index * stride;
    buffer[pos] = (center?.[0] ?? 0) + (Math.random() - 0.5) * radius;
    buffer[pos + 1] = (center?.[1] ?? 0) + (Math.random() - 0.5) * radius;
    buffer[pos + 2] = cz + (Math.random() - 0.5) * (useDepth ? depth : 0);
    buffer[pos + 3] = 1;
  }
}

function computeTimestep(timestamp) {
  const now = timestamp || performance.now();
  const last = state.lastTimestamp || now;
  const dtMs = Math.max(1, now - last);
  const dt = Math.min(0.05, Math.max(0.008, dtMs * 0.001));
  return {
    dt,
    timeScale: dt * 60,
  };
}

function zeroForces(forces, count) {
  const needed = count * 3;
  if (forces.length < needed) return;
  for (let i = 0; i < needed; i += 1) {
    forces[i] = 0;
  }
}

function applyRepulsion(buffer, activeNodes, useDepth) {
  if (activeNodes.length < 2) return;
  const strategy = (state.options.repulsionStrategy || defaultOptions.repulsionStrategy).toLowerCase();
  if (strategy === 'negative') {
    repulsionByNegativeSampling(buffer, activeNodes, useDepth, 1);
    return;
  }
  if (strategy === 'full' || activeNodes.length <= 32) {
    repulsionAllPairs(buffer, activeNodes, useDepth);
    return;
  }
  repulsionBarnesHut(buffer, activeNodes, useDepth);
  if (state.options.negativeSampling) {
    repulsionByNegativeSampling(buffer, activeNodes, useDepth, 0.5);
  }
}

function repulsionAllPairs(buffer, activeNodes, useDepth) {
  const stride = 4;
  const rExp = state.options.repulsionExponent ?? defaultOptions.repulsionExponent;
  const kRep = state.options.kRepulsion ?? defaultOptions.kRepulsion;
  const eps = state.options.epsilon ?? defaultOptions.epsilon;
  const dMin = state.options.minDistance ?? defaultOptions.minDistance;
  for (let idx = 0; idx < activeNodes.length; idx += 1) {
    const i = activeNodes[idx];
    const io = i * stride;
    const ix = buffer[io];
    const iy = buffer[io + 1];
    const iz = useDepth ? buffer[io + 2] : 0;
    for (let jdx = idx + 1; jdx < activeNodes.length; jdx += 1) {
      const j = activeNodes[jdx];
      const jo = j * stride;
      const dx = ix - buffer[jo];
      const dy = iy - buffer[jo + 1];
      const dz = useDepth ? iz - buffer[jo + 2] : 0;
      const distSq = dx * dx + dy * dy + dz * dz;
      const dist = Math.max(Math.sqrt(distSq), dMin);
      const dEff = dist + eps;
      const scale = kRep / Math.pow(dEff, rExp + 1);
      const fx = dx * scale;
      const fy = dy * scale;
      const fz = dz * scale;
      const fi = i * 3;
      const fj = j * 3;
      state.forces[fi] += fx;
      state.forces[fi + 1] += fy;
      state.forces[fi + 2] += fz;
      state.forces[fj] -= fx;
      state.forces[fj + 1] -= fy;
      state.forces[fj + 2] -= fz;
    }
  }
}

function repulsionByNegativeSampling(buffer, activeNodes, useDepth, scaleFactor) {
  const stride = 4;
  const rExp = state.options.repulsionExponent ?? defaultOptions.repulsionExponent;
  const kRep = (state.options.kRepulsion ?? defaultOptions.kRepulsion) * scaleFactor;
  const eps = state.options.epsilon ?? defaultOptions.epsilon;
  const dMin = state.options.minDistance ?? defaultOptions.minDistance;
  const samples = Math.max(1, Math.floor(state.options.negativesPerNode ?? defaultOptions.negativesPerNode));
  const total = activeNodes.length;
  for (let idx = 0; idx < total; idx += 1) {
    const i = activeNodes[idx];
    const io = i * stride;
    const ix = buffer[io];
    const iy = buffer[io + 1];
    const iz = useDepth ? buffer[io + 2] : 0;
    let fx = 0;
    let fy = 0;
    let fz = 0;
    for (let s = 0; s < samples; s += 1) {
      let jIdx = Math.floor(Math.random() * total);
      if (jIdx === idx) {
        jIdx = (jIdx + 1) % total;
      }
      const j = activeNodes[jIdx];
      const jo = j * stride;
      const dx = ix - buffer[jo];
      const dy = iy - buffer[jo + 1];
      const dz = useDepth ? iz - buffer[jo + 2] : 0;
      const distSq = dx * dx + dy * dy + dz * dz;
      const dist = Math.max(Math.sqrt(distSq), dMin);
      const dEff = dist + eps;
      const scale = kRep / Math.pow(dEff, rExp + 1);
      fx += dx * scale;
      fy += dy * scale;
      fz += dz * scale;
    }
    const weight = (total - 1) / samples;
    const fo = i * 3;
    state.forces[fo] += fx * weight;
    state.forces[fo + 1] += fy * weight;
    state.forces[fo + 2] += fz * weight;
  }
}

function repulsionBarnesHut(buffer, activeNodes, useDepth) {
  if (activeNodes.length === 0) return;
  const tree = buildOctree(buffer, activeNodes, useDepth);
  const stride = 4;
  const rExp = state.options.repulsionExponent ?? defaultOptions.repulsionExponent;
  const kRep = state.options.kRepulsion ?? defaultOptions.kRepulsion;
  const eps = state.options.epsilon ?? defaultOptions.epsilon;
  const dMin = state.options.minDistance ?? defaultOptions.minDistance;
  for (let idx = 0; idx < activeNodes.length; idx += 1) {
    const i = activeNodes[idx];
    const io = i * stride;
    const px = buffer[io];
    const py = buffer[io + 1];
    const pz = useDepth ? buffer[io + 2] : 0;
    const stack = [0];
    while (stack.length > 0) {
      const nodeIndex = stack.pop();
      const cell = tree[nodeIndex];
      if (!cell || cell.mass === 0) continue;
      if (cell.isLeaf) {
        for (let j = 0; j < cell.indices.length; j += 1) {
          const target = cell.indices[j];
          if (target === i) continue;
          const to = target * stride;
          const dx = px - buffer[to];
          const dy = py - buffer[to + 1];
          const dz = useDepth ? pz - buffer[to + 2] : 0;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy + dz * dz), dMin);
          const dEff = dist + eps;
          const scale = kRep / Math.pow(dEff, rExp + 1);
          const fo = i * 3;
          state.forces[fo] += dx * scale;
          state.forces[fo + 1] += dy * scale;
          state.forces[fo + 2] += dz * scale;
        }
        continue;
      }
      const dx = px - cell.com[0];
      const dy = py - cell.com[1];
      const dz = useDepth ? pz - cell.com[2] : 0;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy + dz * dz), dMin);
      const open = (cell.size || 1) / dist;
      if (open < (state.options.theta ?? defaultOptions.theta)) {
        const dEff = dist + eps;
        const scale = (kRep * cell.mass) / Math.pow(dEff, rExp + 1);
        const fo = i * 3;
        state.forces[fo] += dx * scale;
        state.forces[fo + 1] += dy * scale;
        state.forces[fo + 2] += dz * scale;
      } else {
        for (let c = 0; c < cell.children.length; c += 1) {
          const childIndex = cell.children[c];
          if (childIndex !== -1) {
            stack.push(childIndex);
          }
        }
      }
    }
  }
}

function buildOctree(buffer, activeNodes, useDepth) {
  const stride = 4;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < activeNodes.length; i += 1) {
    const idx = activeNodes[i] * stride;
    const x = buffer[idx];
    const y = buffer[idx + 1];
    const z = useDepth ? buffer[idx + 2] : 0;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ, state.options.minDistance || 1);
  const half = size * 0.5 || 1;
  const center = [(minX + maxX) * 0.5 || 0, (minY + maxY) * 0.5 || 0, (minZ + maxZ) * 0.5 || 0];
  const tree = [
    {
      center,
      half,
      size,
      children: new Array(8).fill(-1),
      indices: [],
      isLeaf: true,
      mass: 0,
      com: [0, 0, 0],
    },
  ];
  for (let i = 0; i < activeNodes.length; i += 1) {
    insertIntoOctree(tree, 0, activeNodes[i], buffer, useDepth, 0);
  }
  computeMass(0, tree, buffer, useDepth);
  return tree;
}

function insertIntoOctree(tree, nodeIndex, pointIndex, buffer, useDepth, depth) {
  const node = tree[nodeIndex];
  if (node.isLeaf && (node.indices.length < (state.options.leafSize ?? defaultOptions.leafSize) || depth > 18)) {
    node.indices.push(pointIndex);
    return;
  }
  if (node.isLeaf) {
    subdivide(tree, nodeIndex);
    const existing = node.indices.slice();
    node.indices.length = 0;
    for (let i = 0; i < existing.length; i += 1) {
      insertIntoOctree(tree, nodeIndex, existing[i], buffer, useDepth, depth + 1);
    }
  }
  const child = selectOctant(node, pointIndex, buffer, useDepth);
  insertIntoOctree(tree, child, pointIndex, buffer, useDepth, depth + 1);
}

function subdivide(tree, nodeIndex) {
  const node = tree[nodeIndex];
  const quarter = node.half * 0.5;
  const offsets = [
    [-1, -1, -1],
    [1, -1, -1],
    [-1, 1, -1],
    [1, 1, -1],
    [-1, -1, 1],
    [1, -1, 1],
    [-1, 1, 1],
    [1, 1, 1],
  ];
  for (let i = 0; i < 8; i += 1) {
    const [ox, oy, oz] = offsets[i];
    const center = [node.center[0] + ox * quarter, node.center[1] + oy * quarter, node.center[2] + oz * quarter];
    tree.push({
      center,
      half: quarter,
      size: node.half,
      children: new Array(8).fill(-1),
      indices: [],
      isLeaf: true,
      mass: 0,
      com: [0, 0, 0],
    });
    node.children[i] = tree.length - 1;
  }
  node.isLeaf = false;
}

function selectOctant(node, pointIndex, buffer, useDepth) {
  const stride = 4;
  const offset = pointIndex * stride;
  const x = buffer[offset];
  const y = buffer[offset + 1];
  const z = useDepth ? buffer[offset + 2] : 0;
  const right = x >= node.center[0] ? 1 : 0;
  const top = y >= node.center[1] ? 1 : 0;
  const front = z >= node.center[2] ? 1 : 0;
  const octant = (front << 2) | (top << 1) | right;
  return node.children[octant];
}

function computeMass(index, tree, buffer, useDepth) {
  const node = tree[index];
  if (node.isLeaf) {
    const stride = 4;
    const len = node.indices.length;
    if (!len) {
      node.mass = 0;
      node.com = [0, 0, 0];
      return 0;
    }
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (let i = 0; i < len; i += 1) {
      const idx = node.indices[i] * stride;
      sx += buffer[idx];
      sy += buffer[idx + 1];
      sz += useDepth ? buffer[idx + 2] : 0;
    }
    node.mass = len;
    node.com = [sx / len, sy / len, sz / len];
    return len;
  }
  let mass = 0;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < node.children.length; i += 1) {
    const childIndex = node.children[i];
    if (childIndex === -1) continue;
    const childMass = computeMass(childIndex, tree, buffer, useDepth);
    const child = tree[childIndex];
    if (childMass > 0) {
      mass += childMass;
      cx += child.com[0] * childMass;
      cy += child.com[1] * childMass;
      cz += child.com[2] * childMass;
    }
  }
  node.mass = mass;
  if (mass > 0) {
    node.com = [cx / mass, cy / mass, cz / mass];
  } else {
    node.com = [0, 0, 0];
  }
  return mass;
}

function applyAttraction(buffer, activeNodes, useDepth) {
  if (!state.edges || state.edges.length === 0) return;
  const stride = 4;
  const aExp = state.options.attractionExponent ?? defaultOptions.attractionExponent;
  const kAtt = state.options.kAttraction ?? defaultOptions.kAttraction;
  const dMin = state.options.minDistance ?? defaultOptions.minDistance;
  const edgeCount = state.edges.length / 2;
  const activity = state.nodeActivity;
  for (let e = 0; e < edgeCount; e += 1) {
    const from = state.edges[e * 2];
    const to = state.edges[e * 2 + 1];
    if (activity && (!activity[from] || !activity[to])) continue;
    const fo = from * stride;
    const toOff = to * stride;
    const dx = buffer[fo] - buffer[toOff];
    const dy = buffer[fo + 1] - buffer[toOff + 1];
    const dz = useDepth ? buffer[fo + 2] - buffer[toOff + 2] : 0;
    const dist = Math.max(Math.sqrt(dx * dx + dy * dy + dz * dz), dMin);
    const scale = -kAtt * Math.pow(dist, aExp - 1);
    const fx = dx * scale;
    const fy = dy * scale;
    const fz = dz * scale;
    const fromF = from * 3;
    const toF = to * 3;
    state.forces[fromF] += fx;
    state.forces[fromF + 1] += fy;
    state.forces[fromF + 2] += fz;
    state.forces[toF] -= fx;
    state.forces[toF + 1] -= fy;
    state.forces[toF + 2] -= fz;
  }
}

function applyGravity(buffer, activeNodes, useDepth) {
  const kGrav = state.options.kGravity ?? defaultOptions.kGravity;
  if (!kGrav) return;
  const cx = state.options.center?.[0] ?? 0;
  const cy = state.options.center?.[1] ?? 0;
  const cz = state.options.center?.[2] ?? 0;
  const stride = 4;
  for (let i = 0; i < activeNodes.length; i += 1) {
    const index = activeNodes[i];
    const offset = index * stride;
    const dx = buffer[offset] - cx;
    const dy = buffer[offset + 1] - cy;
    const dz = useDepth ? buffer[offset + 2] - cz : 0;
    const fo = index * 3;
    state.forces[fo] -= kGrav * dx;
    state.forces[fo + 1] -= kGrav * dy;
    state.forces[fo + 2] -= kGrav * dz;
  }
}

function integrate(buffer, activeNodes, useDepth, eta, damping) {
  const maxForce = state.options.maxForce ?? defaultOptions.maxForce;
  const maxStep = state.options.maxStep ?? defaultOptions.maxStep;
  const stride = 4;
  for (let i = 0; i < activeNodes.length; i += 1) {
    const index = activeNodes[i];
    const fo = index * 3;
    let fx = state.forces[fo];
    let fy = state.forces[fo + 1];
    let fz = useDepth ? state.forces[fo + 2] : 0;
    const normF = Math.sqrt(fx * fx + fy * fy + fz * fz);
    if (maxForce > 0 && normF > maxForce) {
      const s = maxForce / (normF + 1e-9);
      fx *= s;
      fy *= s;
      fz *= s;
    }
    let vx = (state.velocities[fo] ?? 0) * damping + eta * fx;
    let vy = (state.velocities[fo + 1] ?? 0) * damping + eta * fy;
    let vz = useDepth ? (state.velocities[fo + 2] ?? 0) * damping + eta * fz : 0;
    const stepNorm = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (maxStep > 0 && stepNorm > maxStep) {
      const s = maxStep / (stepNorm + 1e-9);
      vx *= s;
      vy *= s;
      vz *= s;
    }
    state.velocities[fo] = vx;
    state.velocities[fo + 1] = vy;
    state.velocities[fo + 2] = vz;

    const pos = index * stride;
    buffer[pos] += vx;
    buffer[pos + 1] += vy;
    buffer[pos + 2] = useDepth ? buffer[pos + 2] + vz : 0;
    buffer[pos + 3] = 1;
  }
}

function recenter(buffer, activeNodes, useDepth) {
  if (!activeNodes.length) return;
  const stride = 4;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < activeNodes.length; i += 1) {
    const offset = activeNodes[i] * stride;
    cx += buffer[offset];
    cy += buffer[offset + 1];
    cz += useDepth ? buffer[offset + 2] : 0;
  }
  cx /= activeNodes.length;
  cy /= activeNodes.length;
  cz = useDepth ? cz / activeNodes.length : 0;

  const targetX = state.options.center?.[0] ?? 0;
  const targetY = state.options.center?.[1] ?? 0;
  const targetZ = state.options.center?.[2] ?? 0;
  for (let i = 0; i < activeNodes.length; i += 1) {
    const offset = activeNodes[i] * stride;
    buffer[offset] += targetX - cx;
    buffer[offset + 1] += targetY - cy;
    buffer[offset + 2] = useDepth ? buffer[offset + 2] + targetZ - cz : 0;
  }
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}
