export const DEFAULT_STYLE_ELEMENT_ID = 'helios-ui-default-styles';

export const defaultStylesText = `
.helios-ui {
  --helios-ui-font: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
  --helios-ui-font-size: 12px;
  --helios-ui-radius: 12px;
  --helios-ui-gap: 8px;
  --helios-ui-border: color-mix(in srgb, var(--helios-ui-fg) 12%, transparent);
  --helios-ui-shadow: 0 12px 30px rgba(0, 0, 0, 0.25);
  --helios-ui-blur: 14px;
  --helios-ui-z: 50;
  --helios-ui-label-col: 140px;

  position: absolute;
  inset: 0;
  z-index: var(--helios-ui-z);
  font: 400 var(--helios-ui-font-size)/1.35 var(--helios-ui-font);
  color: var(--helios-ui-fg);
  pointer-events: none;
}

.helios-ui-ellipsis {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.helios-ui[data-theme="dark"] {
  --helios-ui-bg: rgba(12, 14, 18, 0.72);
  --helios-ui-bg-solid: rgba(12, 14, 18, 0.94);
  --helios-ui-fg: rgba(244, 246, 250, 0.92);
  --helios-ui-muted: rgba(244, 246, 250, 0.62);
  --helios-ui-accent: #38bdf8;
  --helios-ui-accent-contrast: #ffffff;
}

.helios-ui[data-theme="light"] {
  --helios-ui-bg: rgba(250, 251, 252, 0.78);
  --helios-ui-bg-solid: rgba(250, 251, 252, 0.97);
  --helios-ui-fg: rgba(12, 14, 18, 0.92);
  --helios-ui-muted: rgba(12, 14, 18, 0.62);
  --helios-ui-accent: #0ea5e9;
  --helios-ui-accent-contrast: #ffffff;
  --helios-ui-shadow: 0 12px 30px rgba(0, 0, 0, 0.12);
}

.helios-ui * { box-sizing: border-box; }

.helios-ui-panel {
  position: absolute;
  width: 320px;
  max-width: min(92vw, 480px);
  min-width: 240px;
  max-height: calc(100% - 16px);
  pointer-events: auto;
  border-radius: var(--helios-ui-radius);
  border: 1px solid var(--helios-ui-border);
  background: var(--helios-ui-bg);
  -webkit-backdrop-filter: blur(var(--helios-ui-blur));
  backdrop-filter: blur(var(--helios-ui-blur));
  box-shadow: var(--helios-ui-shadow);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.helios-ui-panel:not([data-dock="free"]) {
  border-radius: 0;
}

.helios-ui-resize-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 10px;
  pointer-events: auto;
  touch-action: none;
}

.helios-ui-resize-handle[data-edge="right"] { right: 0; cursor: ew-resize; }
.helios-ui-resize-handle[data-edge="left"] { left: 0; cursor: ew-resize; }

.helios-ui-panel[data-dock="top"] .helios-ui-resize-handle,
.helios-ui-panel[data-dock="bottom"] .helios-ui-resize-handle {
  display: none;
}

.helios-ui-panel[data-collapsed="true"] .helios-ui-panel__body { display: none; }

.helios-ui-panel__header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 7px 5px;
  user-select: none;
  cursor: default;
}

.helios-ui-panel__title {
  flex: 1;
  font-weight: 600;
  letter-spacing: 0.2px;
  font-size: 12.5px;
}

.helios-ui-panel__actions {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.helios-ui-button {
  appearance: none;
  border: 1px solid color-mix(in srgb, var(--helios-ui-accent) 38%, var(--helios-ui-border));
  border-radius: 10px;
  padding: 4px 6px;
  background: color-mix(in srgb, var(--helios-ui-accent) 16%, var(--helios-ui-bg-solid));
  color: inherit;
  font: inherit;
  font-weight: 600;
  line-height: 1;
}

.helios-ui-button--icon {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
}

.helios-ui-button__icon {
  width: 14px;
  height: 14px;
  flex: none;
  opacity: 0.9;
}

.helios-ui-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.helios-ui-select {
  appearance: none;
  border: 1px solid var(--helios-ui-border);
  border-radius: 10px;
  padding: 4px 26px 4px 10px;
  background:
    linear-gradient(45deg, transparent 50%, color-mix(in srgb, var(--helios-ui-muted) 90%, transparent) 50%) right 12px center/6px 6px no-repeat,
    linear-gradient(135deg, color-mix(in srgb, var(--helios-ui-muted) 90%, transparent) 50%, transparent 50%) right 8px center/6px 6px no-repeat,
    color-mix(in srgb, var(--helios-ui-bg-solid) 85%, transparent);
  color: inherit;
  font: inherit;
  line-height: 1;
  max-width: 220px;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.helios-ui-select--compact {
  width: auto;
  max-width: 140px;
}

.helios-ui-network {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.helios-ui-network__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.helios-ui-network__actions > .helios-ui-select {
  flex: 0 0 auto;
}

.helios-ui-network__name {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.helios-ui-network__name > .helios-ui-text {
  flex: 1 1 auto;
}

.helios-ui-network__ext {
  flex: none;
  font: 600 11px/1 var(--helios-ui-font);
  color: var(--helios-ui-muted);
  padding: 0 2px;
  user-select: none;
}

.helios-ui-select:hover {
  border-color: color-mix(in srgb, var(--helios-ui-fg) 18%, transparent);
}

.helios-ui-button:hover {
  border-color: color-mix(in srgb, var(--helios-ui-accent) 55%, var(--helios-ui-border));
  background: color-mix(in srgb, var(--helios-ui-accent) 22%, var(--helios-ui-bg-solid));
}

.helios-ui-button:active {
  transform: translateY(0.5px);
}

.helios-ui-button:focus-visible,
.helios-ui-select:focus-visible {
  outline: none;
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--helios-ui-accent) 22%, transparent);
}

.helios-ui-panel__body {
  padding: 6px;
  border-top: 1px solid color-mix(in srgb, var(--helios-ui-border) 75%, transparent);
  overflow: auto;
}

.helios-ui-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 7px;
  align-items: center;
  padding: 5px 0;
}

.helios-ui-row > * { min-width: 0; }

.helios-ui-row--aligned {
  grid-template-columns: var(--helios-ui-label-col) minmax(0, 1fr);
}

.helios-ui-row--slider {
  padding: 2px 0;
}

.helios-ui-label {
  display: grid;
  gap: 2px;
  min-width: 0;
  justify-items: end;
  text-align: right;
}

.helios-ui-label__title-row {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 3px;
  min-height: 18px;
}

.helios-ui-label__title {
  font-weight: 500;
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
  white-space: normal;
}
.helios-ui-label__hint { color: var(--helios-ui-muted); font-size: 11px; }

.helios-ui-help {
  appearance: none;
  border: 1px solid var(--helios-ui-border);
  border-radius: 999px;
  width: 12px;
  height: 12px;
  padding: 0;
  background: color-mix(in srgb, var(--helios-ui-bg-solid) 80%, transparent);
  color: var(--helios-ui-muted);
  font: 700 9px/1 var(--helios-ui-font);
  display: grid;
  place-items: center;
  cursor: help;
  transform: translateY(-3px);
}

.helios-ui-help:hover {
  color: color-mix(in srgb, var(--helios-ui-accent) 85%, var(--helios-ui-fg));
  border-color: color-mix(in srgb, var(--helios-ui-accent) 45%, var(--helios-ui-border));
}

.helios-ui-help:focus-visible {
  outline: none;
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--helios-ui-accent) 22%, transparent);
}

.helios-ui-tooltip {
  position: fixed;
  z-index: 9999;
  max-width: min(280px, calc(100vw - 24px));
  padding: 6px 8px;
  border-radius: 9px;
  border: 1px solid color-mix(in srgb, var(--helios-ui-fg) 14%, transparent);
  background: color-mix(in srgb, var(--helios-ui-bg-solid) 92%, transparent);
  color: inherit;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28);
  pointer-events: none;
  line-height: 1.3;
  font: 400 11px/1.25 var(--helios-ui-font);
}

.helios-ui-tooltip[data-open="false"] { opacity: 0; }
.helios-ui-tooltip[data-open="true"] { opacity: 1; }

.helios-ui-value {
  font-variant-numeric: tabular-nums;
  color: var(--helios-ui-muted);
  min-width: 3.5em;
  text-align: right;
}

.helios-ui-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-start;
}

.helios-ui-stats--end { justify-content: flex-end; }

.helios-ui-stat {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--helios-ui-border);
  background: color-mix(in srgb, var(--helios-ui-bg-solid) 85%, transparent);
  font: 400 11px/1.1 var(--helios-ui-font);
  max-width: 100%;
}

.helios-ui-stat__label {
  color: var(--helios-ui-muted);
  white-space: nowrap;
}

.helios-ui-stat__value {
  font-variant-numeric: tabular-nums;
  color: inherit;
  white-space: nowrap;
}

.helios-ui-number {
  width: 72px;
  padding: 4px 6px;
  border-radius: 10px;
  border: 1px solid var(--helios-ui-border);
  background: color-mix(in srgb, var(--helios-ui-bg-solid) 85%, transparent);
  color: inherit;
  font: inherit;
  font-variant-numeric: tabular-nums;
  text-align: right;
  -moz-appearance: textfield;
}

.helios-ui-toggle {
  appearance: none;
  border: 1px solid color-mix(in srgb, var(--helios-ui-accent) 38%, var(--helios-ui-border));
  border-radius: 999px;
  padding: 3px 10px 3px 6px;
  background: color-mix(in srgb, var(--helios-ui-bg-solid) 85%, transparent);
  color: inherit;
  font: inherit;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  line-height: 1;
}

.helios-ui-toggle__thumb {
  width: 22px;
  height: 14px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--helios-ui-fg) 12%, transparent);
  border: 1px solid var(--helios-ui-border);
  position: relative;
  flex: none;
}

.helios-ui-toggle__thumb::after {
  content: "";
  position: absolute;
  top: 1px;
  left: 1px;
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--helios-ui-fg) 70%, transparent);
  transition: transform 120ms ease;
}

.helios-ui-toggle[aria-checked="true"] {
  background: color-mix(in srgb, var(--helios-ui-accent) 18%, var(--helios-ui-bg-solid));
}

.helios-ui-toggle[aria-checked="true"] .helios-ui-toggle__thumb {
  background: color-mix(in srgb, var(--helios-ui-accent) 38%, transparent);
  border-color: color-mix(in srgb, var(--helios-ui-accent) 55%, var(--helios-ui-border));
}

.helios-ui-toggle[aria-checked="true"] .helios-ui-toggle__thumb::after {
  background: color-mix(in srgb, var(--helios-ui-accent) 92%, transparent);
  transform: translateX(8px);
}

.helios-ui-toggle:focus-visible {
  outline: none;
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--helios-ui-accent) 22%, transparent);
}

.helios-ui-number::-webkit-outer-spin-button,
.helios-ui-number::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.helios-ui-row--slider .helios-ui-number {
  width: 68px;
  padding: 3px 6px;
  border-radius: 9px;
  max-width: 100%;
}

.helios-ui-number:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--helios-ui-accent) 55%, var(--helios-ui-border));
}

.helios-ui-number:disabled {
  opacity: 0.55;
}

.helios-ui-text {
  width: 100%;
  min-width: 0;
  padding: 4px 8px;
  border-radius: 10px;
  border: 1px solid var(--helios-ui-border);
  background: color-mix(in srgb, var(--helios-ui-bg-solid) 85%, transparent);
  color: inherit;
  font: inherit;
}

.helios-ui-text:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--helios-ui-accent) 55%, var(--helios-ui-border));
}

.helios-ui-text:disabled {
  opacity: 0.55;
}

.helios-ui-colormap-picker {
  display: grid;
  gap: 6px;
  width: 100%;
  min-width: 0;
}

.helios-ui-colormap-thumb {
  width: 100%;
  height: 14px;
  border-radius: 999px;
  border: 1px solid var(--helios-ui-border);
  overflow: hidden;
  background-repeat: no-repeat;
  background-size: 100% 100%;
  background-clip: padding-box;
  background: linear-gradient(90deg, rgba(120, 120, 120, 1), rgba(40, 40, 40, 1));
}

.helios-ui-colormap-thumb--small {
  height: 10px;
  border-radius: 999px;
}

.helios-ui-colormap-picker__preview {
  opacity: 0.95;
}

.helios-ui-colormap-picker__display {
  max-width: none;
}

.helios-ui-colormap-picker {
  position: relative;
}

.helios-ui-colormap-popover {
  position: fixed;
  left: 0;
  top: 0;
  z-index: calc(var(--helios-ui-z) + 200);
  pointer-events: auto;
}

.helios-ui-colormap-popover__panel {
  border: 1px solid var(--helios-ui-border);
  border-radius: 10px;
  padding: 0;
  background: color-mix(in srgb, var(--helios-ui-bg-solid) 92%, transparent);
  overflow: auto;
  box-shadow: var(--helios-ui-shadow);
}

.helios-ui-colormap-popover__header {
  position: sticky;
  top: 0;
  z-index: 2;
  padding: 8px;
  background: color-mix(in srgb, var(--helios-ui-bg-solid) 96%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--helios-ui-border) 70%, transparent);
}

.helios-ui-colormap-popover__search {
  width: 100%;
}

.helios-ui-colormap-popover__list {
  padding: 4px;
}

.helios-ui-colormap-picker__item {
  appearance: none;
  width: 100%;
  display: grid;
  gap: 5px;
  padding: 7px 8px;
  border-radius: 9px;
  border: 1px solid transparent;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-align: left;
}

.helios-ui-colormap-picker__item:hover {
  background: color-mix(in srgb, var(--helios-ui-fg) 8%, transparent);
  border-color: color-mix(in srgb, var(--helios-ui-fg) 14%, transparent);
}

.helios-ui-colormap-picker__item:focus-visible {
  outline: none;
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--helios-ui-accent) 22%, transparent);
}

.helios-ui-colormap-picker__item-title {
  font-weight: 600;
}

.helios-ui-colormap-section {
  display: grid;
  gap: 6px;
  padding: 0 0 6px;
}

.helios-ui-colormap-section + .helios-ui-colormap-section {
  border-top: 1px solid color-mix(in srgb, var(--helios-ui-border) 70%, transparent);
}

.helios-ui-colormap-section__title {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 4px 8px 4px;
  background: color-mix(in srgb, var(--helios-ui-bg-solid) 96%, transparent);
  font: 700 10.5px/1.2 var(--helios-ui-font);
  color: var(--helios-ui-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.helios-ui-colormap-section__body {
  display: grid;
  gap: 2px;
}

.helios-ui-colormap-picker__note {
  padding: 6px 6px 4px;
  color: var(--helios-ui-muted);
  font-size: 11px;
}

.helios-ui-progress {
  width: 100%;
  height: 10px;
  border-radius: 999px;
  overflow: hidden;
  background: color-mix(in srgb, var(--helios-ui-fg) 10%, transparent);
  border: 1px solid var(--helios-ui-border);
}

.helios-ui-progress::-webkit-progress-bar {
  background: color-mix(in srgb, var(--helios-ui-fg) 10%, transparent);
}

.helios-ui-progress::-webkit-progress-value {
  background: color-mix(in srgb, var(--helios-ui-accent) 92%, transparent);
}

.helios-ui-progress::-moz-progress-bar {
  background: color-mix(in srgb, var(--helios-ui-accent) 92%, transparent);
}

.helios-ui-slider-controls {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  width: 100%;
  min-width: 0;
}

.helios-ui-slider {
  width: 100%;
  --pct: 0;
  --helios-ui-slider-track: color-mix(in srgb, var(--helios-ui-fg) 12%, transparent);
  --helios-ui-slider-fill: color-mix(in srgb, var(--helios-ui-accent) 92%, transparent);
  --helios-ui-slider-track-h: 6px;
  --helios-ui-slider-thumb: 12px;

  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  height: 18px;
  cursor: pointer;
  min-width: 0;
}

.helios-ui-row__controls {
  display: flex;
  justify-content: flex-end;
  min-width: 0;
}

.helios-ui-slider::-webkit-slider-runnable-track {
  height: var(--helios-ui-slider-track-h);
  border-radius: 999px;
  border: 0;
  box-shadow: inset 0 0 0 1px var(--helios-ui-border);
  background-color: var(--helios-ui-slider-track);
  background-image: linear-gradient(90deg, var(--helios-ui-slider-fill), var(--helios-ui-slider-fill));
  background-size: calc(var(--pct) * 1%) 100%;
  background-repeat: no-repeat;
  background-clip: padding-box;
}

.helios-ui-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: var(--helios-ui-slider-thumb);
  height: var(--helios-ui-slider-thumb);
  margin-top: calc((var(--helios-ui-slider-thumb) - var(--helios-ui-slider-track-h)) / -2);
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--helios-ui-accent) 55%, var(--helios-ui-border));
  background: color-mix(in srgb, var(--helios-ui-bg-solid) 86%, var(--helios-ui-accent) 14%);
  box-shadow:
    0 1px 0 rgba(0, 0, 0, 0.18),
    0 8px 20px rgba(0, 0, 0, 0.18);
}

.helios-ui-slider:active::-webkit-slider-thumb {
  transform: scale(1.05);
}

.helios-ui-slider::-moz-range-track {
  height: var(--helios-ui-slider-track-h);
  border-radius: 999px;
  border: 0;
  box-shadow: inset 0 0 0 1px var(--helios-ui-border);
  background: var(--helios-ui-slider-track);
}

.helios-ui-slider::-moz-range-progress {
  height: var(--helios-ui-slider-track-h);
  border-radius: 999px;
  background: var(--helios-ui-slider-fill);
}

.helios-ui-slider::-moz-range-thumb {
  width: var(--helios-ui-slider-thumb);
  height: var(--helios-ui-slider-thumb);
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--helios-ui-accent) 55%, var(--helios-ui-border));
  background: color-mix(in srgb, var(--helios-ui-bg-solid) 86%, var(--helios-ui-accent) 14%);
  box-shadow:
    0 1px 0 rgba(0, 0, 0, 0.18),
    0 8px 20px rgba(0, 0, 0, 0.18);
}

.helios-ui-slider:focus-visible {
  outline: none;
}

.helios-ui-slider:focus-visible::-webkit-slider-thumb {
  box-shadow:
    0 0 0 4px color-mix(in srgb, var(--helios-ui-accent) 22%, transparent),
    0 1px 0 rgba(0, 0, 0, 0.18),
    0 8px 20px rgba(0, 0, 0, 0.18);
}

.helios-ui-slider:focus-visible::-moz-range-thumb {
  box-shadow:
    0 0 0 4px color-mix(in srgb, var(--helios-ui-accent) 22%, transparent),
    0 1px 0 rgba(0, 0, 0, 0.18),
    0 8px 20px rgba(0, 0, 0, 0.18);
}

.helios-ui-slider:disabled {
  opacity: 0.55;
  cursor: default;
}

.helios-ui-color-swatch {
  position: relative;
  display: inline-block;
  width: 34px;
  height: 22px;
  border-radius: 8px;
  border: 1px solid var(--helios-ui-border);
  background: color-mix(in srgb, var(--helios-ui-bg-solid) 85%, transparent);
  padding: 0;
  cursor: pointer;
}

.helios-ui-color-swatch:focus-within {
  outline: none;
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--helios-ui-accent) 22%, transparent);
}

.helios-ui-color-swatch__swatch {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: var(--helios-ui-muted);
}

.helios-ui-color-swatch__input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  margin: 0;
  padding: 0;
  border: 0;
  cursor: pointer;
}

.helios-ui-range2 {
  width: 100%;
  display: grid;
  gap: 2px;
  min-width: 0;
}

.helios-ui-range2__track {
  position: relative;
  width: 100%;
  height: 18px;
  display: flex;
  align-items: center;
  --min-pct: 0;
  --max-pct: 100;
  --helios-ui-slider-track-h: 6px;
}

.helios-ui-range2__bar {
  position: absolute;
  left: 0;
  right: 0;
  height: var(--helios-ui-slider-track-h);
  border-radius: 999px;
  box-shadow: inset 0 0 0 1px var(--helios-ui-border);
  background: color-mix(in srgb, var(--helios-ui-fg) 12%, transparent);
}

.helios-ui-range2__range {
  position: absolute;
  height: var(--helios-ui-slider-track-h);
  border-radius: 999px;
  left: calc(var(--min-pct) * 1%);
  right: calc(100% - (var(--max-pct) * 1%));
  background: color-mix(in srgb, var(--helios-ui-accent) 92%, transparent);
  cursor: grab;
  touch-action: none;
}

.helios-ui-range2__range:active {
  cursor: grabbing;
}

.helios-ui-range2__input {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  margin: 0;
  /* Two overlaid range inputs: allow interaction only via the thumbs. */
  pointer-events: none;
}

.helios-ui-range2__input::-webkit-slider-thumb {
  pointer-events: all;
}

.helios-ui-range2__input::-moz-range-thumb {
  pointer-events: all;
}

.helios-ui-range2__input::-webkit-slider-runnable-track {
  background: transparent;
  box-shadow: none;
}

.helios-ui-range2__input::-moz-range-track {
  background: transparent;
  box-shadow: none;
}

.helios-ui-range2__input::-moz-range-progress {
  background: transparent;
}

.helios-ui-range2__values {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
  width: 100%;
}

.helios-ui-dock {
  position: absolute;
  top: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  gap: var(--helios-ui-gap);
  padding: var(--helios-ui-gap);
  overflow-y: auto;
  overflow-x: hidden;
  max-height: 100%;
}

.helios-ui-dock--left { left: 0; padding-left: 0; }
.helios-ui-dock--right { right: 0; align-items: flex-end; padding-right: 0; }
.helios-ui-dock--top { padding-top: 0; }
.helios-ui-dock--bottom { justify-content: flex-end; }
.helios-ui-dock--bottom { padding-bottom: 0; }

.helios-ui-dock .helios-ui-panel {
  position: relative;
  max-height: none;
}

.helios-ui-tabs {
  display: grid;
  gap: 8px;
}

.helios-ui-tabs__bar {
  display: flex;
  gap: 6px;
  justify-content: space-between;
  align-items: center;
  min-width: 0;
}

.helios-ui-tabs__bar-left {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
  min-width: 0;
}

.helios-ui-tabs__bar-right {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
}

.helios-ui-tab {
  appearance: none;
  border: 1px solid var(--helios-ui-border);
  border-radius: 10px;
  padding: 5px 8px;
  background: color-mix(in srgb, var(--helios-ui-bg-solid) 85%, transparent);
  color: inherit;
  font: inherit;
  line-height: 1;
}

.helios-ui-tab[data-active="true"] {
  border-color: color-mix(in srgb, var(--helios-ui-accent) 55%, var(--helios-ui-border));
}

.helios-ui-panel__body > .helios-ui-tabs--panel {
  margin: -6px;
}

.helios-ui-tabs--panel {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.helios-ui-tabs--panel .helios-ui-tabs__bar {
  padding: 0 6px;
  gap: 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--helios-ui-border) 75%, transparent);
}

.helios-ui-tabs--panel .helios-ui-tabs__bar-left {
  gap: 0;
}

.helios-ui-tabs--panel .helios-ui-tab {
  border: 0;
  border-radius: 0;
  padding: 9px 10px 7px;
  background: transparent;
  color: var(--helios-ui-muted);
  border-bottom: 2px solid transparent;
}

.helios-ui-tabs--panel .helios-ui-tab:hover {
  color: inherit;
  background: color-mix(in srgb, var(--helios-ui-bg-solid) 82%, transparent);
}

.helios-ui-tabs--panel .helios-ui-tab[data-active="true"] {
  border-bottom-color: color-mix(in srgb, var(--helios-ui-accent) 72%, var(--helios-ui-border));
  color: inherit;
}

.helios-ui-tabs--panel .helios-ui-tabs__content {
  padding: 6px;
}

.helios-ui-tabpanel { display: none; }
.helios-ui-tabpanel[data-active="true"] { display: block; }

.helios-ui-stack {
  display: grid;
  gap: 8px;
}

.helios-ui-subpanel {
  border: 1px solid color-mix(in srgb, var(--helios-ui-border) 85%, transparent);
  border-radius: 10px;
  overflow: hidden;
  background: color-mix(in srgb, var(--helios-ui-bg-solid) 60%, transparent);
}

.helios-ui-subpanel__header {
  width: 100%;
  text-align: left;
  appearance: none;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 600;
  padding: 8px 8px 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
}

.helios-ui-subpanel__toggle {
  width: 1.1em;
  color: var(--helios-ui-muted);
  font-weight: 700;
  display: inline-block;
}

.helios-ui-subpanel__body {
  padding: 8px;
  border-top: 1px solid color-mix(in srgb, var(--helios-ui-border) 65%, transparent);
}

.helios-ui-subpanel[data-collapsed="true"] .helios-ui-subpanel__body { display: none; }
`;

export function ensureDefaultStyles(doc = document) {
  if (!doc || doc.getElementById(DEFAULT_STYLE_ELEMENT_ID)) return;
  const style = doc.createElement('style');
  style.id = DEFAULT_STYLE_ELEMENT_ID;
  style.textContent = defaultStylesText;
  doc.head.appendChild(style);
}
