# Component-aware GPU force layout plan

This note plans a practical fix for GPU force layouts where isolated nodes and
small disconnected components collapse into one distant region instead of
forming a scattered halo around the main connected component.

The short version: component-to-component repulsion is the right mental model,
but the first implementation should avoid a full per-frame component solver. We
can get most of the desired behavior by computing active connected components
when topology changes, then using those labels for component-aware seeding and
size-weighted gravity. If that is not enough, add an experimental supernode
repulsion pass.

## Problem

The current linear GPU force model is node-centric:

- sampled/global node repulsion
- spring attraction along active edges
- one uniform gravity force toward `center`

That works for the main component but gives disconnected components no explicit
spatial objective relative to each other. For singleton-heavy graphs, random
sampling plus uniform gravity can produce correlated drift: many tiny components
are pulled into the same off-center basin while the main component dominates the
visual footprint.

The desired behavior is different:

- the largest/main component should stay near the layout center
- smaller components should distribute around it
- singletons should behave like a low-density halo rather than a separate clump
- `render+layout` filters must be honored, so components are computed over the
  active layout graph, not the full graph
- the large-graph path must remain fast at 500k nodes and above

## Current code facts

Relevant files:

- `src/delegates/GpuForcePositionDelegate.js`
- `src/layouts/GpuForceLayout.js`
- `docs/gpu-force-layout.md`
- `docs/webgpu-storage-buffers.md`

The important implementation detail is that `buildTopologyPayload()` already
builds an active-only topology:

- `activeIds`
- `activeMask`
- `neighborStarts`
- `neighborCounts`
- `neighbors`

Those arrays are built from `network.nodeIndices` and `network.edgeIndices`.
When a `render+layout` filter is active, `Helios` swaps the layout network to a
filtered proxy, so the GPU layout delegate already sees the filtered active
graph. This means component labeling can be done inside the GPU layout delegate
without querying the full graph.

`helios-network-v2` already has connected-component APIs, but direct use through
the filtered network proxy needs care because generic method calls may bind back
to the base network. For this layout-specific feature, the safer first version
is to compute labels from the active topology already prepared by
`GpuForcePositionDelegate`.

## Core idea

Treat connected components as layout-scale objects for coarse placement, while
keeping node-node and edge forces inside each component.

Use a ladder of strategies:

1. Active component detection on topology/filter changes.
2. Component-aware initial placement.
3. Component-size gravity, so the main component is centered more strongly than
   tiny components.
4. Optional component halo force, still cheap and GPU-friendly.
5. Optional true component-to-component supernode repulsion if metrics show the
   cheaper strategy is insufficient.

This preserves the existing node-level force model and adds component structure
only where it helps.

## Phase 0 - Reproducible investigation harness

Before changing defaults, add a repeatable benchmark/visual-metric harness. It
should be possible to run it without opening the full app.

Synthetic cases:

- `lollipop_with_isolates`: one dense main component, a path tail, many
  singletons
- `barbell_many_pairs`: two dense subgraphs connected by a bridge, plus many
  2-node components
- `star_paths_isolates`: high-degree hub, long path components, singletons
- `filtered_shattered`: one graph that becomes many components only after an
  active `render+layout` filter removes bridge nodes/edges
- `grid_with_holes`: regular graph with filtered holes that split regions
- `rings_and_chains`: several medium components with very different shapes
- `directed_asymmetric`: directed-looking input treated as weak components for
  layout placement

Metrics:

- largest component centroid distance from `center`
- small-component angular uniformity around the largest component
- Rayleigh resultant length for singleton angles, where lower is more uniform
- radial spread of small components
- minimum inter-component centroid distance normalized by component radius
- number of visual collisions between component bounding circles
- final layout bounding radius and camera-fit stability
- per-frame layout time
- topology sync/component labeling time
- GPU buffer/texture memory added by the feature

Large cases:

- 100k active nodes
- 250k active nodes
- 500k active nodes
- 1M active nodes when feasible

Use several component distributions, not only one:

