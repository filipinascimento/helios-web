# UMAP Two-Pass GPU Layout Plan (WebGPU + WebGL2)

This document proposes a practical path to support UMAP-style optimization in Helios using the existing layout delegate model, while keeping the first pass (graph construction) external and reusable.

The implementation target is:

- Pass 1 (offline/precompute): build a weighted graph from high-dimensional data.
- Pass 2 (interactive/runtime): optimize low-dimensional positions with attractive + repulsive forces, with live parameter controls.

---

## 1) Goals

- Add a new UMAP-oriented layout mode that runs in the same architecture as the current GPU-force layout (delegate-owned positions).
- Start with a **fixed precomputed graph** and expose **second-pass parameters** interactively.
- Support both rendering backends:
  - WebGPU preferred.
  - WebGL2 fallback.
- Define a persistence contract so Python preprocessing can write `.bxnet` / `.zxnet` that Helios can consume directly.

## 2) Non-goals (MVP)

- Recomputing nearest neighbors in-browser.
- Changing metric at runtime (`euclidean` -> `cosine`, etc.) without original embedding.
- Full parity with `umap-learn` internals for every edge case from day one.

---

## 3) Pass-1 vs Pass-2 Model

### Pass 1 (precompute, Python)

From high-dimensional input `X`, compute:

- Weighted graph edges (UMAP fuzzy memberships).
- Optional node-local terms (`rho`, `sigma`).
- Optional initialization positions.
- Graph-level metadata (`a`, `b`, and optimization defaults).

This is persisted to `.bxnet` / `.zxnet`.

### Pass 2 (runtime, Helios layout delegate)

Given the precomputed graph:

- Optimize low-dimensional positions with attraction + repulsion.
- Update positions each frame/tick.
- Expose interactive controls for second-pass hyperparameters without rebuilding graph.

---

## 4) Parameters: Runtime-Tunable vs Requires Precompute Rebuild

### Runtime-tunable (no pass-1 rebuild)

- `learning_rate`
- `repulsion_strength`
- `negative_sample_rate`
- `n_epochs` (or iteration budget)
- damping / momentum / schedule controls
- `a`, `b` (if treated as low-D curve controls in pass 2)
- restart/reseed initialization from existing graph

### Requires pass-1 rebuild (MVP)

- `n_neighbors` (unless richer data is stored; see Phase 2)
- metric and metric kwargs
- local connectivity / set-op mixing settings that define fuzzy graph construction

---

## 5) Data Contract for `.bxnet` / `.zxnet`

### Required (MVP)

#### Edge attributes

- `umap_weight` (`Double`, dim=1): fuzzy membership weight for attraction.

#### Graph attributes

- `umap_a` (`Double`, dim=1)
- `umap_b` (`Double`, dim=1)
- `umap_learning_rate` (`Double`, dim=1)
- `umap_repulsion_strength` (`Double`, dim=1)
- `umap_negative_sample_rate` (`Integer`, dim=1)
- `umap_n_epochs` (`Integer`, dim=1)
- `umap_seed` (`Integer`, dim=1)
- `umap_n_neighbors` (`Integer`, dim=1) as provenance

#### Optional node attributes

- `umap_sigma` (`Double`, dim=1)
- `umap_rho` (`Double`, dim=1)
- `_helios_visuals_position` (`Float`, dim=3) as initial embedding seed

### Recommended naming note

Prefix all UMAP metadata with `umap_` to keep schema discoverable in UI and tooling.

---

## 6) Runtime Architecture in Helios

### Proposed layout type

- `layout: { type: 'umap-force', options: { ... } }`

Can internally reuse large parts of `GpuForcePositionDelegate` plumbing:

- delegate lifecycle
- topology sync
- position resource exposure (`WebGPUBuffer` / `WebGL texture`)
- snapshot/sync APIs

### Backends

- WebGPU:
  - Compute path for force accumulation and integration.
- WebGL2:
  - Fallback path aligned with same equations and controls.
  - Can start as CPU-step + texture upload (already proven in current delegate pattern), then evolve.

### Equations (conceptual)

- Attraction term uses `umap_weight` per edge.
- Repulsion uses sampled negatives (or equivalent approximation).
- Integrate with learning rate and stability guards.

---

## 7) UI/Control Surface (MVP)

Expose in layout panel when `layout.type === 'umap-force'`:

- `learning_rate`
- `repulsion_strength`
- `negative_sample_rate`
- `n_epochs` or `steps_per_frame`
- `a`
- `b`
- reset/restart button (preserve graph, reinitialize positions)

