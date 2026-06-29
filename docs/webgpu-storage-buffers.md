# WebGPU Storage Buffers And Texture Data Buffers

This file tracks the current WebGPU storage-buffer usage and WebGL texture-backed data-buffer usage in `helios-web`.

`Core` means the storage is always present for that section's current specialized layout. Non-core rows are only present when the stated condition is true.

## Graph Rendering: Nodes

| Storage | What | Core | Activates When |
| --- | --- | --- | --- |
| `nodeIndices` | Maps instance order to sparse node ids. | Yes | Always in the current graph render path. |
| `nodePositions` | Packed node xyz positions. | Yes | Always. |
| `nodeSizes` | Per-node size values. | No | Node size mapper is not uniform-backed. |
| `nodeColors` | Per-node RGBA colors. | No | Node color mapper is not uniform-backed. |
| `nodeStates` | Per-node state bitmasks. | No | Node state styling or hover-state merge is active. |
| `nodeOutlineWidths` | Per-node outline widths. | No | Outline width is attribute-backed. |
| `nodeOutlineColors` | Per-node outline colors. | No | Outline color is attribute-backed. |
| `nodePositionsFrom` | Interpolation source positions. | No | Position interpolation is enabled. |

Total storages: min `2`, max `8`.

## Graph Rendering: Edges

| Storage | What | Core | Activates When |
| --- | --- | --- | --- |
| `edgeIndices` | Maps instance order to sparse edge ids. | Yes | Always in the current graph render path. |
| `edgeEndpoints` | Source and target node ids per edge. | Yes | Always. |
| `nodePositions` | Packed node xyz positions for endpoints. | Yes | Always. |
| `nodePositionsFrom` | Interpolation source positions for endpoints. | No | Position interpolation is enabled. |
| `nodeStates` | Endpoint node state bitmasks. | No | Endpoint-state edge specialization is active. |
| `edgeStates` | Per-edge state bitmasks. | No | Edge state styling is active. |
| `edgeColors` | Per-edge RGBA colors. | No | Edge color is buffer-backed from edge data. |
| `edgeNodeColorSource` | Node scalar/color source for edge color. | No | Edge color is buffer-backed from node data. |
| `edgeWidths` | Per-edge width pairs. | No | Edge width is buffer-backed from edge data. |
| `edgeNodeWidthSource` | Node scalar source for edge width. | No | Edge width is buffer-backed from node data. |
| `edgeOpacities` | Per-edge opacity pairs. | No | Edge opacity is buffer-backed from edge data. |
| `edgeNodeOpacitySource` | Node scalar source for edge opacity. | No | Edge opacity is buffer-backed from node data. |
| `edgeEndpointSizes` | Per-edge endpoint-size pairs. | No | Edge endpoint size is buffer-backed from edge data and endpoint geometry is needed for trim or edge-width clamping. |
| `edgeNodeEndpointSizeSource` | Node scalar source for edge endpoint size. | No | Edge endpoint size is buffer-backed from node data and endpoint geometry is needed for trim or edge-width clamping. |

Total storages: min `3`, max `10`.

## Graph Rendering: Weighted Multipass

### Accumulate Pass

| Storage | What | Core | Activates When |
| --- | --- | --- | --- |
| Same as `Graph Rendering: Edges` | Uses the same edge storage layout as normal edge rendering. | Mixed | Same activation rules as edge rendering. |

Total storages: min `3`, max `10`.

### Resolve Pass

| Storage | What | Core | Activates When |
| --- | --- | --- | --- |
| None | Resolve uses sampled textures, not storage buffers. | Yes | Always. |

Total storages: min `0`, max `0`.

## Density

### Splat Pass

| Storage | What | Core | Activates When |
| --- | --- | --- | --- |
| `nodeIndices` | Maps splat instances to node ids. | Yes | Always. |
| `nodePositions` | Packed node xyz positions. | Yes | Always. |
| `nodeWeights` | Per-node density contribution. | Yes | Always. |

Total storages: min `3`, max `3`.

### Composite Pass

| Storage | What | Core | Activates When |
| --- | --- | --- | --- |
| None | Composite uses textures and uniforms only. | Yes | Always. |

Total storages: min `0`, max `0`.

