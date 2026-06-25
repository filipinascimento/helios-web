# GPU Limits Reference (WebGPU + WebGL2 Indirect)

This note captures practical renderer limits for current Helios behavior.

## Scope

- Assumed WebGPU limits for this reference:
  - `maxStorageBufferBindingSize = 134217728` (128 MiB)
  - `maxBufferSize = 268435456` (256 MiB)
- In Helios WebGPU paths, storage buffers are validated against
  `maxStorageBufferBindingSize` per buffer binding.
- `maxBufferSize` is still per `GPUBuffer`, but it does not increase the
  per-storage-binding ceiling.

## WebGPU (Assumed 128 MiB / 256 MiB)

Let:

- `S = maxStorageBufferBindingSize = 134217728`

Then per-buffer ceilings are:

- `floor(S / 4)  = 33554432`
- `floor(S / 8)  = 16777216`
- `floor(S / 12) = 11184810`
- `floor(S / 16) = 8388608`
- `floor(S / 24) = 5592405`
- `floor(S / 32) = 4194304`

Using current payload sizes from `rendering-mode-requirements.md`:

### Nodes

- Positions (`12 * N`): `N <= 11184810`
- Colors (`16 * N`, varying): `N <= 8388608`
- Sizes (`4 * N`, varying): `N <= 33554432`
- States (`4 * N`): `N <= 33554432`

Practical node cap in the common varying-color case: `~8.39M`.

### Edges (Indirect)

- Indices (`4 * E`): `E <= 33554432`
- Endpoints (`8 * E`): `E <= 16777216`
- Colors (`32 * E`, varying): `E <= 4194304`
- Widths/opacities/endpointSizes (`8 * E`, varying): `E <= 16777216`
- States (`4 * E`): `E <= 33554432`

Practical indirect edge cap in the varying-color case: `~4.19M`.

## WebGL2 Indirect Limits

WebGL2 indirect packs linear channels into tiled 2D textures:

- `width = min(count, MAX_TEXTURE_SIZE)`
- `height = ceil(count / width)`
- Must satisfy `height <= MAX_TEXTURE_SIZE`

So for any one-texel-per-entity channel:

- `count <= MAX_TEXTURE_SIZE^2`

In indirect rendering:

- Node channels are effectively one texel per node for sizing limits:
  - `N <= MAX_TEXTURE_SIZE^2`
- Most edge channels are one texel per edge, but edge color start/end uses
  two texels per edge:
  - Worst-case (varying edge color): `E <= floor(MAX_TEXTURE_SIZE^2 / 2)`
  - If edge color is fully uniform and no two-texel edge channel is active:
    `E <= MAX_TEXTURE_SIZE^2`

### Common `MAX_TEXTURE_SIZE` Examples

| MAX_TEXTURE_SIZE (`T`) | `T^2` (one-texel cap) | `floor(T^2 / 2)` (two-texel cap) |
| --- | ---: | ---: |
| 2048 | 4194304 | 2097152 |
| 4096 | 16777216 | 8388608 |
| 8192 | 67108864 | 33554432 |
| 16384 | 268435456 | 134217728 |
| 32768 | 1073741824 | 536870912 |

## Important Caveat

All values above are per-resource ceilings. Real-world maxima can be lower due
to total GPU memory pressure, concurrent buffers/textures, and driver behavior.
