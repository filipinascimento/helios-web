# Rendering Mode Requirements (WebGPU/WebGL, Dense/Indirect)

This document summarizes the practical requirements and limits for Helios Web Next rendering modes.

## Terminology

- `direct` in this document means the current `dense` backend in code/options.
- Runtime backend selectors:
  - `webgpuBackend: 'dense' | 'indirect'`
  - `webglBackend: 'dense' | 'indirect'`

## Mode Matrix

| Renderer | Backend | Primary GPU data path | Main hard limit |
| --- | --- | --- | --- |
| WebGL2 | Dense (`direct`) | Vertex buffers (dense node/edge buffers) | GPU memory and draw throughput |
| WebGL2 | Indirect | 2D textures + ID buffers + `texelFetch` | `MAX_TEXTURE_SIZE` on texture width/height |
| WebGPU | Dense (`direct`) | Storage buffers | `maxStorageBufferBindingSize` per buffer |
| WebGPU | Indirect | Storage buffers (sparse/indexed) | `maxStorageBufferBindingSize` per buffer |

## WebGL2 Dense (`direct`)

### Network/API requirements

- Dense graph buffers must be available:
  - Node: position, color, size, state, outlineWidth, outlineColor, index
  - Edge: endpointPositions (segments), color, width, opacity, endpointSize, state, endpointState, index
- Dense buffers are updated via `updateDense*` APIs before rendering.

### GPU resources

- Attribute textures: `0` (graph rendering path).
- Main buffers (created/reused):
  - Node: positions, colors, sizes, states, outlineWidths, outlineColors
  - Edge: segments, colors, widths, opacities, endpointSizes, states, endpointStates
  - Static: node quad, edge quad, resolve quad
- Weighted transparency mode (optional) allocates:
  - `2` FP16 color attachments (`RGBA16F`) + `1` depth renderbuffer.

### Extension/non-standard notes

- Weighted transparency in WebGL2 requires:
  - `EXT_color_buffer_float` or `EXT_color_buffer_half_float`
  - `EXT_float_blend`
  - at least 2 color attachments (`MAX_COLOR_ATTACHMENTS >= 2`)
- If unavailable, it falls back to alpha blending.

## WebGL2 Indirect

### Network/API requirements

- Sparse/indexed buffer access is required (`withBufferAccess` path).
- Uses node/edge index views (`nodeIndices`, `edgeIndices`) and edge endpoints (`edgesView`).
- Supports node-sourced edge channels (color/width/opacity/endpointSize) via node attribute buffers.

### GPU resources

- Texture-backed attributes (handles created): `17`
  - Node textures: `10`
  - Edge textures: `7`
- ID buffers: node IDs + edge IDs.
- Static buffers/VAOs: node quad, edge quad, resolve quad.
- Weighted transparency optional attachments: same as WebGL dense (`2` FP16 + depth renderbuffer).

### Texture sizing model

Helios packs linear arrays into tiled 2D textures:

- `width = min(count, MAX_TEXTURE_SIZE)`
- `height = ceil(count / width)`
- Must satisfy `height <= MAX_TEXTURE_SIZE`

For channels using one texel per entity (positions, sizes, states, endpoints, etc.):

- Max entities per texture (theoretical): `MAX_TEXTURE_SIZE^2`

For channels using two texels per edge (edge color start/end):

- Max edges (theoretical): `floor(MAX_TEXTURE_SIZE^2 / 2)`

With `MAX_TEXTURE_SIZE = 16384`:

- Max texels: `268,435,456`
- Max one-texel entities: `268,435,456`
- Max two-texel edges: `134,217,728`

### Example texture dimensions (`MAX_TEXTURE_SIZE = 16384`)

| Count (texels) | Width x Height |
| --- | --- |
| 10,000 | `10000 x 1` |
| 50,000 | `16384 x 4` |
| 100,000 | `16384 x 7` |
| 250,000 | `16384 x 16` |
| 1,000,000 | `16384 x 62` |

Edge color texture uses `2 * edgeCount` texels. Example:

