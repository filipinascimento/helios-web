## Log-Ratio Low-Support Correction

### Problem

The log-ratio density mode computes

\[
L(x) = \log \frac{f_A(x) + \epsilon}{f_B(x) + \epsilon}
\]

This is the right effect-size statistic for over/underrepresentation, but it becomes visually unstable in the tails. When both smoothed densities are close to zero, one side often reaches zero slightly faster than the other, which creates large apparent ratios in sparse border regions.

### Goal

- Keep the raw log-ratio fully visible in regions with enough pooled support.
- Suppress only the unstable low-support tail.
- Avoid changing the legacy `difference` pipeline.
- Keep the correction cheap enough for the existing WebGL and WebGPU composite passes.
- Allow the correction to be turned off explicitly for raw inspection.

### Implemented Rule

The correction is applied only in `comparisonMode: 'logRatio'`.
It is controlled by `logRatioSupportCorrection: true | false`.

1. Compute the raw log-ratio as before:

\[
L(x) = \log \frac{f_A(x) + \epsilon}{f_B(x) + \epsilon}
\]

2. Define pooled support as:

\[
S(x) = f_A(x) + f_B(x)
\]

This is more conservative and more interpretable than using `max(f_A, f_B)`.

3. Define a support window:

\[
S_{\text{floor}} = \max(\text{maskThreshold}, 128 \cdot \epsilon)
\]

\[
S_{\text{ceil}} = \max(2 \cdot S_{\text{floor}}, 512 \cdot \epsilon)
\]

4. Convert support into a soft reliability weight:

\[
w(x) = \operatorname{smoothstep}(S_{\text{floor}}, S_{\text{ceil}}, S(x))
\]

5. Apply the correction only to the displayed value:

\[
L_{\text{shown}}(x) = w(x)\,L(x)
\]

Above `S_ceil`, the displayed map is the raw log-ratio. Below `S_floor`, the map fades to neutral/transparent. Between them, the transition is smooth.

If `logRatioSupportCorrection` is `false`, the renderer skips the support fade and shows the raw log-ratio everywhere.

### Why This Design

- It preserves the meaning of color in supported regions.
- It avoids mixing support into the statistic everywhere.
- It is cheap: no extra KDE pass, no permutation/bootstrap, no extra render target.
- It keeps `maskThreshold` useful as an optional stronger user/API floor while also providing a sensible automatic epsilon-scaled floor by default.

### Tradeoffs

- The exact support window is heuristic, not a formal uncertainty estimate.
- Very small but real structures near the support boundary may be attenuated.
- The correction is display-oriented; it does not turn the map into a significance test.

### Alternatives Considered

- Larger fixed `epsilon`
  - Too global. It changes the statistic everywhere, not just in the unstable tail.
- Multiplying the map by support everywhere
  - Conflates enrichment with density.
- Hard masking only
  - Simpler, but visually harsher and more brittle at the threshold boundary.
- Permutation/bootstrap uncertainty
  - More defensible statistically, but too expensive for the current interactive path.

### Files

- `src/rendering/engine/DensityLayer.js`
- `README.md`
- `docs/UI.md`
