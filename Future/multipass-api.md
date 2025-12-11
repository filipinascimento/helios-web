# Multipass Rendering API – Proposal & Integration Notes

This doc is a prompt/checklist for implementing a modular multipass system that works for both WebGL2 and WebGPU without regressing current behavior. It captures the current architecture and the target design.

## Current Rendering Shape (Helios)
- Entry: `Helios` builds a `LayeredRenderer` via `createRenderer(canvas, { clearColor, renderer: 'webgl'|'webgpu', mode, projection, edgeRendering, transparencyModeEdges, nodeOutlineColor })`. Scheduler calls `renderer.render(frame, size)`, where `frame.network` is a `helios-network` instance.
- `LayeredRenderer` picks WebGPU when available unless `forceWebGL`/`forceWebGPU` override. It owns a device (`WebGL2Device` or `WebGPUDevice`), keeps a `layers` array with the graph layer first, and exposes: `initialize()`, `resize(size)`, `beginFrame(renderTarget, clearColor, rect) -> context`, `endFrame(context)`, `createFramebuffer(w,h)`, `presentFramebuffer(target, rect)`, `readPixels(target, rect)`, `render(frame)`.
- Devices:
  - WebGL2: wraps `WebGL2RenderingContext`, compiles a present quad, creates FBOs (RGBA8 + depth16), `beginFrame` binds/clears FBO, returns `{ type: 'webgl2', gl, target, viewport }`, `presentFramebuffer` draws a textured quad to default framebuffer.
  - WebGPU: wraps `GPUDevice`/context, preferred canvas format, `depth24plus`, quad buffer + render pipeline for presenting a texture. `beginFrame` creates command + render pass with color (and depth) attachments; returns `{ type: 'webgpu', device, passEncoder, commandEncoder, format, quad, target, colorView, depthView, width, height, viewport }`.
- Layers:
  - Base `Layer` has `initialize(device,size)`, `resize(size)`, `render(context,frame)`.
  - `GraphLayer` pulls dense buffers from `helios-network` for node/edge attributes (positions, colors, sizes, outline widths/colors, edge widths, opacities, endpoints). Camera uniforms come from `camera.getUniforms()` with fallback identity. Edge rendering mode: `line` or `quad`. Transparency modes: `alpha`, `weighted`, `additive`, `screen`, `max`, `additive-normalized`, `additive-tonemapped`, `additive-normalized-bright`. Node/edge params: opacityBase/Scale, sizeBase/Scale, outlineWidthBase/Scale, outlineColor, edgeWidthBase/Scale, edgeEndpointTrim. Global edge width scale multiplier: 300.
  - `GraphLayerWebGL`: instanced quads for nodes, instanced lines/quads for edges. Multiple GLSL programs (graphWebGL.js). Weighted blended transparency uses MRT (RGBA16F color + weight + depth) when extensions allow; renders edges additive, resolves via fullscreen program (tonemap/boost variants). Fallback logs once. In weighted path, nodes seed depth in main buffer for 3D, edges in MRT, resolve to main, then optional 2D node redraw.
  - `GraphLayerWebGPU`: WGSL equivalents (graphWebGPU.js). Uniform/storage buffers for camera/globals/node/edge data, pipelines for node, edge line/quad, weighted resolve (cached by mode/format). DepthStencil `{ format: depth24plus, depthWriteEnabled: true, depthCompare: 'less-equal' }`. Edge blend modes swap pipelines; weighted uses off-screen color+weight textures, sampler, resolve pipelines (default/tonemap variants). Storage buffers respect 256-byte alignment and `maxStorageBufferBindingSize`.
- Data flow: Scheduler triggers geometry update; renderer.render() gets frame `{ network, timestamp, camera }`. Layers call `updateDense*` on the network, read typed views, upload each frame (WebGL: `bufferData` DYNAMIC_DRAW; WebGPU: storage buffers). Instancing count derived from buffer lengths. Camera uniforms depend on 2d/3d mode, projection, viewport.

## Goal for Multipass/Frame Graph
Introduce a modular pass graph that:
- Composes render/compute/post passes; supports backend-specific passes (WebGL-only/WebGPU-only) with optional fallbacks.
- Manages multiple cameras/targets (multi-FBO output) and allows the caller to present any framebuffer or draw into sub-rects.
- Supports AA (MSAA resolve, FXAA/TAA passes), MRT, depth writes/reads, and post effects (glow/blur/SSAO/FXAA).
- Keeps WebGL2/WebGPU under the same high-level API; backends handle bindings/barriers/FBOs. Preserve existing graph drawing behavior/options.
- Stays low-overhead: precompile/resolve state, pool render targets/textures/buffers, avoid per-frame allocations and string lookups.