- one giant component plus many singletons
- one giant component plus many pairs
- 10 to 100 medium components
- all singletons
- filtered graph where a previously connected graph splits into many pieces

Early scratch testing suggests a JS union-find pass over active topology is in
the right performance range for topology-time work: tens of milliseconds around
500k nodes / 1M edges on this machine. That result must be turned into a repo
benchmark before using it as a claim.

## Phase 1 - Active component labeling

Add a component-labeling helper near the topology build path:

- input: `activeIds`, `activeMask`, active edges, `edgesView`, `nodeCapacity`
- output:
  - `componentIds[nodeId]`
  - `componentSizes[componentId]`
  - `componentRanks[componentId]`, sorted largest first
  - `nodeComponentRank[nodeId]`
  - `nodeComponentSize[nodeId]`
  - `componentCount`
  - `largestComponentId`

Default semantics:

- weak connected components
- only active nodes participate
- active isolated nodes are singleton components
- inactive nodes get sentinel metadata and must not affect layout

Implementation notes:

- Use union-find over the active edge list first.
- Avoid allocating fresh large arrays every topology sync; use the existing
  scratch-object pattern.
- Invalidate component metadata when topology versions, active index versions,
  active counts, edge strength mode, or filter topology changes.
- Keep this computation outside the per-frame layout loop.
- If component computation is delayed or disabled, run the current layout path
  unchanged.

Feasibility check:

- Compare the delegate-local union-find with a `helios-network-v2` session
  implementation.
- Do not use `network.measureConnectedComponents()` through the filtered proxy
  until the proxy has an explicit selector-aware path or a dedicated active-view
  API.
- If `helios-network-v2` becomes the final owner, expose an API that accepts the
  current active node/edge selectors or runs on the active filtered view safely.

## Phase 2 - Component-aware seeding

Seed components into stable coarse positions when the layout is initialized or
when a filter/topology change forces a new layout placement.

Recommended behavior:

- largest component starts near `center`
- small components are assigned deterministic golden-angle anchors around the
  largest component
- ring radius depends on:
  - main component estimated radius
  - component rank
  - component size
  - total active count
  - existing `radius`/`outputScale`
- singleton and pair components receive small deterministic jitter around their
  anchor
- medium components get a compact local seed around their own anchor
- preserve explicit user-provided positions when the current options say to use
  initial positions

This alone may solve much of the clumping because disconnected components will
not all start in the same random square near the center.

Important constraints:

- use deterministic hashing by component id and node id, not `Math.random()`,
  where stable re-runs matter
- only reseed when layout initialization semantics allow it
- keep 2D and 3D behavior explicit; in 3D, use shallow shell placement unless
  the layout is configured for meaningful depth

## Phase 3 - Size-weighted gravity

Uniform gravity pulls every node to the same center with the same coefficient.
For disconnected components that is too blunt. It can pull tiny components into
the main component or into a shared off-center basin.

Add component-aware gravity scale:

- main component: stronger center gravity
- medium components: moderate center gravity
- small components/singletons: weaker center gravity
- optional radial band force: weakly maintain a preferred halo radius for small
  components, instead of pulling them all to the exact center

Possible formula:

```text
rank = component rank by descending size
sizeRatio = componentSize / activeNodeCount
mainBoost = componentId == largestComponentId ? mainGravityScale : 1
smallDamping = mix(singletonGravityScale, 1, smoothstep(sizeRatio))
gravityScale = baseGravity * mainBoost * smallDamping
```

For the shader, this means adding one per-node scalar or compact metadata value:

- WebGPU: `componentGravityScaleBuffer` or packed node-layout metadata buffer
- WebGL2: `componentGravityScaleTexture` or packed data texture channel

If a new storage buffer or texture-backed data resource is added, update
`docs/webgpu-storage-buffers.md` in the same implementation change.

Expected result:

- main component remains close to center
- small components are not over-centered
- existing sampled node repulsion has room to scatter the halo
- no per-frame CPU readback

## Phase 4 - Component halo force

If seeding plus weighted gravity still leaves visible clumping, add a cheap halo
force using static component anchors.

For each node:

