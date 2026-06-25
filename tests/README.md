# Tests

This folder contains two kinds of tests:

- **Node unit test**: `npm test` (runs `tests/colormaps.test.js`).
- **Playwright E2E tests**: `npm run test:e2e` (runs everything under `tests/`).

## Running Playwright suites

- **Headless (default)**: `npm run test:e2e`
- **Headed (all files)**: `npm run test:e2e:headed`
- **WebGPU-focused (headed)**: `npm run test:e2e:webgpu`
- **Weighted transparency focus**: `npm run test:e2e:weighted`
- **Rendering options focus**: `npm run test:e2e:rendering-options`
- **Ad-hoc single file**: `npm run test:e2e -- tests/<file>.spec.js`
- **Ad-hoc single file headed**: `npm run test:e2e -- --headed tests/<file>.spec.js`

Playwright spins up Vite via the config in `playwright.config.js` (port 4173). You usually do not need a separate `npm run dev`.

## Test fixtures

Playwright tests should avoid navigating to `/` (which loads `docs/app/main.js`). Instead, they use:

- `tests/fixtures/blank.html`: minimal page with no scripts (tests build their own Helios instance via `page.evaluate`).
- `tests/fixtures/demo.html`: stable demo harness that exposes `window.__helios` and `window.__HELIOS_DIAGNOSTICS__` and supports query params like `renderer`, `layout`, `mode`, `nodes`, and `pickTest`.

## Skips and environment notes

Some tests intentionally skip when prerequisites are missing:

- **Weighted edge transparency checks** (`edge-transparency.spec.js`, `rendering-options.spec.js` headed cases):
  - Require a headed Chromium context.
  - Require WebGL2 support for multiple render targets and floating point textures. If unavailable, the test skips instead of failing.
  - If weighted blending produces no observable delta versus alpha (e.g., driver falls back), the test skips.
- **WebGPU visual** (`rendering-options.spec.js` @webgpu): skips when `navigator.gpu` is absent or WebGPU initialization fails.

If you want to force these to run, use `--headed` and the `chromium-webgpu-headed` project, but they may still skip if the GPU/driver lacks the needed features.

## Practical recipes

- Everything, fastest: `npm run test:e2e` (headless all files) + `npm test`.
- Full E2E with UI visibility: `npm run test:e2e -- --headed`.
- Focused debug on weighted transparency: `npm run test:e2e -- --headed tests/edge-transparency.spec.js`.
- WebGPU coverage: `npm run test:e2e -- --headed --project=chromium-webgpu-headed tests/rendering-options.spec.js`.

## Troubleshooting

- If you see `No tests found`, ensure the file argument matches an existing `*.spec.js` path.
- For GPU feature skips, try updating Chrome/Chromium and ensure hardware acceleration is enabled; on some CI providers, these features are unavailable.
- Experimental JSON import warnings are expected when loading colormap data and can be ignored.