## Picking / Attribute Tracking: Nodes
| Storage | What | Core | Activates When |
| --- | --- | --- | --- |
| `nodeIndices` | Maps instance order to sparse node ids. | Yes | Always. |
| `nodePositions` | Packed node xyz positions. | Yes | Always. |
| `nodeSizes` | Per-node size values. | No | Node size tracking uses buffer-backed size. |
| `nodeOutlineWidths` | Per-node outline widths. | No | Node outline tracking uses buffer-backed outline width. |
| `nodeTrackedInt` | Integer tracked values. | No | Tracked node attribute mode is `int`. |
| `nodeTrackedUint` | Unsigned tracked values. | No | Tracked node attribute mode is `uint`. |
| `nodeStates` | Per-node state bitmasks. | No | Node or edge picking needs state-aware geometry. |

Total storages: min `2`, max `7`.

## Picking / Attribute Tracking: Edges
| Storage | What | Core | Activates When |
| --- | --- | --- | --- |
| `edgeIndices` | Maps instance order to sparse edge ids. | Yes | Always. |
| `edgeEndpoints` | Source and target node ids per edge. | Yes | Always. |
| `nodePositions` | Packed node xyz positions for endpoints. | Yes | Always. |
| `edgeWidths` | Per-edge width pairs. | No | Edge picking uses edge-backed quad widths. |
| `nodeWidthSource` | Node scalar source for edge width. | No | Edge picking uses node-backed quad widths. |
| `edgeEndpointSizes` | Per-edge endpoint-size pairs. | No | Edge picking uses edge-backed endpoint trim sizes. |
| `nodeEndpointSizeSource` | Node scalar source for endpoint size. | No | Edge picking uses node-backed endpoint trim sizes. |
| `edgeTrackedInt` | Integer tracked values. | No | Tracked edge attribute mode is `int`. |
| `edgeTrackedUint` | Unsigned tracked values. | No | Tracked edge attribute mode is `uint`. |
| `nodeStates` | Endpoint node state bitmasks. | No | Edge picking needs state-aware endpoint geometry. |
| `edgeStates` | Per-edge state bitmasks. | No | Edge picking needs state-aware width geometry. |

Total storages: min `3`, max `8`.

## Summary

| Section | Min | Max |
| --- | ---: | ---: |
| Graph Rendering: Nodes | 2 | 8 |
| Graph Rendering: Edges | 3 | 10 |
| Weighted Multipass: Accumulate | 3 | 10 |
| Weighted Multipass: Resolve | 0 | 0 |
| Density: Splat | 3 | 3 |
| Density: Composite | 0 | 0 |
| Picking Nodes | 2 | 7 |
| Picking Edges | 3 | 8 |

## GPU Layout Processing: WebGPU

These tables describe the storage-buffer inputs used by the GPU-force layout compute backend itself, not by graph rendering.

### Main Compute Pass

| Storage | What | Core | Activates When |
| --- | --- | --- | --- |
| `positionBuffer` | Current node positions. | Yes | Always in GPU-force WebGPU compute. |
| `velocityBuffer` | Current node velocities. | Yes | Always. |
| `scratchPositionBuffer` | Next-step node positions. | Yes | Always. |
| `scratchVelocityBuffer` | Next-step node velocities. | Yes | Always. |
| `activeIdsBuffer` | Active node ids used for sampling. | Yes | Always. |
| `activeMaskBuffer` | Per-node active flags. | Yes | Always. |
| `neighborStartsBuffer` | Per-node adjacency start offsets. | Yes | Always. |
| `neighborCountsBuffer` | Per-node adjacency counts. | Yes | Always. |
| `neighborsBuffer` | Flattened adjacency ids. | Yes | Always. |
| `componentGravityScaleBuffer` | Per-node component gravity multiplier. | No | Non-UMAP GPU-force only; uploaded/fetched only when active component gravity is enabled. |
| `scalarWeightsBuffer` | Packed node mass and neighbor weights. | No | UMAP force model is active; uses the old binding slot where component gravity is absent. |
| `neighborEdgesBuffer` | Original sparse edge id for each flattened neighbor slot. | No | Non-UMAP GPU-force uses weighted attraction or strength normalization. |
| `scalarWeightsBuffer` | Packed node strength values followed by sparse edge weights. | No | Non-UMAP GPU-force uses weighted attraction or strength normalization. |

Total storages: min `10`, max `12`.

Chunked WebGPU layout scheduling reuses the same main-compute storage buffers.
It only changes the dispatched node-id range and delays the full
scratch-to-position swap until the current sweep completes.

### Output Scale Pass