Do not expose pass-1 controls as live sliders in MVP unless clearly marked "requires rebuild".

---

## 8) Phase Plan

## Phase 0: Schema + Loader Contract

- Lock required attribute names and types.
- Add loader checks and clear runtime errors for missing fields.
- Document how to export from Python.

## Phase 1: Basic UMAP Runtime Layout (fixed precompute)

- Add `umap-force` layout/delegate.
- Use precomputed `umap_weight` edges and graph hyperparameters.
- Support live second-pass tuning only.
- Add tests:
  - unit: schema validation and stepping behavior
  - e2e: WebGPU + WebGL2 smoke (layout converges, positions update, delegate resources active)

## Phase 2: Optional richer storage for more dynamic controls

- Add optional "rich precompute payload" (see below) to allow limited dynamic prepass-like changes (for example lower `k`).
- Keep this opt-in to avoid bloating default files.

---

## 9) Optional Rich Storage (Future)

To support dynamic `k` reduction without recomputing nearest neighbors from raw embeddings, store a max-K directed neighbor structure:

- `knn_rank` (`Integer`, dim=1) on directed edges
- `knn_distance` (`Double`, dim=1) on directed edges
- `knn_kmax` (`Integer`, dim=1) graph attribute
- metric provenance attributes (`umap_metric_id`, etc.)

With this, runtime can:

1. filter neighbors by `rank <= k`,
2. recompute local fuzzy memberships (`rho`, `sigma`, directed probs),
3. symmetrize,
4. continue second-pass optimization.

Limitations remain:

- cannot change metric without original data,
- cannot increase above stored `kmax`,
- quality depends on neighbor quality in precompute.

---

## 10) Python Example A (MVP: fixed precompute + interactive second pass)

```python
import numpy as np
from scipy import sparse
from umap.umap_ import fuzzy_simplicial_set, find_ab_params
from helios_network import Network, AttributeScope, AttributeType


def export_umap_mvp_bx_zx(X: np.ndarray, bx_path: str, zx_path: str, seed: int = 42):
    rs = np.random.RandomState(seed)
    n_neighbors = 15
    min_dist = 0.1
    spread = 1.0
    learning_rate = 1.0
    repulsion_strength = 1.0
    negative_sample_rate = 5
    n_epochs = 500

    # Reuse umap-learn graph construction only.
    graph, sigmas, rhos = fuzzy_simplicial_set(
        X,
        n_neighbors=n_neighbors,
        random_state=rs,
        metric="euclidean",
        metric_kwds={},
        set_op_mix_ratio=1.0,
        local_connectivity=1.0,
        apply_set_operations=True,
        verbose=False,
    )
    a, b = find_ab_params(spread, min_dist)

    # Undirected edge set with one stored weight per edge.
    coo = sparse.triu(graph.tocsr(), k=1).tocoo()

    net = Network(directed=False)
    net.add_nodes(X.shape[0])
    net.add_edges(list(zip(coo.row.tolist(), coo.col.tolist())))

    # Required attraction weights.
    net.define_attribute(AttributeScope.Edge, "umap_weight", AttributeType.Double, 1)
    net.edges["umap_weight"] = coo.data.astype(np.float64).tolist()

    # Optional node-local data.
    net.define_attribute(AttributeScope.Node, "umap_sigma", AttributeType.Double, 1)
    net.define_attribute(AttributeScope.Node, "umap_rho", AttributeType.Double, 1)
    net.nodes["umap_sigma"] = sigmas.astype(np.float64).tolist()
    net.nodes["umap_rho"] = rhos.astype(np.float64).tolist()

    # Optional initial positions.
    init2d = np.random.default_rng(seed).normal(0, 1, size=(X.shape[0], 2)).astype(np.float32)
    pos3 = np.zeros((X.shape[0], 3), dtype=np.float32)
    pos3[:, :2] = init2d
    net.define_attribute(AttributeScope.Node, "_helios_visuals_position", AttributeType.Float, 3)
    net.nodes["_helios_visuals_position"] = pos3.tolist()

    # Graph-level pass-2 defaults/provenance.
    net.define_attribute(AttributeScope.Network, "umap_a", AttributeType.Double, 1)
    net.define_attribute(AttributeScope.Network, "umap_b", AttributeType.Double, 1)
    net.define_attribute(AttributeScope.Network, "umap_learning_rate", AttributeType.Double, 1)
    net.define_attribute(AttributeScope.Network, "umap_repulsion_strength", AttributeType.Double, 1)
    net.define_attribute(AttributeScope.Network, "umap_negative_sample_rate", AttributeType.Integer, 1)
    net.define_attribute(AttributeScope.Network, "umap_n_epochs", AttributeType.Integer, 1)
    net.define_attribute(AttributeScope.Network, "umap_n_neighbors", AttributeType.Integer, 1)
    net.define_attribute(AttributeScope.Network, "umap_seed", AttributeType.Integer, 1)

    net["umap_a"] = float(a)
    net["umap_b"] = float(b)
    net["umap_learning_rate"] = float(learning_rate)
    net["umap_repulsion_strength"] = float(repulsion_strength)
    net["umap_negative_sample_rate"] = int(negative_sample_rate)
    net["umap_n_epochs"] = int(n_epochs)
    net["umap_n_neighbors"] = int(n_neighbors)
    net["umap_seed"] = int(seed)

    net.save_bxnet(bx_path)
    net.save_zxnet(zx_path, 6)
```

