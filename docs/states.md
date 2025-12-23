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

Custom bits can be added by your application by defining additional bit positions (recommended: start at bit `8`).

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

Each state bit position maps to a “slot” (0..7) that can apply transforms in the shaders. Configure slots via:

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

- Nodes: `sizeMul`, `opacityMul`, `outlineMul`, `colorMul`, `colorAdd`
- Edges: `widthMul`, `opacityMul`, `colorMul`, `colorAdd`

You can reset all slots back to neutral transforms with:

```js
helios.resetStateStyles();
```