## Proposed API Shape
- `FrameGraph` / `PassGraph`: declarative graph of passes and resources. Passes declare reads/writes; graph compiler topologically sorts, reuses transient targets, and prepares barriers (WebGPU) or FBO binds (WebGL).
- `RenderPass` interface:
  - `setup(registry)`: describe attachments (color[], depth/stencil), inputs, outputs, clear ops, sample count, backend support (`'webgl'|'webgpu'|'any'`), optional fallback pass id.
  - `execute(ctx, resources, frame)`: issue draw/compute using pre-resolved handles (no string lookups in hot path).
- Pass types: `render` (graphics), `compute` (WebGPU; WebGL can mark unsupported), `blit/resolve` (e.g., MSAA resolve, copy), `present` (blit to swapchain or sub-rect).
- Resources: descriptors `{ width, height, format, samples, usage, mip?, layer? }`. Backends map to `Framebuffer+Texture` (GL) or `GPUTexture+View` (WebGPU). Provide views (mip/array) where supported; on GL, emulate via separate textures.
- Contexts: `GLContext` wraps `gl`, FBO cache, programs, VAOs; `GPUContext` wraps `device`, `encoder`, `passEncoder`, pipelines, bind groups. Shared helpers like `drawFullscreen(inputs, pipelineId)`.
- Capability flags: detect MRT availability/limits, float color attachments, depth textures, MSAA sample counts (GL) and per-format sample counts (GPU). Validate passes at compile time; skip or fallback gracefully.

## Integration With Existing Renderer
- Keep `createRenderer` and `LayeredRenderer` public API stable. Integrate a `FrameGraphRunner` inside the graph layer(s) so `GraphLayerWebGL/WebGPU` become sets of passes rather than monoliths.
- Preserve edge rendering modes and transparency behavior by mapping them to pass sets:
  - Alpha path: scene pass with node+edge in chosen order.
  - Weighted path: node depth seed (3D), edge accumulation MRT pass, resolve pass, optional node overlay (2D).
- Multi-camera: allow multiple camera pass instances targeting different resources; final compose/present can place textures into panels (using `presentFramebuffer` rects).
- AA: per-pass `samples` for MSAA, with automatic resolve pass to single-sample textures before post-processing; also include optional FXAA/TAA passes in the graph.
- Depth use: passes can declare depth attachment and depth read dependencies (for SSAO or soft particles). WebGL requires depth texture support; guard and fallback.
- MRT: passes declare multiple color outputs; WebGL uses `drawBuffers`; WebGPU sets multiple `colorAttachments`. If unsupported, split into multiple passes or fallback.

## Performance Guidelines
- Separate graph compile from per-frame execution; cache pass order and resolved handles.
- Precreate/cache pipelines/programs, bind groups/uniform locations, and VAOs/vertex buffers. Avoid per-frame allocations.
- Pool transient render targets keyed by size/format/samples; reuse arrays/objects in schedulers.
- Fuse compatible fullscreen passes where possible; avoid chains of tiny passes. Use MRT when beneficial.
- Keep per-frame lookups O(1) and avoid string maps in hot loops; resolve indices/handles once during compile.
- Provide debug vs release modes: debug validates dependencies and logs the graph; release strips checks.

## Debug/Tooling
- Graph dump: textual/JSON view of passes, resources, dependencies, sample counts, and backends.
- Capture mode: hook to dump intermediate textures for inspection.
- Warnings for unsupported passes/features with fallbacks noted.

## Suggested Implementation Steps
1) Add minimal frame-graph core (passes/resources, compiler, transient RT pool).  
2) Port current graph layer rendering into pass form (scene pass + weighted path passes). Ensure parity with existing options.  
3) Add MSAA resolve pass and FXAA pass as examples.  
4) Add multi-camera sample wiring to present two views.  
5) Add backend capability checks and fallback plumbing.  
6) Add graph dump/capture utilities.  
7) Profile CPU overhead; target < ~0.5–1 ms added on desktop, trim if higher.  

Use this doc as a prompt for future work: generate code that introduces the pass graph, keeps LayeredRenderer API stable, and preserves current rendering outputs while enabling new effects and multi-camera compositions.