| Storage | What | Core | Activates When |
| --- | --- | --- | --- |
| `positionBuffer` | Current node positions. | Yes | Always in output-scale compute. |
| `outputPositionBuffer` | Scaled output positions. | Yes | Always. |

Total storages: min `2`, max `2`.

In intermediate chunked frames, the output-scale pass may read
`scratchPositionBuffer` for the processed chunk so rendering can show partial
progress before the full sweep is committed. This does not add a new storage
buffer. On sweep completion, chunked mode swaps the simulation position buffers
instead of copying the full scratch buffer back into the main position buffer.
If recentering is enabled, the sweep-completion frame still refreshes the full
output buffer after the global recenter correction.

### Recenter Pass

| Storage | What | Core | Activates When |
| --- | --- | --- | --- |
| `positionBuffer` | In-place node positions to recenter. | Yes | Recenter is enabled. |
| `velocityBuffer` | In-place motion vectors used to estimate and damp rigid-body spin. | Yes | Recenter is enabled. |
| `activeIdsBuffer` | Active node ids used for centroid reduction. | Yes | Recenter is enabled. |

Total storages: min `3`, max `3`.

### Selection Centroid Readback Pass

| Storage | What | Core | Activates When |
| --- | --- | --- | --- |
| `positionBuffer` | GPU-layout node positions for selected ids. | Yes | Large selected-node centroid readback is requested. |
| `centroidIdsBuffer` | Requested node ids to reduce. | Yes | Large selected-node centroid readback is requested. |
| `centroidPartialBuffer` | Per-workgroup xyz sums and counts copied to a small readback buffer. | Yes | Large selected-node centroid readback is requested. |

Total storages: min `3`, max `3`.

### Layout Summary: WebGPU

| Section | Min | Max |
| --- | ---: | ---: |
| Layout Compute: Main | 9 | 11 |
| Layout Compute: Output Scale | 2 | 2 |
| Layout Compute: Recenter | 3 | 3 |
| Layout Compute: Selection Centroid Readback | 3 | 3 |

## GPU Layout Providers: WebGPU

These are alternate GPU-side providers that can supply existing WebGPU storage slots. They reuse the normal binding locations, so they do not change the min/max counts above.

| Storage | What | Used By | Activates When |
| --- | --- | --- | --- |
| `positionBuffer` | GPU-layout node positions for the active `nodePositions` slot. | Graph nodes, graph edges, picking nodes, picking edges. | Sparse nodes expose `positionBuffer`. |
| `sourceWebGPUBuffer` | GPU-layout interpolation-source positions for `nodePositionsFrom`. | Graph nodes, graph edges. | Position interpolation is enabled and interpolation state exposes `sourceWebGPUBuffer`. |
| `shared.positionBuffer` | Shared active node positions consumed through graph sparse resources. | Density splat. | Graph shared sparse resources expose `positionBuffer`. |

## WebGL Texture-Backed Data Buffers

These are active logical data textures used like buffers in the WebGL2 paths. Render targets such as weighted accumulation textures, density output textures, colormap textures, swapchain textures, and depth textures are not listed here. Dormant preallocated GL texture objects that are not part of the current logical path are also not counted here.

Let `T = MAX_TEXTURE_SIZE`.

- Unless noted otherwise, each listed texture uses 1 texel per element and supports up to `T^2` elements.
- `edgeColors` uses 2 texels per edge and supports up to `floor(T^2 / 2)` edges.
- Layout rule: `width = min(count, T)`, `height = ceil(count / width)`.

## WebGL Graph Rendering: Nodes

| Texture | What | Core | Activates When |
| --- | --- | --- | --- |
| `nodePositions` | Packed node xyz positions. | Yes | Always. |
| `nodePositionsFrom` | Interpolation source positions. | No | Position interpolation is enabled. |
| `nodeColors` | Per-node RGBA colors. | No | Node color is texture-backed. |
| `nodeSizes` | Per-node size values. | No | Node size is texture-backed. |
| `nodeStates` | Per-node state bitmasks. | No | Node state styling is texture-backed. |
| `nodeOutlineWidths` | Per-node outline widths. | No | Outline width is texture-backed. |
| `nodeOutlineColors` | Per-node outline colors. | No | Outline color is texture-backed. |

Total textures: min `1`, max `7`.

## WebGL Graph Rendering: Edges