- fetch its component rank/anchor
- if it is in the main component, apply normal gravity
- if it is in a smaller component, apply:
  - weak attraction to that component's halo anchor
  - weak repulsion from the main center or main component radius
  - normal internal edge springs
  - normal sampled node repulsion

This is not full component-to-component repulsion, but it gives each component a
coarse target that prevents all tiny components from sharing one basin.

Data options:

- per-node anchor position: simplest shader path, more memory
- per-component anchor table plus per-node component id: less memory, requires
  component-id fetch and component table fetch
- computed anchor from `componentRank` and constants: least memory, less
  flexible

Start with the smallest data shape that works in both WebGPU and WebGL2. A
per-node scalar gravity scale is likely Phase 3; anchors can be added only after
metrics show they are needed.

## Phase 5 - True component-to-component repulsion

Conceptually, component-to-component repulsion is attractive:

- every connected component is a supernode
- component supernodes repel each other
- each component has an approximate radius/mass
- node-level forces continue inside the component

But a real per-frame component solver is more expensive than it looks.

Avoid in v1:

- CPU readback of node positions every frame to compute centroids
- CPU-side centroid updates in the hot loop
- GPU readback used only for component placement

Hard parts:

- component centroids and radii change during simulation
- WebGPU does not give us a simple portable float atomic centroid accumulation
  path
- reduction passes by component add buffers, dispatches, bind groups, and
  complexity
- WebGL2 support would need a different texture/reduction path

Prototype only after Phase 3/4 metrics:

1. Topology-time component supernodes:
   - estimate component radius from size/degree/topology
   - place supernodes by deterministic force simulation on CPU
   - seed/anchor nodes from the supernode solution

2. Low-frequency CPU refinement:
   - sample positions every 0.5 to 2 seconds or only while paused
   - update supernode anchors outside the frame-critical path
   - never block visible frames for centroid readback

3. GPU supernode pass:
   - maintain component centroid/radius buffers on GPU
   - run reduction passes at low cadence
   - run component repulsion on `componentCount`, not `nodeCount`
   - apply component-level correction to nodes

This phase should remain behind an experimental option until it proves both
visual value and performance stability.

## Public options

Candidate options for `GpuForceLayout`:

```js
{
  componentForces: 'auto', // 'off' | 'auto' | 'halo' | 'supernode-experimental'
  componentMode: 'weak',
  componentSeeding: false, // opt-in only; force toggles must preserve positions
  componentGravity: true,
  componentMainGravityScale: 1.5,
  componentSingletonGravityScale: 0.25,
  componentHaloStrength: 0.05,
  componentHaloRadiusScale: 1.0,
  componentMetadataMaxSyncMs: 16
}
```

Default recommendation:

- implement behind `componentForces: 'auto'`
- keep `off` as an explicit escape hatch
- make `auto` conservative: activate halo seeding/gravity only when a largest
  component is clearly dominant; for all-singleton, all-pair, or equal-size
  component fields, compute labels but leave placement/gravity off unless the
  caller opts into `componentForces: 'halo'`
- start with conservative values that affect disconnected graphs but do little
  on one-component graphs
- do not expose every tuning knob until we know which ones are necessary

If these become public API, update source JSDoc/type metadata and regenerate
declarations. Do not hand-edit `src/index.d.ts`.

## Caching and throttling

Component metadata should be computed on topology/filter changes, not every
frame.

Cache key inputs:

- node topology version
- edge topology version
- active node index version/count
- active edge index version/count
- force model mode if it changes edge inclusion semantics
- edge weight/strength attribute versions if zero or filtered weights can remove
  effective edges

Throttle rules:

- for small/medium graphs, compute synchronously during topology payload build
- for very large active graphs, budget the computation and allow one frame of
  old/default behavior if necessary
- if computation exceeds `componentMetadataMaxSyncMs`, split into chunks or
  defer to the next layout reheat
- never allocate new large arrays during a frame after GPU views have been
  captured

Because `GpuForcePositionDelegate` already rebuilds adjacency from active
topology, component labeling can share that pass or run immediately after it.
The goal is one topology-time traversal, not a second graph read.