---

## 11) Python Example B (Future rich profile for dynamic `k` reduction)

```python
import numpy as np
from scipy import sparse
from umap.umap_ import nearest_neighbors, smooth_knn_dist, compute_membership_strengths
from helios_network import Network, AttributeScope, AttributeType


def export_umap_rich_knn(X: np.ndarray, bx_path: str, kmax: int = 64, seed: int = 42):
    rs = np.random.RandomState(seed)

    # Build directed max-K neighbor graph once.
    knn_indices, knn_dists, _ = nearest_neighbors(
        X,
        n_neighbors=kmax,
        metric="euclidean",
        metric_kwds={},
        angular=False,
        random_state=rs,
        low_memory=True,
        use_pynndescent=True,
        n_jobs=-1,
        verbose=False,
    )

    sigmas, rhos = smooth_knn_dist(
        knn_dists,
        k=float(kmax),
        local_connectivity=1.0,
        n_iter=64,
        bandwidth=1.0,
    )

    rows, cols, vals, _ = compute_membership_strengths(
        knn_indices,
        knn_dists,
        sigmas,
        rhos,
        return_dists=True,
        bipartite=False,
    )

    # Directed storage for rank/dist + directed membership.
    net = Network(directed=True)
    net.add_nodes(X.shape[0])
    net.add_edges(list(zip(rows.tolist(), cols.tolist())))

    net.define_attribute(AttributeScope.Edge, "umap_weight_ij", AttributeType.Double, 1)
    net.edges["umap_weight_ij"] = vals.astype(np.float64).tolist()

    # Optional: explicit rank and distance per directed edge for later dynamic-k filtering.
    # Rank reconstruction here is left to precompute bookkeeping; in production keep
    # a deterministic mapping from (row,col) to original neighbor rank.
    net.define_attribute(AttributeScope.Edge, "knn_distance", AttributeType.Double, 1)
    net.edges["knn_distance"] = np.asarray([
        float(knn_dists[src, np.where(knn_indices[src] == dst)[0][0]])
        for src, dst in zip(rows.tolist(), cols.tolist())
    ], dtype=np.float64).tolist()

    net.define_attribute(AttributeScope.Node, "umap_sigma", AttributeType.Double, 1)
    net.define_attribute(AttributeScope.Node, "umap_rho", AttributeType.Double, 1)
    net.nodes["umap_sigma"] = sigmas.astype(np.float64).tolist()
    net.nodes["umap_rho"] = rhos.astype(np.float64).tolist()

    net.define_attribute(AttributeScope.Network, "knn_kmax", AttributeType.Integer, 1)
    net.define_attribute(AttributeScope.Network, "umap_seed", AttributeType.Integer, 1)
    net["knn_kmax"] = int(kmax)
    net["umap_seed"] = int(seed)

    net.save_bxnet(bx_path)
```

Note: Example B illustrates the richer storage idea. The runtime must still define how directed memberships are symmetrized for attraction.

---

## 12) Acceptance Criteria (Phase 1)

- A precomputed UMAP graph saved from Python can be loaded and optimized in Helios with `umap-force`.
- Live updates to second-pass controls immediately affect optimization without rebuilding graph.
- Works on WebGPU and WebGL2 backends under the same public layout API.
- `.bxnet` and `.zxnet` exports from the Python workflow retain required node/edge/graph attributes and load reproducibly.

