## Fast Approximate Z-Score For Log-Ratio Density

### Goal

Add a real-time inferential companion to the existing `logRatio` mode without introducing extra KDE passes or permutation/bootstrap costs.

### Scope

- Only applies when `comparisonMode: 'logRatio'`
- Fully opt-in via `logRatioZScore: true | false`
- Reuses the existing numerator and denominator density textures
- Leaves the existing `difference` and raw `logRatio` pipelines intact

### Statistic

The raw display statistic remains:

\[
L(x) = \log \frac{f_A(x) + \epsilon}{f_B(x) + \epsilon}
\]

When `logRatioZScore` is enabled, the renderer switches to an approximate local z-score:

1. Recover local effective counts from the already-rendered normalized density fields:

\[
c_A(x) \approx f_A(x)\,T_A
\qquad
c_B(x) \approx f_B(x)\,T_B
\]

where `T_A` and `T_B` are the total pre-normalization masses for the numerator and denominator.

2. Use the Poisson-style delta-method variance of the log-ratio:

\[
\operatorname{Var}[L(x)] \approx \frac{1}{c_A(x) + \alpha} + \frac{1}{c_B(x) + \alpha}
\]

with a local stabilizer

\[
\alpha = \epsilon \cdot \max(T_A, T_B, 1)
\]

3. Display

\[
Z(x) = \frac{L(x)}{\sqrt{\operatorname{Var}[L(x)]}}
\]

This is fast and pointwise. It is not a full permutation null and it is not a spatial multiple-testing correction.

### Why This Version

- No extra splat pass
- No extra render target
- No resampling loop
- Works in the same composite step for both WebGL and WebGPU
- Gives a more support-aware inferential view than the raw log-ratio alone

### Caveats

- It is an approximate effective-count z-score, not an exact null-model test
- It assumes the local smoothed masses behave enough like counts for the delta-method approximation to be useful
- It should be interpreted as a fast ranking / screening aid, not publication-grade significance

### UI / API

- `logRatioZScore: false` keeps the raw log-ratio
- `logRatioZScore: true` displays the approximate z-score
- `logRatioRange` continues to act as the symmetric display clipping range for either view
- `logRatioSupportCorrection` remains independent and can still be enabled or disabled