## Performance requirements

No regression targets:

- `componentForces: 'off'` must preserve current behavior and timing
- one-component graphs should have near-zero per-frame overhead
- cached component metadata must not add per-frame CPU work
- no CPU-GPU position readback in the normal frame loop
- WebGPU and WebGL2 must both have bounded additional resources
- 500k active nodes must not see a meaningful per-frame layout slowdown

Suggested acceptance thresholds:

- component labeling for 500k nodes / 1M edges: target under 50 ms on a modern
  desktop, with chunking if it exceeds a frame budget
- extra per-node metadata memory: keep to one `float32` or one `uint32` per node
  for the first implementation
- per-frame shader overhead: one extra scalar multiply in Phase 3
- no additional dispatch pass in Phase 3
- Phase 4 can add one anchor fetch only if visual metrics justify it

## Optimization opportunities

Component metadata can improve performance later:

- skip expensive inter-node repulsion among tiny disconnected components and
  replace it with component-level approximations
- exact-place singleton and pair components with cheaper rules
- sample components first, then nodes within selected components
- use component radius to avoid wasting samples on far-away tiny components
- reduce warmup iterations for components whose internal topology is trivial
- choose different force scheduling for all-singleton graphs

The main optimization idea is to stop treating a million singleton nodes like a
normal connected graph when the topology says they are independent layout
objects.

## Test plan

Unit tests:

- active component labels are correct for unfiltered graphs
- active component labels are correct for `render+layout` filtered graphs
- filtering bridge nodes splits a component
- filtering bridge edges splits a component
- isolated active nodes become singleton components
- inactive nodes do not create components
- directed/asymmetric edge input is treated as weakly connected for layout
- component cache invalidates on active index and topology changes
- component cache does not invalidate on unrelated style changes
- explicit initial positions are preserved when options require that
- `componentForces: 'off'` does not upload new component resources

GPU/backend tests:

- WebGPU shader accepts the new metadata buffer when enabled
- WebGL2 shader accepts the matching texture path when enabled
- one-component graphs match old gravity behavior within tolerance
- singleton-heavy graphs have better angular uniformity than baseline
- no blank frames, NaNs, or exploding bounds

Performance tests:

- topology sync timing at 100k, 250k, 500k, and 1M active nodes
- per-frame layout timing before/after with component features off
- per-frame layout timing before/after with Phase 3 enabled
- memory usage of added buffers/textures
- repeated filter toggles to catch stale metadata and allocation churn
- headed WebGPU verification for GPU-specific performance claims

Real scenario checks:

- existing docs/demo graphs
- available local `.xnet` datasets
- a large real graph around 500k nodes if available in the workspace
- a real filtered workflow where `render+layout` removes bridge nodes/edges

Suggested commands after implementation:

```sh
node --test tests/gpuForceLayout.test.js
node --test tests/layoutBehavior.test.js
npm test
npm run build
npm run test:e2e
npm run test:e2e:webgpu
```

Add a focused benchmark command for the large synthetic cases instead of hiding
500k-node checks inside normal unit tests.

## Rollout plan

1. Add the benchmark harness and visual metrics.
2. Add active component labeling inside the topology payload path, disabled by
   default except tests.
3. Add component-aware seeding behind an internal option.
4. Add component gravity metadata and shader support behind
   `componentForces: 'auto'`.
5. Compare baseline vs component-aware layouts on synthetic and real graphs.
6. If metrics pass, document the behavior and make `auto` the default.
7. If metrics fail, prototype the halo anchor force.
8. Only if halo still fails, prototype supernode component-to-component
   repulsion.

## Recommended first implementation

Start with:

- active-only connected components in `GpuForcePositionDelegate`
- deterministic component-aware seeding
- one per-node component gravity scale
- no per-frame component centroid readback
- no extra compute dispatch
- `componentForces: 'auto'` plus `off`

This directly addresses the observed failure mode and keeps the hot loop almost
unchanged. It also creates the metadata needed for a true component-to-component
repulsion solver later, if the simpler approach is not enough.
