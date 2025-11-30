## Development and Tests

### End-to-end tests (Playwright)

- Default (headless Chromium):
  ```bash
  npm run test:e2e -- --reporter=dot --project=chromium
  ```

- WebGPU (headed Chromium, if supported by your GPU/OS/driver):
  ```bash
  npx playwright test tests/rendering-options.spec.js \
    --project=chromium-webgpu-headed \
    --reporter=dot
  ```
  The `chromium-webgpu-headed` project enables flags:
  - `--enable-unsafe-webgpu`
  - `--disable-dawn-features=disallow_unsafe_apis`
  - `--use-angle=metal` (macOS; adjust to `vulkan`/`d3d11`/`d3d12` on other platforms)

  Notes:
  - The WebGPU visual test will still skip if `navigator.gpu` is unavailable in your environment.
  - Headless WebGPU is not generally available; use the headed project above.

### Dev server
```bash
npm run dev
```

### Build
```bash
npm run build
```