| Texture | What | Core | Activates When |
| --- | --- | --- | --- |
| `nodePositions` | Packed node xyz positions for endpoints. | Yes | Always. |
| `edgeEndpoints` | Source and target node ids per edge. | Yes | Always. |
| `nodePositionsFrom` | Interpolation source positions for endpoints. | No | Position interpolation is enabled. |
| `edgeColors` | Per-edge start and end RGBA colors. | No | Edge color uses edge-backed texture data; 2 texels per edge. |
| `edgeColorSource` | Node-backed edge color source. | No | Edge color comes from nodes instead of `edgeColors`. |
| `edgeWidths` | Per-edge width pairs. | No | Edge width comes from edges instead of `edgeWidthSource`. |
| `edgeWidthSource` | Node-backed edge width source. | No | Edge width comes from nodes instead of `edgeWidths`. |
| `edgeOpacities` | Per-edge opacity pairs. | No | Edge opacity comes from edges instead of `edgeOpacitySource`. |
| `edgeOpacitySource` | Node-backed edge opacity source. | No | Edge opacity comes from nodes instead of `edgeOpacities`. |
| `edgeEndpointSizes` | Per-edge endpoint-size pairs. | No | Endpoint size comes from edges instead of `edgeEndpointSizeSource`. |
| `edgeEndpointSizeSource` | Node-backed endpoint-size source. | No | Endpoint size comes from nodes instead of `edgeEndpointSizes`. |
| `edgeStates` | Per-edge state bitmasks. | No | Edge state styling is texture-backed. |
| `nodeStates` | Per-node state bitmasks for endpoint-aware edge styling. | No | Endpoint-state edge specialization is active. |

Total textures: min `2`, max `8`.

## WebGL Picking / Attribute Tracking: Nodes

Current node picking uses at most one tracked-value texture. It does not currently use `nodeEncoded` or `nodeTrackedFloat`.

| Texture | What | Core | Activates When |
| --- | --- | --- | --- |
| `nodePositions` | Packed node xyz positions. | Yes | Current sparse node picking path. |
| `nodeSizes` | Per-node size values. | No | Size-aware node picking is active. |
| `nodeOutlineWidths` | Per-node outline widths. | No | Outline-aware node picking is active. |
| `nodeStates` | Per-node state bitmasks. | No | State-aware node picking is active. |
| `nodeTrackedInt` | Integer tracked values. | No | Tracked node attribute mode is `int`. |
| `nodeTrackedUint` | Unsigned tracked values. | No | Tracked node attribute mode is `uint`. |

Total textures: min `1`, max `5`.

## WebGL Picking / Attribute Tracking: Edges

Current edge picking uses at most one tracked-value texture. It does not currently use `edgeEncoded` or `edgeTrackedFloat`.

| Texture | What | Core | Activates When |
| --- | --- | --- | --- |
| `nodePositions` | Packed node xyz positions for endpoints. | Yes | Current sparse edge picking path. |
| `edgeEndpoints` | Source and target node ids per edge. | Yes | Current sparse edge picking path. |
| `edgeWidths` | Per-edge width pairs. | No | Quad widths come from edges instead of `nodeWidthSource`. |
| `nodeWidthSource` | Node-backed edge width source. | No | Quad widths come from nodes instead of `edgeWidths`. |
| `edgeEndpointSizes` | Per-edge endpoint-size pairs. | No | Trim sizes come from edges instead of `nodeEndpointSizeSource`. |
| `nodeEndpointSizeSource` | Node-backed endpoint-size source. | No | Trim sizes come from nodes instead of `edgeEndpointSizes`. |
| `edgeStates` | Per-edge state bitmasks. | No | State-aware edge picking is active. |
| `nodeStates` | Per-node state bitmasks for endpoint-aware edge picking. | No | Endpoint-state edge picking is active. |
| `edgeTrackedInt` | Integer tracked values. | No | Tracked edge attribute mode is `int`. |
| `edgeTrackedUint` | Unsigned tracked values. | No | Tracked edge attribute mode is `uint`. |

Total textures: min `2`, max `7`.

## WebGL Density

| Texture | What | Core | Activates When |
| --- | --- | --- | --- |
| `nodeIndicesTex` | Maps splat instances to node ids. | Yes | WebGL density splat path. |
| `nodeWeightsTex` | Per-node density weights. | Yes | WebGL density splat path. |
| `fallbackPositionsTex` | Fallback packed node xyz positions. | No | Shared graph position texture is unavailable. |

Total textures: min `2`, max `3`.

## Texture Limit Summary

