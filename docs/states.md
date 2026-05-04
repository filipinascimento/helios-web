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

`HOVER` is intentionally not listed here. It is a virtual hover overlay used by
normal pointer hover and does not occupy a bit, a state slot, or a
`helios-network` state-buffer value. `HIGHLIGHTED` is a real semantic/group
state for things like legend hover, search results, and filters.

Custom bits can be added by your application by defining additional bit positions. By default, Helios compiles shaders with 4 styling slots (bits `0..3`), which leaves `bit 3` available as a “custom styled” bit if you want it.

## Mutating State

State updates are designed to be cheap (one `u32` write per item):

```js
helios.nodeState([nodeId], 'HIGHLIGHTED', { mode: 'add' });
helios.edgeState([edgeId], 'SELECTED', { mode: 'add' });
```

Supported `mode` values:

- `replace` (default)
- `add` (bitwise OR)
- `remove` (bitwise AND NOT)
- `toggle` (bitwise XOR)

## Ephemeral Hover Overlays (No Buffer Writes)

For very large graphs, hover interactions can be made cheaper by applying a
single-item overlay in the shaders, without mutating the underlying
`helios-network` buffers:

```js
// Normal pointer hover: applies the virtual hover style, not a real bit.
helios.hoverNodeState(nodeId, 'HOVER');
helios.hoverEdgeState(edgeId, 'HOVER');

// Advanced compatibility path: apply a real state style virtually to one item.
helios.hoverNodeState(nodeId, 'HIGHLIGHTED');
helios.hoverEdgeState(edgeId, 'HIGHLIGHTED');

// Clear hover.
helios.hoverNodeState(null, 0);
helios.hoverEdgeState(null, 0);
```

Configure the virtual hover style separately from state slots:

```js
helios.nodeHoverStyle({ sizeMul: 1.35, outlineMul: 1.1 });
helios.edgeHoverStyle({ widthMul: 1.35, opacityMul: 50 });
```

By default, virtual `HOVER` and real `HIGHLIGHTED` use separate styles:
`HOVER` is for the single pointer-owned item, while `HIGHLIGHTED` is for
semantic/group emphasis. If you need legacy-style parity, opt in explicitly:

```js
helios.hoverStyleFromHighlight(true);
```

When that option is enabled, updates to the `HIGHLIGHTED` node or edge style are
copied into the corresponding virtual hover style. Because `HOVER` is virtual,
it does not affect density focus in the default `auto` density mode.

Connected edge propagation also follows this split: edges connected to the
single hovered node use the virtual edge hover style, while real highlighted
groups can opt into the `HIGHLIGHTED` edge state style with
`helios.highlightConnectedEdges(true)` or the Selection panel
`Connected Edges > Highlight` toggle. This group-highlight edge propagation is
disabled by default.

Ordinary virtual `HOVER` also does not apply the non-highlight/non-selected
"other elements" style by default. Real source-managed `HIGHLIGHTED` groups do.
Enable hover-driven dimming explicitly with the Selection panel
`Dim Others on Hover` toggle or `HoverBehavior` option
`hoverAffectsOtherElements: true`.

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
helios.nodeStateStyle('HIGHLIGHTED', {
  sizeMul: 1.3,
  opacityMul: 1.0,
  forceMaxAlpha: false,
  colorMul: [0, 0, 0, 1],
  colorAdd: [0, 1, 0, 0],
});

// Slot 1 (SELECTED): widen edges.
helios.edgeStateStyle('SELECTED', { widthMul: 2.0, forceMaxAlpha: true });
```

Supported fields:

- Nodes: `sizeMul`, `opacityMul`, `outlineMul`, `colorMul`, `colorAdd`, `discard`, `forceMaxAlpha`
- Edges: `widthMul`, `opacityMul`, `colorMul`, `colorAdd`, `discard`, `forceMaxAlpha`

### `forceMaxAlpha`

If `forceMaxAlpha: true` is enabled for any active node/edge state slot, normal alpha blending treats that item as fully opaque after style evaluation, and weighted edge transparency also gives it a strong accumulation boost so it can dominate dense overlaps more reliably. This is useful for making selected items stand out even when the base mapper or state multipliers would otherwise reduce alpha.

### Styling `NO_STATE`

You can also configure a style that applies when the state bitmask is `0` (no active bits):

```js
helios.nodeNoStateStyle({ opacityMul: 0.25 });
helios.edgeNoStateStyle({ opacityMul: 0.25 });
```

This is useful for “dim everything unless highlighted” patterns (then highlight uses a normal state slot).

### `discard`

If `discard: true` is set on a style, matching nodes/edges are discarded in the fragment shader (not drawn at all):

```js
// Hide everything in NO_STATE (common for filtering).
helios.nodeNoStateStyle({ discard: true });
helios.edgeNoStateStyle({ discard: true });
```

Performance notes:

- Overhead is small (a couple extra checks per vertex/fragment).
- If you discard a large fraction of items, it can be faster than drawing fully-transparent pixels (less blending work).
- Like any branch/discard, it can reduce some GPU optimizations depending on the GPU/driver and scene (measure if it matters).

You can reset all slots back to neutral transforms with:

```js
helios.resetStateStyles();
```