- `edgeCount = 100,000` -> `200,000` texels -> `16384 x 13`

### Texture format bytes (for rough memory math)

- `R32F` / `R32UI`: `4` bytes/texel
- `RG32F` / `RG32UI`: `8` bytes/texel
- `RGB32F`: `12` bytes/texel
- `RGBA32F`: `16` bytes/texel

## WebGPU Dense (`direct`)

### Network/API requirements

- Same dense attribute requirements as WebGL dense.
- Uses dense node/edge packing; may skip explicit index upload when identity packing is available.

### GPU resources

- Graph attribute textures: `0` (storage-buffer driven).
- Uniform buffers:
  - camera, globals, hover
- Storage buffers (typical):
  - Node set: indices (or identity), positions, sizes, colors, states (+ optional outline widths/colors)
  - Edge set: indices (or identity), segments, colors, widths, opacities, endpointSizes, states, endpointStates
- Weighted transparency (optional):
  - Color accumulation texture: `rgba16float`
  - Weight texture: `r16float` (fallback to `rgba16float` if needed)

### Limits and support notes

- Per-storage-buffer hard gate: `maxStorageBufferBindingSize` (checked before allocation/upload).
- Device initialization requests higher limits when available:
  - `maxStorageBufferBindingSize` target uses `storageBufferLimitRatio` (default `0.75`)
  - `maxBufferSize` target uses `bufferLimitRatio` (default `1.0`)
- If weighted targets/pipelines cannot be created, falls back to alpha mode.

## WebGPU Indirect

### Network/API requirements

- Sparse/indexed access via `withBufferAccess`.
- Requires node/edge index buffers and edge endpoints.
- Node-sourced edge channels must be float attributes with expected dimension:
  - color: float4
  - width/opacity/endpointSize: float1

### GPU resources

- Graph attribute textures: `0`.
- Uniform buffers: camera, globals, hover.
- Storage buffers:
  - Node core: indices, positions, sizes, colors, states (+ optional outline widths/colors)
  - Optional node->edge source buffers: color/width/opacity/endpointSize
  - Edge core: indices, endpoints, states
  - Edge channel buffers (when edge-sourced): colors, widths, opacities, endpointSizes
- Edge bind-group layout is variant-dependent and can bind either edge-sourced or node-sourced channel buffers.

### Limits and support notes

- Same per-buffer `maxStorageBufferBindingSize` checks as WebGPU dense.
- No `MAX_TEXTURE_SIZE` attribute cap for graph data (storage-buffer path).

## Practical Sizing Rules

Let:

- `N = node count`
- `E = edge count`

### Dense (`direct`) data footprints (raw payload, before alignment/overhead)

- Node positions: `12 * N` bytes
- Node colors: `16 * N` bytes (if varying)
- Node sizes: `4 * N` bytes (if varying)
- Node states: `4 * N` bytes
- Edge segments: `24 * E` bytes
- Edge colors: `32 * E` bytes (if varying)
- Edge widths/opacities/endpointSizes: `8 * E` bytes each (if varying)
- Edge states: `4 * E` bytes
- Edge endpoint states: `8 * E` bytes

### Indirect data footprints (raw payload, before alignment/overhead)

- Node indices: `4 * N` bytes
- Node positions/colors/sizes/states same per-node costs as above
- Edge indices: `4 * E` bytes
- Edge endpoints: `8 * E` bytes
- Edge colors/widths/opacities/endpointSizes/states same per-edge costs as above

For WebGL indirect, these payloads become texture texels. For WebGPU indirect, they become storage buffers.

## Non-Universal Features to Watch

- WebGPU availability itself varies by browser/platform.
- WebGL weighted transparency path depends on float color attachment/blend extensions.
- WebGPU weighted path depends on float texture allocation support (`r16float` preferred, `rgba16float` fallback).
- Large graphs can fail by per-resource limits even when total memory seems available:
  - WebGL indirect: texture dimension cap (`MAX_TEXTURE_SIZE`)
  - WebGPU: per-buffer cap (`maxStorageBufferBindingSize`)
