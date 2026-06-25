# AGENTS.md — helios-web

## Repo overview

Helios Web is a Vite-built library + app that wires `helios-network` (WASM graph core) into a layered renderer that prefers WebGPU and falls back to WebGL2.

## Layout / “where things live”

- `src/` — library source (public entry: `src/Helios.js`, exports: `src/index.js`)
- `docs/` — canonical package docs and examples (`docs/app/` is served by `index.html`)
- `tests/` — Playwright E2E tests + Node unit tests, plus browser fixtures under `tests/fixtures/`
- `dist/` — built artifacts from `npm run build` (don’t hand-edit)
- `for_reference/` — older/reference material; treat as read-only unless explicitly doing archaeology
- `Future/` — forward-looking notes / scratchpad docs

## Critical commands (source of truth: `package.json`)

- Node requirement: Node.js 18+ (uses `node --test`).
- Install: `npm install` (Playwright browsers once: `npx playwright install`)
- Dev server (serves `index.html` + `docs/app`): `npm run dev`
- Build library bundle: `npm run build`
- Unit tests (Node test runner): `npm test`
- E2E tests (Playwright):
  - Headless WebGL-first suite: `npm run test:e2e`
  - Headed suite: `npm run test:e2e:headed`
  - Headed WebGPU project (tests tagged `@webgpu`): `npm run test:e2e:webgpu`
  - Focused suites: `npm run test:e2e:weighted`, `npm run test:e2e:rendering-options`

## Definition of done for changes

- New feature / behavior change:
  - Add/extend tests (`tests/*.test.js` for pure logic; `tests/*.spec.js` for browser/rendering behavior).
  - Update documentation (`docs/` first, plus `README.md` when it affects onboarding/public API).
  - Keep the demo stable (`docs/app`) because tests and docs reference it.
- Major renderer/layout/picking updates: run the full matrix locally before handing off:
  - `npm test`
  - `npm run test:e2e` (headless; covers WebGL path)
  - `npm run test:e2e:headed` (headed; catches “only breaks with a real window” issues)
  - `npm run test:e2e:webgpu` (headed WebGPU project; may skip if unsupported)
- Always run tests for changes; do not add fallbacks or workarounds without explicit approval.

## Testing guidelines (to avoid flakiness)

- Prefer `tests/fixtures/demo.html` + `tests/fixtures/harness.js` over navigating to `/` (the docs demo).
- Playwright starts its own Vite server (see `playwright.config.js`); you usually don’t need a separate `npm run dev`.
- WebGPU tests are intentionally **headed** and may skip when `navigator.gpu` / adapters are unavailable.
- The WebGPU Playwright project passes Chromium flags (notably `--use-angle=metal`); adjust for non-macOS platforms if you’re extending it.
- For GPU validation, prefer tolerant checks (pixel sampling, “not blank”, hit-counts) over pixel-perfect snapshots.
- Headed screenshot artifacts can land in `artifacts/headed-screenshots/`; Playwright results in `test-results/`.

## Code conventions / pitfalls

- This repo is ESM (`"type": "module"`). Keep new files ESM and avoid CommonJS-only patterns.
- No lint/format script is configured; follow the local style of the file you touch and avoid drive-by reformatting.
- If you change the public surface area, update `src/index.js` exports.
- Do **not** hand-edit `src/index.d.ts`. It is a generated declaration surface derived from source annotations/JSDoc/type metadata. Update source annotations first and run the declaration-generation workflow; if that workflow is missing or broken, document the tooling gap instead of manually patching `src/index.d.ts`.
