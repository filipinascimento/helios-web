# Rendering Mode Requirements (Indirect-Only)

Helios Web now runs in indirect mode only.

## Active renderer paths

- WebGL2 indirect (texture-backed sparse/indexed access).
- WebGPU indirect (storage-buffer sparse/indexed access).

## Network/API requirements

- Sparse/indexed buffer access via `withBufferAccess`.
- Active node and edge indices (`nodeIndices`, `edgeIndices`).
- Edge topology (`edgesView`).
- Standard visual attributes must be present in sparse form (position/color/size/state, edge channels).

## WebGL2 indirect constraints

- Main hard cap: `MAX_TEXTURE_SIZE`.
- Linear sparse buffers are tiled into textures:
  - `width = min(count, MAX_TEXTURE_SIZE)`
  - `height = ceil(count / width)`
  - must satisfy `height <= MAX_TEXTURE_SIZE`
- Weighted transparency still depends on float color attachment/blend extensions.

## WebGPU indirect constraints

- Main hard cap: `maxStorageBufferBindingSize` per storage buffer.
- Weighted transparency depends on float target availability (`r16float` preferred, `rgba16float` fallback).

## Practical sizing notes

- WebGL2 indirect: capacity is texture-dimension bound.
- WebGPU indirect: capacity is per-buffer-size bound.
- In both paths, large graphs can fail by single-resource limits before total memory is exhausted.
