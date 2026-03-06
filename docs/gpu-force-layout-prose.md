# Methodology: WebGPU Force Layout in Helios Web Next

This document presents the GPU force layout as a methodology section, aligned with the current implementation in `src/layouts/GpuForceLayout.js` and `src/delegates/GpuForcePositionDelegate.js`. The layout is implemented as a position-delegate system in which simulation state is advanced on WebGPU compute buffers and consumed directly by the renderer, thereby minimizing CPU-GPU transfer in the steady state.

## 1. System Model and Design Objective

The layout problem is posed on an active graph $G = (V, E)$, where $|V| = A$ is the active-node cardinality and $|V_{cap}| = N$ is the node-capacity domain addressed by buffers. The system objective is to iteratively estimate node positions $x_i \in \mathbb{R}^3$ that satisfy a force equilibrium under three terms: sampled repulsion, local spring attraction, and gravity toward a user-defined center. The implementation must support both 2D and 3D simulation while remaining compatible with indirect rendering and sparse active sets.

Architecturally, the method separates two phases. First, topology compilation runs on CPU because adjacency extraction depends on network index views. Second, dynamics integration runs on GPU as a per-node compute kernel. This decomposition preserves flexibility in topology handling while keeping the dominant per-tick arithmetic in parallel compute.

## 2. Topology Compilation and Initialization

Given `nodeIndices`, `edgeIndices`, `edgesView`, and optional seeded positions, the method constructs an active mask and CSR-like adjacency storage (`neighborStarts`, `neighborCounts`, `neighbors`). For each valid undirected edge $(u, v)$ among active nodes, degree counts are accumulated symmetrically, prefix offsets are formed, and packed neighbor slots are filled in a second pass.

The active set is defined as:

$$
\text{activeIds}[k] = \text{nodeIndices}[k], \quad
\text{activeMask}[i] \in \{0,1\}.
$$

When explicit indices are absent, all nodes in $[0, N-1]$ are treated as active.

Adjacency offsets follow:

$$
\text{neighborStarts}[0] = 0, \quad
\text{neighborStarts}[i] = \sum_{k=0}^{i-1} \text{neighborCounts}[k].
$$

The packed neighbor length is:

$$
L = \sum_{i=0}^{N-1} \text{neighborCounts}[i].
$$

Seed initialization uses network positions when finite; otherwise a deterministic center-relative low-discrepancy fallback is used so startup is reproducible and already centered. Let $c=(c_x,c_y,c_z)$, horizontal extents $(w, h)$, and depth $d$:

$$
x_{fallback} = c_x + 0.35\,w\,\rho_i \cos(\theta_i),\;
y_{fallback} = c_y + 0.35\,h\,\rho_i \sin(\theta_i),
$$

with $\theta_i = i \varphi$ and $\varphi = \pi(3-\sqrt{5})$. In 2D, $\rho_i = \sqrt{(i + 0.5)/A}$ and $z_{fallback}=c_z$. In 3D, the same angular progression is combined with a Fibonacci-sphere axial term:

$$
z_{fallback} = c_z + 0.35\,d\,\left(1 - 2\frac{i+0.5}{A}\right).
$$

After seeding the affected nodes, the initialized subset is translated so its centroid matches the configured center.

To decouple simulation scale from visual scale, initialization uses two buffers: simulation-space `packedPositions` and render-space `packedOutputPositions`. For `outputScale = s`:

$$
x^{out}_{seed} = x_{seed},
\quad
x^{sim}_{seed} =
\begin{cases}
c + (x_{seed}-c)/s & s \neq 1\\
x_{seed} & s = 1.
\end{cases}
$$

This prevents first-frame discontinuities when non-unit output scaling is enabled.

## 3. Temporal Control and Annealing

At each tick, elapsed wall time `deltaMs` is converted into bounded integration time:

$$
dt_{ms} = \max(1, \text{deltaMs}),
\quad
dt = \text{clamp}(0.001 \cdot dt_{ms}, 0.008, 0.08),
\quad
dt_{scale} = 60 \cdot dt.
$$

The cooling variable $\alpha$ evolves as:

$$
\alpha \leftarrow \alpha + (\alpha_{target} - \alpha)\alpha_{decay},\quad
\alpha \leftarrow \max(\alpha,\alpha_{min}).
$$