| Packing | Limit |
| --- | ---: |
| 1 texel / element | `T^2` elements |
| 2 texels / element | `floor(T^2 / 2)` elements |

## Texture Count Summary

| Section | Min | Max |
| --- | ---: | ---: |
| WebGL Graph Rendering: Nodes | 1 | 7 |
| WebGL Graph Rendering: Edges | 2 | 8 |
| WebGL Picking / Attribute Tracking: Nodes | 1 | 5 |
| WebGL Picking / Attribute Tracking: Edges | 2 | 7 |
| WebGL Density | 2 | 3 |

## GPU Layout Processing: WebGL

These tables describe the texture inputs used by the GPU-force layout texture-compute backend itself, not by graph rendering.

### Main Compute Pass

| Texture | What | Core | Activates When |
| --- | --- | --- | --- |
| `positionTextures[readIndex]` | Current node positions. | Yes | Always in GPU-force WebGL compute. |
| `velocityTextures[readIndex]` | Current node velocities. | Yes | Always. |
| `activeIdsTexture` | Active node ids used for sampling. | Yes | Always. |
| `activeMaskTexture` | Per-node active flags. | Yes | Always. |
| `neighborStartsTexture` | Per-node adjacency start offsets. | Yes | Always. |
| `neighborCountsTexture` | Per-node adjacency counts. | Yes | Always. |
| `neighborsTexture` | Flattened adjacency ids. | Yes | Always. |
| `componentGravityScaleTexture` | Per-node component gravity multiplier. | No | Non-UMAP GPU-force only; uploaded/fetched only when active component gravity is enabled. |
| `nodeMassTexture` | Per-node mass values. | No | UMAP force model is active. |
| `neighborWeightsTexture` | Per-neighbor UMAP weights. | No | UMAP force model is active. |
| `neighborEdgesTexture` | Original sparse edge id for each flattened neighbor slot. | No | Non-UMAP GPU-force uses weighted attraction or strength normalization. |
| `scalarValuesTexture` | Packed node strength values followed by sparse edge weights. | No | Non-UMAP GPU-force uses weighted attraction or strength normalization. |

Total textures: min `8`, max `10`.

### Reduction Passes

#### Reduction Init

| Texture | What | Core | Activates When |
| --- | --- | --- | --- |
| `positionTextures[writeIndex]` | Positions to reduce. | Yes | Recenter is enabled. |
| `activeMaskTexture` | Active-node mask for centroid reduction. | Yes | Recenter is enabled. |

Total textures: min `2`, max `2`.

#### Reduction Combine

| Texture | What | Core | Activates When |
| --- | --- | --- | --- |
| `reductionTarget.texture` | Previous reduction level input. | Yes | Recenter is enabled and reduction has multiple levels. |

Total textures: min `1`, max `1`.

### Recenter Pass

| Texture | What | Core | Activates When |
| --- | --- | --- | --- |
| `positionTextures[writeIndex]` | Newly computed positions. | Yes | Recenter is enabled. |
| `velocityTextures[writeIndex]` | Newly computed velocities. | Yes | Recenter is enabled. |
| `centroidTexture` | Reduced centroid texture from the reduction pass. | Yes | Recenter is enabled. |
| `activeMaskTexture` | Active-node mask. | Yes | Recenter is enabled. |

Total textures: min `4`, max `4`.

### Layout Summary: WebGL

| Section | Min | Max |
| --- | ---: | ---: |
| Layout Compute: Main | 7 | 9 |
| Layout Compute: Reduction Init | 2 | 2 |
| Layout Compute: Reduction Combine | 1 | 1 |
| Layout Compute: Recenter | 4 | 4 |

## GPU Layout Providers: WebGL

These are alternate GPU-side providers that can supply existing WebGL texture slots. They reuse the normal texture units, so they do not change the min/max counts above.

| Texture | What | Used By | Activates When |
| --- | --- | --- | --- |
| `positionTexture` | GPU-layout node positions for the active `nodePositions` slot. | Graph nodes, graph edges, picking nodes, picking edges. | Sparse nodes expose `positionTexture`. |
| `sourceWebGLTexture` | GPU-layout interpolation-source positions for `nodePositionsFrom`. | Graph nodes, graph edges. | Position interpolation is enabled and interpolation state exposes `sourceWebGLTexture`. |
| `shared.textures.nodePositions` | Shared active node positions consumed through graph sparse resources. | Density splat. | Graph shared sparse resources expose `nodePositions`. |
