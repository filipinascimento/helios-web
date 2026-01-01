# Visual States

Helios supports ultra-fast node/edge “states” by storing a single `u32` bitmask per node/edge and applying visual transforms in the shaders. This lets you toggle states (selected/highlighted/filtered/custom) without rewriting full visual attribute buffers.

## Attributes

Helios ensures the following visual attributes exist on the underlying `helios-network`:

- Nodes: `_helios_visuals_state` (`UnsignedInteger`, dimension `1`)
- Edges: `_helios_visuals_edge_state` (`UnsignedInteger`, dimension `1`)
- Edge endpoint node states: `_helios_visuals_edge_endpoints_state` (`UnsignedInteger`, dimension `2`) via node→edge mapping

The endpoint-state mapping is used so edge rendering can incorporate node-driven transforms (e.g. node size multiplier affecting edge endpoint trimming) without any extra per-edge CPU work.

## Built-in Bits

Helios exposes a convenience object with a few common bits:

- `Helios.STATES.FILTERED` (bit `0`)
- `Helios.STATES.SELECTED` (bit `1`)
- `Helios.STATES.HIGHLIGHTED` (bit `2`)

Custom bits can be added by your application by defining additional bit positions. By default, Helios compiles shaders with 4 styling slots (bits `0..3`), which leaves `bit 3` available as a “custom styled” bit if you want it.

## Mutating State

State updates are designed to be cheap (one `u32` write per item):

```js
helios.setNodeState([nodeId], Helios.STATES.HIGHLIGHTED, { mode: 'add' });
helios.setEdgeState([edgeId], Helios.STATES.SELECTED, { mode: 'add' });
```

Supported `mode` values:

- `replace` (default)
- `add` (bitwise OR)
- `remove` (bitwise AND NOT)
- `toggle` (bitwise XOR)

## Styling State in Shaders

Each state bit position maps to a “slot” (0..`stateSlots - 1`) that can apply transforms in the shaders.

By default, Helios uses 4 slots total (`0..3`): the three built-in bits plus one extra custom slot.

You can change the number of extra slots at construction time:

```js
const helios = new Helios(network, { extraStateSlots: 4 }); // total slots = 3 + 4 = 7
```

This affects shader compilation and cannot be changed after initialization.

Configure slots via:

```js
// Slot 2 (HIGHLIGHTED): boost size and tint green.
helios.setNodeStateStyle(2, {
  sizeMul: 1.3,
  opacityMul: 1.0,
  colorMul: [0, 0, 0, 1],
  colorAdd: [0, 1, 0, 0],
});

// Slot 1 (SELECTED): widen edges.
helios.setEdgeStateStyle(1, { widthMul: 2.0 });
```

Supported fields:

- Nodes: `sizeMul`, `opacityMul`, `outlineMul`, `colorMul`, `colorAdd`, `discard`
- Edges: `widthMul`, `opacityMul`, `colorMul`, `colorAdd`, `discard`

### Styling `NO_STATE`

You can also configure a style that applies when the state bitmask is `0` (no active bits):

```js
helios.setNodeNoStateStyle({ opacityMul: 0.25 });
helios.setEdgeNoStateStyle({ opacityMul: 0.25 });
```

This is useful for “dim everything unless highlighted” patterns (then highlight uses a normal state slot).

### `discard`

If `discard: true` is set on a style, matching nodes/edges are discarded in the fragment shader (not drawn at all):

```js
// Hide everything in NO_STATE (common for filtering).
helios.setNodeNoStateStyle({ discard: true });
helios.setEdgeNoStateStyle({ discard: true });
```

Performance notes:

- Overhead is small (a couple extra checks per vertex/fragment).
- If you discard a large fraction of items, it can be faster than drawing fully-transparent pixels (less blending work).
- Like any branch/discard, it can reduce some GPU optimizations depending on the GPU/driver and scene (measure if it matters).

You can reset all slots back to neutral transforms with:

```js
helios.resetStateStyles();
```