Force coefficients are scaled before upload:

$$
k'_r = \alpha k_r,\;
k'_a = \alpha k_a,\;
k'_g = \alpha k_g,\;
\eta' = \eta \, dt_{scale},\;
\Delta_{max}' = \Delta_{max}\, dt_{scale}.
$$

Repulsion sample count is chosen from explicit `sampleCount` when finite, otherwise from mode-specific defaults (`sampleCount2D` or `sampleCount3D`). When the active set is no larger than the sample budget, or no larger than the small-graph exact-repulsion threshold, the implementation switches to exact all-pairs repulsion rather than hashed sampling, removing small-graph sampling bias.

## 4. GPU Force Formulation

For each node $i$, the compute kernel applies early exits for out-of-range and inactive nodes. Inactive nodes are copied through unchanged. In 2D mode, $z$-position is fixed to center and $z$-velocity is zeroed each step.

The total force is:

$$
F_i = F^{rep}_i + F^{spr}_i + F^{grav}_i.
$$

Distance regularization uses:

$$
d_{min} = \max(10^{-5}, \text{minDistance}),\quad
d^2 = \max(\| \delta \|^2, d_{min}^2).
$$

### 4.1 Deterministic sampled repulsion

Neighbor sampling is active-set indexed with a deterministic hash:

$$
j_s = \text{activeIds}\Big(
\text{hash32}(seed + i\cdot 2654435761 + s\cdot 747796405) \bmod A
\Big).

If $A \le S$ for sample budget $S$, the method instead enumerates all active nodes exactly once, so the repulsion term becomes deterministic all-pairs repulsion on the active set.
$$

The hash mixer corresponds exactly to the shader sequence:

$$
x \leftarrow x \oplus (x \gg 16),\;
x \leftarrow x \cdot 0x7feb352d,\;
x \leftarrow x \oplus (x \gg 15),\;
x \leftarrow x \cdot 0x846ca68b,\;
x \leftarrow x \oplus (x \gg 16).
$$

With $S=$ sample count and normalization

$$
\nu = \max\left(1,\frac{A}{\max(1,S)}\right),
$$

the sampled repulsion term is:

$$
F^{rep}_i = \sum_{s=1}^{S}
\mathbf{1}[j_s \neq i]\,
\left(
\delta_{ij_s}\; k'_r\; \nu\; d^{-3}
\right),
\quad
\delta_{ij_s} = x_i - x_{j_s}.
$$

In 2D mode, $(\delta_{ij_s})_z = 0$.

### 4.2 Degree-normalized spring attraction

For node $i$, let $deg_i$ be its adjacency count and $L_i = \min(deg_i, \text{maxNeighborsPerNode})$. For each retained neighbor $j$:

$$
\delta_{ji} = x_j - x_i,\quad
\ell = \sqrt{\max(\|\delta_{ji}\|^2, d_{min}^2)},\quad
\text{stretch} = \ell - d_{link}.
$$

Using $q_i = \max(1, L_i)$, spring contribution is:

$$
F^{spr}_i =
\sum_{j \in \mathcal{N}_i^{(L_i)}}
\delta_{ji}
\left(
\frac{k'_a \cdot \text{stretch}}{\ell \cdot q_i}
\right).
$$

In 2D mode, $(\delta_{ji})_z = 0$.

### 4.3 Center gravity

$$
F^{grav}_i = k'_g (c - x_i),
$$

with $z$-component suppressed in 2D mode.

### 4.4 Velocity integration and step limiting

The implementation uses damped explicit integration:

$$
v_i^{t+1} = \beta v_i^t + \eta' F_i,
$$

where $\beta =$ `damping`.

Velocity norm is capped to `maxStep` (after temporal scaling):

$$
m = \max(10^{-5}, \Delta'_{max}),\quad
v_i^{t+1} \leftarrow
\begin{cases}
v_i^{t+1}\, m/\|v_i^{t+1}\| & \|v_i^{t+1}\| > m\\
v_i^{t+1} & \text{otherwise}.
\end{cases}
$$

Position update:

$$
x_i^{t+1} = x_i^t + v_i^{t+1}.
$$

In 2D mode:

$$
(v_i^{t+1})_z = 0,\quad (x_i^{t+1})_z = c_z.
$$

## 5. Output-Space Projection

The solver state remains in simulation space. After each force pass, scratch buffers are copied into persistent position/velocity buffers, then output positions are produced either by direct copy or by a scale transform:

$$
x^{out}_i =
\begin{cases}
x^{sim}_i & |s-1| \le 10^{-6}\\
c + s(x^{sim}_i - c) & \text{otherwise}.
\end{cases}
$$

In 2D output mode, $z^{out}_i = c_z$.

The compute dispatch is:

$$
\text{workgroups} = \left\lceil \frac{N}{64} \right\rceil.
$$

## 6. Algorithmic Summary

Algorithm 1 describes topology synchronization.

```text
Algorithm 1: Topology synchronization and GPU upload
Input: network buffers, layout options, backend device
Output: synchronized compute buffers

1: Read topology snapshot (nodeIndices, edgeIndices, edgesView, nodeCapacity)
2: if backend is not WebGPU then
3:    dispose compute backend; cache counts; return
4: end if
5: Recreate backend if device changed
6: if topology unchanged and position buffer already valid then return
7: Acquire node position attribute view (withBufferAccess when available)
8: Build active mask, CSR adjacency, simulation/output seeds
9: Upload payload arrays into storage buffers
10: Zero velocity and scratch-velocity buffers
11: Rebuild force and output-scale bind groups
12: Reset alpha if configured
```

Algorithm 2 describes one simulation tick.

```text
Algorithm 2: One GPU force-layout tick
Input: deltaMs, options, synchronized backend
Output: updated output position buffer

1: Compute dt and dtScale from deltaMs with bounds
2: Update alpha by decay rule and alphaMin floor
3: Select sampleCount (explicit or mode default)
4: Assemble uniform parameters (forces, damping, limits, center)
5: Dispatch force compute pass over nodeCapacity
6: Copy scratchPosition -> position, scratchVelocity -> velocity
7: if outputScale approximately equals 1 then
8:    copy position -> outputPosition
9: else
10:   dispatch output-scale compute pass
11: end if
12: Submit command buffer; bump delegate version
```

## 7. Parameterization

Table 1 lists current defaults from the implementation.

| Parameter | Default | Role in the Method |
| --- | ---: | --- |
| `mode` | `2d` | Selects planar or volumetric dynamics and z-handling behavior. |
| `center` | `[0,0,0]` | Equilibrium center for gravity and 2D z-constraint. |
| `radius` | `220` | XY fallback seed spread during initialization. |
| `depth` | `140` | Z fallback seed spread in 3D initialization. |
| `sampleCount` | `null` | Explicit repulsion sample override when finite. |
| `sampleCount2D` | `64` | Default repulsion samples in 2D. |
| `sampleCount3D` | `96` | Default repulsion samples in 3D. |
| `maxNeighborsPerNode` | `64` | Spring-neighbor truncation per node. |
| `outputScale` | `6` | Simulation-to-render scale factor around `center`. |
| `linkDistance` | `1` | Zero-stretch spring distance. |
| `kRepulsion` | `0.07` | Base repulsion coefficient before alpha scaling. |
| `kAttraction` | `0.62` | Base spring coefficient before alpha scaling. |
| `kGravity` | `0.00035` | Base center-gravity coefficient before alpha scaling. |
| `eta` | `0.04` | Force-to-velocity gain before `dtScale`. |
| `damping` | `0.92` | Velocity persistence factor. |
| `maxStep` | `2.5` | Velocity magnitude cap before `dtScale`. |
| `minDistance` | `0.15` | Distance floor preventing singular forces. |
| `alpha` | `1` | Initial cooling multiplier. |
| `alphaDecay` | `0.001` | Per-tick decay toward `alphaTarget`. |
| `alphaTarget` | `0` | Cooling asymptote. |
| `alphaMin` | `0.001` | Lower bound on cooling factor. |
| `resetAlphaOnTopologyChange` | `true` | Resets alpha to initial value after topology rebuild. |

## 8. Implementation Notes

The `recenter` flag is currently encoded in uniforms but not consumed by the WGSL force equations. Inactive nodes are preserved by copy-through semantics and do not participate in force accumulation. CPU readback is not part of the standard render path; it occurs only through explicit snapshot/synchronization APIs.
