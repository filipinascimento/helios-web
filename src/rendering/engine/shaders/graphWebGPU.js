export function createGraphWebGPUSources(stateSlots = 4, options = {}) {
  const STATE_SLOTS = Math.max(0, Math.min(32, Math.floor(Number(stateSlots) || 0)));
  const FORCE_VISIBILITY_BOOST = 1000.0;
  const useEdgeIndices = options.useEdgeIndices !== false;
  const edgeOptions = options?.edge && typeof options.edge === 'object' ? options.edge : {};
  const bindings = options?.bindings ?? null;
  const defaultBindings = {
    camera: 0,
    edgeIndices: 1,
    edgeEndpoints: 2,
    nodePositions: 3,
    nodePositionsFrom: 4,
    nodeSizes: 5,
    nodeColors: 6,
    nodeStates: 7,
    edgeColors: 8,
    edgeWidths: 9,
    edgeEndpointSizes: 10,
    edgeOpacities: 11,
    edgeStates: 12,
    globals: 13,
    hover: 14,
    edgeNodeColorSource: 15,
    edgeNodeWidthSource: 16,
    edgeNodeOpacitySource: 17,
    edgeNodeEndpointSizeSource: 18,
  };
  const bindingMap = bindings ?? defaultBindings;
  const hasBinding = (name) => {
    if (bindings) {
      return bindingMap[name] != null;
    }
    return Object.prototype.hasOwnProperty.call(defaultBindings, name);
  };
  const bindingIndex = (name) => bindingMap[name];

  const normalizeEndpoints = (value) => {
    if (value === 'source' || value === 'from') return 1;
    if (value === 'destination' || value === 'target' || value === 'to') return 2;
    return 0;
  };

  const normalizeEdgeOption = (entry, fallbackSource = 'edge') => {
    if (!entry || typeof entry !== 'object') {
      return { mode: 'buffer', source: fallbackSource, endpoints: 0, doubleWidth: true };
    }
    const mode = entry.mode ?? entry ?? 'buffer';
    const source = entry.source ?? fallbackSource;
    const endpoints = normalizeEndpoints(entry.endpoints);
    const doubleWidth = entry.doubleWidth !== false;
    return { mode, source, endpoints, doubleWidth };
  };

  const color = normalizeEdgeOption(edgeOptions.color, 'edge');
  const width = normalizeEdgeOption(edgeOptions.width, 'edge');
  const opacity = normalizeEdgeOption(edgeOptions.opacity, 'edge');
  const endpointSize = normalizeEdgeOption(edgeOptions.endpointSize, 'edge');
  const fastEdgePath = edgeOptions.fastPath === true;
  const positionInterpolationEnabled = edgeOptions.positionInterpolation === true;
  const cameraMode = edgeOptions.cameraMode === '2d'
    ? '2d'
    : (edgeOptions.cameraMode === '3d' ? '3d' : 'dynamic');
  const semanticZoomEnabled = !fastEdgePath && edgeOptions.semanticZoom !== false;
  const trimEnabled = !fastEdgePath && edgeOptions.trim !== false;
  const edgeStateEnabled = !fastEdgePath && edgeOptions.edgeState !== false;
  const propagateSelectedNodesToEdges = !fastEdgePath && edgeOptions.propagateSelectedNodesToEdges === true;
  const endpointStateEnabled = !fastEdgePath
    && (edgeOptions.endpointState !== false || propagateSelectedNodesToEdges)
    && (trimEnabled || propagateSelectedNodesToEdges);
  const propagateHoveredNodeToEdges = !fastEdgePath && edgeOptions.propagateHoveredNodeToEdges === true;

  const useEdgeColorBuffer = color.mode !== 'uniform' && color.source !== 'node';
  const useEdgeColorNode = color.mode !== 'uniform' && color.source === 'node';
  const useEdgeWidthBuffer = width.mode !== 'uniform' && width.source !== 'node';
  const useEdgeWidthNode = width.mode !== 'uniform' && width.source === 'node';
  const useEdgeOpacityBuffer = opacity.mode !== 'uniform' && opacity.source !== 'node';
  const useEdgeOpacityNode = opacity.mode !== 'uniform' && opacity.source === 'node';
  const useEdgeEndpointSizeBuffer = endpointSize.mode !== 'uniform' && endpointSize.source !== 'node';
  const useEdgeEndpointSizeNode = endpointSize.mode !== 'uniform' && endpointSize.source === 'node';

  const edgeColorBufferSnippet = useEdgeColorBuffer
    ? `
  colorStart = edgeColors.data[edgeId * 2u];
  colorEnd = edgeColors.data[edgeId * 2u + 1u];
`
    : '';
  const edgeColorNodeSnippet = useEdgeColorNode
    ? `
  let nodeColorsPair = selectNodeColor(edgeNodeColorSource.data[sourceId], edgeNodeColorSource.data[targetId], EDGE_COLOR_ENDPOINTS);
  colorStart = nodeColorsPair.start;
  colorEnd = nodeColorsPair.end;
`
    : '';
  const edgeWidthBufferSnippet = useEdgeWidthBuffer
    ? `
  endpointWidth = edgeWidths.data[edgeId];
`
    : '';
  const edgeWidthNodeSnippet = useEdgeWidthNode
    ? `
  endpointWidth = selectNodePair(edgeNodeWidthSource.data[sourceId], edgeNodeWidthSource.data[targetId], EDGE_WIDTH_ENDPOINTS);
`
    : '';
  const edgeOpacityBufferSnippet = useEdgeOpacityBuffer
    ? `
  opacityPair = edgeOpacities.data[edgeId];
`
    : '';
  const edgeOpacityNodeSnippet = useEdgeOpacityNode
    ? `
  opacityPair = selectNodePair(edgeNodeOpacitySource.data[sourceId], edgeNodeOpacitySource.data[targetId], EDGE_OPACITY_ENDPOINTS);
`
    : '';
  const edgeEndpointSizeBufferSnippet = useEdgeEndpointSizeBuffer
    ? `
  endpointSize = edgeEndpointSizes.data[edgeId];
`
    : '';
  const edgeEndpointSizeNodeSnippet = useEdgeEndpointSizeNode
    ? `
  let nodeSizesPair = selectNodePair(edgeNodeEndpointSizeSource.data[sourceId], edgeNodeEndpointSizeSource.data[targetId], EDGE_ENDPOINT_SIZE_ENDPOINTS);
  endpointSize = nodeSizesPair;
`
    : '';
  const semanticScaleExpr = (!semanticZoomEnabled || cameraMode === '3d') ? '1.0' : 'semanticZoomScale()';

  const edgeIdVertexSnippet = useEdgeIndices
    ? 'var edgeId = edgeIndices.data[edgeSlot];'
    : 'var edgeId = edgeSlot;';
  const edgeIdQuadSnippet = useEdgeIndices
    ? 'var edgeId = edgeIndices.data[input.instance];'
    : 'var edgeId = input.instance;';

  const edgeStateSnippet = edgeStateEnabled
    ? `
  var state = edgeStates.data[edgeId];
  let endpointStatePair = ${endpointStateEnabled ? 'vec2<u32>(nodeStates.data[sourceId], nodeStates.data[targetId])' : 'vec2<u32>(0u, 0u)'};
  if (hover.edgeIndex != 0xffffffffu && edgeId == hover.edgeIndex) {
    state = state | hover.edgeState;
  }
  ${propagateHoveredNodeToEdges
    ? `
  if (hover.nodeIndex != 0xffffffffu && (sourceId == hover.nodeIndex || targetId == hover.nodeIndex)) {
    state = state | 4u;
  }`
    : ''}
  ${propagateSelectedNodesToEdges
    ? `
  if (((endpointStatePair.x | endpointStatePair.y) & 2u) != 0u) {
    state = state | 2u;
  }`
    : ''}
  let forceMaxAlpha = (state & hover.edgeStateForceMaxAlphaMask) != 0u;
  var widthMul = 1.0;
  var opacityMul = 1.0;
  var rgbMul = vec3<f32>(1.0, 1.0, 1.0);
  var rgbAdd = vec3<f32>(0.0, 0.0, 0.0);
  var discardFlag = 0u;
  if (state == 0u) {
    let scale = globals.edgeNoStateScale;
    widthMul = widthMul * scale.x;
    opacityMul = opacityMul * scale.y;
    rgbMul = rgbMul * globals.edgeNoStateColorMul.rgb;
    rgbAdd = rgbAdd + globals.edgeNoStateColorAdd.rgb;
    discardFlag = select(0u, 1u, scale.w > 0.5);
  } else {
    for (var i = 0u; i < ${STATE_SLOTS}u; i = i + 1u) {
      let enabled = (state >> i) & 1u;
      if (enabled == 1u) {
        let scale = globals.edgeStateScale[i];
        widthMul = widthMul * scale.x;
        opacityMul = opacityMul * scale.y;
        rgbMul = rgbMul * globals.edgeStateColorMul[i].rgb;
        rgbAdd = rgbAdd + globals.edgeStateColorAdd[i].rgb;
        if (scale.w > 0.5) {
          discardFlag = 1u;
        }
      }
    }
  }
`
    : `
  let forceMaxAlpha = false;
  var widthMul = 1.0;
  var opacityMul = 1.0;
  var rgbMul = vec3<f32>(1.0, 1.0, 1.0);
  var rgbAdd = vec3<f32>(0.0, 0.0, 0.0);
  var discardFlag = 0u;
`;

  const edgeTrimSnippet = trimEnabled
    ? `
  var endpointSize = globals.edgeEndpointSizeRaw;
  ${edgeEndpointSizeBufferSnippet}
  ${edgeEndpointSizeNodeSnippet}

  var startSizeMul = 1.0;
  var endSizeMul = 1.0;
  ${endpointStateEnabled
    ? `
  let endpointState = vec2<u32>(nodeStates.data[sourceId], nodeStates.data[targetId]);
  if (endpointState.x == 0u) {
    startSizeMul = startSizeMul * globals.nodeNoStateScale.x;
  } else {
    for (var i = 0u; i < ${STATE_SLOTS}u; i = i + 1u) {
      let slotMul = globals.nodeStateScale[i].x;
      if (((endpointState.x >> i) & 1u) == 1u) {
        startSizeMul = startSizeMul * slotMul;
      }
    }
  }
  if (endpointState.y == 0u) {
    endSizeMul = endSizeMul * globals.nodeNoStateScale.x;
  } else {
    for (var i = 0u; i < ${STATE_SLOTS}u; i = i + 1u) {
      let slotMul = globals.nodeStateScale[i].x;
      if (((endpointState.y >> i) & 1u) == 1u) {
        endSizeMul = endSizeMul * slotMul;
      }
    }
  }
`
    : ''}
  let dirRaw = endPos - startPos;
  let dirLen = max(length(dirRaw), 1e-5);
  let dir = dirRaw / vec3<f32>(dirLen);
  let semanticScale = ${semanticScaleExpr};
  let startRadius = max((globals.nodeSize.x + globals.nodeSize.y * endpointSize.x) * startSizeMul, 0.0) * 0.5 * semanticScale;
  let endRadius = max((globals.nodeSize.x + globals.nodeSize.y * endpointSize.y) * endSizeMul, 0.0) * 0.5 * semanticScale;
  let trimStart = startRadius * globals.edgeTrim.x;
  let trimEnd = endRadius * globals.edgeTrim.x;
  startPos = startPos + dir * trimStart;
  endPos = endPos - dir * trimEnd;
`
    : '';

  const edgeGeometrySetupSnippet = trimEnabled
    ? ''
    : `
  let dirRaw = endPos - startPos;
  let dirLen = max(length(dirRaw), 1e-5);
  let dir = dirRaw / vec3<f32>(dirLen);
  let semanticScale = ${semanticScaleExpr};
`;

  const edgeLineGeometrySnippet = fastEdgePath
    ? `
  var position = startPos;
  if ((vertexIndex & 1u) == 1u) {
    position = endPos;
  }
`
    : `
  ${edgeGeometrySetupSnippet}
  ${edgeTrimSnippet}
  var position = startPos;
  if ((vertexIndex & 1u) == 1u) {
    position = endPos;
  }
`;

  const edgeLineVisualSnippet = fastEdgePath
    ? `
  var colorStart = globals.edgeColorStart;
  var colorEnd = globals.edgeColorEnd;
  ${edgeColorBufferSnippet}
  ${edgeColorNodeSnippet}
  let color = select(colorStart, colorEnd, (vertexIndex & 1u) == 1u);
  let attrOpacity = select(globals.edgeOpacityRaw.x, globals.edgeOpacityRaw.y, (vertexIndex & 1u) == 1u);
`
    : `
  var colorStart = globals.edgeColorStart;
  var colorEnd = globals.edgeColorEnd;
  ${edgeColorBufferSnippet}
  ${edgeColorNodeSnippet}

  var endpointWidth = globals.edgeWidthRaw;
  ${edgeWidthBufferSnippet}
  ${edgeWidthNodeSnippet}

  var opacityPair = globals.edgeOpacityRaw;
  ${edgeOpacityBufferSnippet}
  ${edgeOpacityNodeSnippet}

  let color = select(colorStart, colorEnd, (vertexIndex & 1u) == 1u);
  let width = (globals.edgeWidth.x + globals.edgeWidth.y * select(endpointWidth.x, endpointWidth.y, (vertexIndex & 1u) == 1u)) * widthMul * semanticScale;
  let attrOpacity = select(opacityPair.x, opacityPair.y, (vertexIndex & 1u) == 1u);
`;

  const semanticZoomSnippet = (!semanticZoomEnabled || cameraMode === '3d')
    ? `
fn semanticZoomScale() -> f32 {
  return 1.0;
}
`
    : (cameraMode === '2d'
      ? `
fn semanticZoomScale() -> f32 {
  let exponent = globals._pad0.x;
  if (exponent <= 0.0 || exponent != exponent) {
    return 1.0;
  }
  let zoom2D = max(abs(camera.view[0][0]), 1e-3);
  if (exponent == 1.0) {
    return 1.0 / zoom2D;
  }
  return 1.0 / pow(zoom2D, exponent);
}
`
      : `
fn semanticZoomScale() -> f32 {
  let is2D = camera.position.w > 0.5;
  if (!is2D) {
    return 1.0;
  }
  let exponent = globals._pad0.x;
  if (exponent <= 0.0 || exponent != exponent) {
    return 1.0;
  }
  let zoom2D = max(abs(camera.view[0][0]), 1e-3);
  if (exponent == 1.0) {
    return 1.0 / zoom2D;
  }
  return 1.0 / pow(zoom2D, exponent);
}
`);

  const edgeQuadWidthDirSnippet = cameraMode === '2d'
    ? `
  let widthDir = normalize(vec3<f32>(-dir.y, dir.x, 0.0));
`
    : (cameraMode === '3d'
      ? `
  let viewDirRaw = camera.position.xyz - centerPos;
  let viewDirLen = max(length(viewDirRaw), 1e-5);
  let viewDir = viewDirRaw / vec3<f32>(viewDirLen);
  var widthDir = cross(viewDir, dir);
  var widthDirLen = length(widthDir);
  if (widthDirLen <= 1e-5) {
    widthDir = cross(normalize(camera.up.xyz), dir);
    widthDirLen = length(widthDir);
  }
  if (widthDirLen <= 1e-5) {
    widthDir = cross(dir, normalize(camera.right.xyz));
    widthDirLen = length(widthDir);
  }
  widthDir = select(
    vec3<f32>(0.0, 1.0, 0.0),
    widthDir / vec3<f32>(max(widthDirLen, 1e-5)),
    widthDirLen > 1e-5
  );
`
      : `
  var widthDir = vec3<f32>(-dir.y, dir.x, 0.0);
  if (camera.position.w <= 0.5) {
    let viewDirRaw = camera.position.xyz - centerPos;
    let viewDirLen = max(length(viewDirRaw), 1e-5);
    let viewDir = viewDirRaw / vec3<f32>(viewDirLen);
    widthDir = cross(viewDir, dir);
    var widthDirLen = length(widthDir);
    if (widthDirLen <= 1e-5) {
      widthDir = cross(normalize(camera.up.xyz), dir);
      widthDirLen = length(widthDir);
    }
    if (widthDirLen <= 1e-5) {
      widthDir = cross(dir, normalize(camera.right.xyz));
      widthDirLen = length(widthDir);
    }
    widthDir = select(
      vec3<f32>(0.0, 1.0, 0.0),
      widthDir / vec3<f32>(max(widthDirLen, 1e-5)),
      widthDirLen > 1e-5
    );
  } else {
    widthDir = normalize(widthDir);
  }
`);

  const bindingLines = [];
  const addBinding = (name, storage, type) => {
    if (!hasBinding(name)) return;
    const binding = bindingIndex(name);
    const declaration = storage
      ? `@group(0) @binding(${binding}) var<storage, read> ${name} : ${type};`
      : `@group(0) @binding(${binding}) var<uniform> ${name} : ${type};`;
    bindingLines.push(declaration);
  };

  addBinding('camera', false, 'Camera');
  addBinding('edgeIndices', true, 'EdgeIndices');
  addBinding('edgeEndpoints', true, 'EdgeEndpoints');
  addBinding('nodePositions', true, 'NodePositions');
  if (positionInterpolationEnabled) addBinding('nodePositionsFrom', true, 'NodePositionsFrom');
  addBinding('nodeSizes', true, 'NodeSizes');
  addBinding('nodeColors', true, 'NodeColors');
  if (endpointStateEnabled) addBinding('nodeStates', true, 'NodeStates');
  addBinding('edgeColors', true, 'EdgeColors');
  addBinding('edgeWidths', true, 'EdgeWidths');
  if (trimEnabled) addBinding('edgeEndpointSizes', true, 'EdgeEndpointSizes');
  addBinding('edgeOpacities', true, 'EdgeOpacities');
  if (edgeStateEnabled) addBinding('edgeStates', true, 'EdgeStates');
  addBinding('globals', false, 'Globals');
  addBinding('hover', false, 'Hover');
  addBinding('edgeNodeColorSource', true, 'EdgeNodeColorSource');
  addBinding('edgeNodeWidthSource', true, 'EdgeNodeScalarSource');
  addBinding('edgeNodeOpacitySource', true, 'EdgeNodeScalarSource');
  if (trimEnabled) addBinding('edgeNodeEndpointSizeSource', true, 'EdgeNodeScalarSource');

  const EDGE_WGSL = /* wgsl */ `
const EDGE_COLOR_ENDPOINTS : u32 = ${color.endpoints}u;
const EDGE_WIDTH_ENDPOINTS : u32 = ${width.endpoints}u;
const EDGE_OPACITY_ENDPOINTS : u32 = ${opacity.endpoints}u;
const EDGE_ENDPOINT_SIZE_ENDPOINTS : u32 = ${endpointSize.endpoints}u;

struct Camera {
  viewProjection: mat4x4<f32>,
  view: mat4x4<f32>,
  position: vec4<f32>,
  up: vec4<f32>,
  right: vec4<f32>,
  // viewport.xy = width/height in pixels, viewport.zw = 1/width,1/height
  viewport: vec4<f32>,
};

struct Globals {
  nodeOpacity: vec2<f32>, // base, scale
  nodeSize: vec2<f32>, // base, scale
  nodeOutline: vec2<f32>, // base, scale (applied to node size attribute)
  edgeOpacity: vec2<f32>, // base, scale
  edgeWidth: vec2<f32>, // base, scale
  _pad0: vec2<f32>, // x=semanticZoomExponent
  nodeColor: vec4<f32>,
  nodeRaw: vec2<f32>, // x=nodeSizeRaw y=nodeOutlineRaw
  _pad1: vec2<f32>,
  nodeOutlineColor: vec4<f32>,
  edgeColorStart: vec4<f32>,
  edgeColorEnd: vec4<f32>,
  edgeWidthRaw: vec2<f32>,
  edgeOpacityRaw: vec2<f32>,
  edgeEndpointSizeRaw: vec2<f32>,
  _pad2: vec2<f32>,
  edgeTrim: vec4<f32>, // edgeTrim.x used, rest padding
  nodeNoStateScale: vec4<f32>, // x=sizeMul y=opacityMul z=outlineMul w=discard(>0.5)
  nodeNoStateColorMul: vec4<f32>,
  nodeNoStateColorAdd: vec4<f32>,
  edgeNoStateScale: vec4<f32>, // x=widthMul y=opacityMul w=discard(>0.5)
  edgeNoStateColorMul: vec4<f32>,
  edgeNoStateColorAdd: vec4<f32>,
  nodeStateScale: array<vec4<f32>, ${STATE_SLOTS}>,
  nodeStateColorMul: array<vec4<f32>, ${STATE_SLOTS}>,
  nodeStateColorAdd: array<vec4<f32>, ${STATE_SLOTS}>,
  edgeStateScale: array<vec4<f32>, ${STATE_SLOTS}>,
  edgeStateColorMul: array<vec4<f32>, ${STATE_SLOTS}>,
  edgeStateColorAdd: array<vec4<f32>, ${STATE_SLOTS}>,
  positionInterpolation: vec4<f32>, // x=factor y=enabled
};

struct EdgeIndices {
  data: array<u32>,
};

struct EdgeEndpoints {
  data: array<vec2<u32>>,
};

struct NodePositions {
  data: array<f32>, // packed xyz triplets
};

struct NodePositionsFrom {
  data: array<f32>, // packed xyz triplets
};

struct NodeSizes {
  data: array<f32>,
};

struct NodeColors {
  data: array<vec4<f32>>,
};

struct NodeStates {
  data: array<u32>,
};

struct EdgeColors {
  data: array<vec4<f32>>,
};

struct EdgeWidths {
  data: array<vec2<f32>>,
};

struct EdgeEndpointSizes {
  data: array<vec2<f32>>,
};

struct EdgeOpacities {
  data: array<vec2<f32>>,
};

struct EdgeStates {
  data: array<u32>,
};

struct EdgeNodeColorSource {
  data: array<vec4<f32>>,
};

struct EdgeNodeScalarSource {
  data: array<f32>,
};

struct Hover {
  nodeIndex: u32,
  nodeState: u32,
  edgeIndex: u32,
  edgeState: u32,
  nodeStateForceMaxAlphaMask: u32,
  edgeStateForceMaxAlphaMask: u32,
  _pad0: u32,
  _pad1: u32,
};

${bindingLines.join('\n')}

fn selectNodePair(sourceValue: f32, targetValue: f32, endpoints: u32) -> vec2<f32> {
  if (endpoints == 0u) {
    return vec2<f32>(sourceValue, targetValue);
  }
  if (endpoints == 1u) {
    return vec2<f32>(sourceValue, sourceValue);
  }
  return vec2<f32>(targetValue, targetValue);
}

struct ColorPair {
  start: vec4<f32>,
  end: vec4<f32>,
};

fn selectNodeColor(sourceColor: vec4<f32>, targetColor: vec4<f32>, endpoints: u32) -> ColorPair {
  if (endpoints == 0u) {
    return ColorPair(sourceColor, targetColor);
  }
  if (endpoints == 1u) {
    return ColorPair(sourceColor, sourceColor);
  }
  return ColorPair(targetColor, targetColor);
}

fn semanticZoomScale() -> f32 {
  let is2D = camera.position.w > 0.5;
  if (!is2D) {
    return 1.0;
  }
  let exponent = globals._pad0.x;
  if (exponent <= 0.0 || exponent != exponent) {
    return 1.0;
  }
  let zoom2D = max(abs(camera.view[0][0]), 1e-3);
  if (exponent == 1.0) {
    return 1.0 / zoom2D;
  }
  return 1.0 / pow(zoom2D, exponent);
}

struct EdgeVertexOutput {
  @builtin(position) position : vec4<f32>,
  @location(0) color : vec4<f32>,
  @location(1) weight : f32,
  @location(2) @interpolate(flat) discardFlag : u32,
};

@vertex
fn edgeVertex(@builtin(vertex_index) vertexIndex : u32) -> EdgeVertexOutput {
  let edgeSlot = vertexIndex / 2u;
  ${edgeIdVertexSnippet}
  let endpoints = edgeEndpoints.data[edgeId];
  let sourceId = endpoints.x;
  let targetId = endpoints.y;
  let sourceBase = sourceId * 3u;
  let targetBase = targetId * 3u;
  let startPosTo = vec3<f32>(
    nodePositions.data[sourceBase + 0u],
    nodePositions.data[sourceBase + 1u],
    nodePositions.data[sourceBase + 2u]
  );
  let endPosTo = vec3<f32>(
    nodePositions.data[targetBase + 0u],
    nodePositions.data[targetBase + 1u],
    nodePositions.data[targetBase + 2u]
  );
  var startPos = startPosTo;
  var endPos = endPosTo;
  ${positionInterpolationEnabled ? `
  let startPosFrom = vec3<f32>(
    nodePositionsFrom.data[sourceBase + 0u],
    nodePositionsFrom.data[sourceBase + 1u],
    nodePositionsFrom.data[sourceBase + 2u]
  );
  let endPosFrom = vec3<f32>(
    nodePositionsFrom.data[targetBase + 0u],
    nodePositionsFrom.data[targetBase + 1u],
    nodePositionsFrom.data[targetBase + 2u]
  );
  let interpolationT = clamp(globals.positionInterpolation.x, 0.0, 1.0);
  let interpolationEnabled = globals.positionInterpolation.y > 0.5;
  startPos = select(startPosTo, mix(startPosFrom, startPosTo, interpolationT), interpolationEnabled);
  endPos = select(endPosTo, mix(endPosFrom, endPosTo, interpolationT), interpolationEnabled);
  ` : ''}
  ${edgeStateSnippet}

  ${edgeLineGeometrySnippet}
  ${edgeLineVisualSnippet}
  let opacity = clamp(globals.edgeOpacity.x + globals.edgeOpacity.y * attrOpacity, 0.0, 1.0) * opacityMul;
  let rgb = clamp(color.rgb * rgbMul + rgbAdd, vec3<f32>(0.0), vec3<f32>(1.0));
  let weight = max(opacity * color.a, 0.0);
  let alpha = clamp(weight, 0.0, 1.0);
  var output : EdgeVertexOutput;
  output.position = camera.viewProjection * vec4<f32>(position, 1.0);
  output.color = vec4<f32>(rgb, select(alpha, 1.0, forceMaxAlpha));
  output.weight = select(weight, max(weight, ${FORCE_VISIBILITY_BOOST.toFixed(1)}), forceMaxAlpha);
  output.discardFlag = discardFlag;
  return output;
}

struct EdgeQuadInput {
  @location(0) corner : vec2<f32>,
  @builtin(instance_index) instance : u32,
};

@vertex
fn edgeQuadVertex(input : EdgeQuadInput) -> EdgeVertexOutput {
  ${edgeIdQuadSnippet}
  let endpoints = edgeEndpoints.data[edgeId];
  let sourceId = endpoints.x;
  let targetId = endpoints.y;
  let sourceBase = sourceId * 3u;
  let targetBase = targetId * 3u;
  let startPosTo = vec3<f32>(
    nodePositions.data[sourceBase + 0u],
    nodePositions.data[sourceBase + 1u],
    nodePositions.data[sourceBase + 2u]
  );
  let endPosTo = vec3<f32>(
    nodePositions.data[targetBase + 0u],
    nodePositions.data[targetBase + 1u],
    nodePositions.data[targetBase + 2u]
  );
  var startPos = startPosTo;
  var endPos = endPosTo;
  ${positionInterpolationEnabled ? `
  let startPosFrom = vec3<f32>(
    nodePositionsFrom.data[sourceBase + 0u],
    nodePositionsFrom.data[sourceBase + 1u],
    nodePositionsFrom.data[sourceBase + 2u]
  );
  let endPosFrom = vec3<f32>(
    nodePositionsFrom.data[targetBase + 0u],
    nodePositionsFrom.data[targetBase + 1u],
    nodePositionsFrom.data[targetBase + 2u]
  );
  let interpolationT = clamp(globals.positionInterpolation.x, 0.0, 1.0);
  let interpolationEnabled = globals.positionInterpolation.y > 0.5;
  startPos = select(startPosTo, mix(startPosFrom, startPosTo, interpolationT), interpolationEnabled);
  endPos = select(endPosTo, mix(endPosFrom, endPosTo, interpolationT), interpolationEnabled);
  ` : ''}
  ${edgeStateSnippet}

  ${edgeGeometrySetupSnippet}
  ${edgeTrimSnippet}

  var colorStart = globals.edgeColorStart;
  var colorEnd = globals.edgeColorEnd;
  ${edgeColorBufferSnippet}
  ${edgeColorNodeSnippet}

  var endpointWidth = globals.edgeWidthRaw;
  ${edgeWidthBufferSnippet}
  ${edgeWidthNodeSnippet}

  var opacityPair = globals.edgeOpacityRaw;
  ${edgeOpacityBufferSnippet}
  ${edgeOpacityNodeSnippet}

  let cornerT = clamp(input.corner.x, 0.0, 1.0);
  let width = max((globals.edgeWidth.x + globals.edgeWidth.y * mix(endpointWidth.x, endpointWidth.y, cornerT)) * widthMul, 1e-3) * semanticScale;
  let halfWidth = max(width, 1e-3) * 0.5;
  let centerPos = mix(startPos, endPos, cornerT);
  ${edgeQuadWidthDirSnippet}
  let worldPos = centerPos + widthDir * halfWidth * input.corner.y;
  let clipPos = camera.viewProjection * vec4<f32>(worldPos, 1.0);

  var output : EdgeVertexOutput;
  output.position = clipPos;
  let blended = mix(colorStart, colorEnd, cornerT);
  let blendedOpacity = mix(opacityPair.x, opacityPair.y, cornerT);
  let opacity = clamp(globals.edgeOpacity.x + globals.edgeOpacity.y * blendedOpacity, 0.0, 1.0) * opacityMul;
  let weight = max(opacity * blended.a, 0.0);
  let alpha = clamp(weight, 0.0, 1.0);
  let rgb = clamp(blended.rgb * rgbMul + rgbAdd, vec3<f32>(0.0), vec3<f32>(1.0));
  output.color = vec4<f32>(rgb, select(alpha, 1.0, forceMaxAlpha));
  output.weight = select(weight, max(weight, ${FORCE_VISIBILITY_BOOST.toFixed(1)}), forceMaxAlpha);
  output.discardFlag = discardFlag;
  return output;
}

@fragment
fn edgeFragment(input : EdgeVertexOutput) -> @location(0) vec4<f32> {
  if (input.discardFlag == 1u) {
    discard;
  }
  return vec4<f32>(input.color.rgb, input.color.a);
}

@fragment
fn edgePremulFragment(input : EdgeVertexOutput) -> @location(0) vec4<f32> {
  if (input.discardFlag == 1u) {
    discard;
  }
  return vec4<f32>(input.color.rgb * input.color.a, input.color.a);
}
`;

  const EDGE_WEIGHTED_WGSL = /* wgsl */ `
${EDGE_WGSL}

struct EdgeWeightedOutput {
  @location(0) colorAccum : vec4<f32>,
  @location(1) weightAccum : vec4<f32>,
};

@fragment
fn edgeWeightedFragment(input : EdgeVertexOutput) -> EdgeWeightedOutput {
  if (input.discardFlag == 1u) {
    discard;
  }
  let weight = input.weight;
  var output : EdgeWeightedOutput;
  output.colorAccum = vec4<f32>(input.color.rgb * weight, weight);
  output.weightAccum = vec4<f32>(weight, 0.0, 0.0, 0.0);
  return output;
}`;

  return {
    EDGE_WGSL,
    EDGE_WEIGHTED_WGSL,
  };
}
