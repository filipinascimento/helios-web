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

  position: absolute;
  inset: 0;
  z-index: var(--helios-ui-z);
  font: 400 var(--helios-ui-font-size)/1.35 var(--helios-ui-font);
  color: var(--helios-ui-fg);
  pointer-events: none;
}

.helios-ui[data-theme="dark"] {
  --helios-ui-bg: rgba(12, 14, 18, 0.72);
  --helios-ui-bg-solid: rgba(12, 14, 18, 0.94);
  --helios-ui-fg: rgba(244, 246, 250, 0.92);
  --helios-ui-muted: rgba(244, 246, 250, 0.62);
  --helios-ui-accent: #7c5cff;
  --helios-ui-accent-contrast: #ffffff;
}

.helios-ui[data-theme="light"] {
  --helios-ui-bg: rgba(250, 251, 252, 0.78);
  --helios-ui-bg-solid: rgba(250, 251, 252, 0.97);
  --helios-ui-fg: rgba(12, 14, 18, 0.92);
  --helios-ui-muted: rgba(12, 14, 18, 0.62);
  --helios-ui-accent: #5b3bff;
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
  border: 1px solid var(--helios-ui-border);
  border-radius: 10px;
  padding: 4px 6px;
  background: color-mix(in srgb, var(--helios-ui-bg-solid) 85%, transparent);
  color: inherit;
  font: inherit;
  line-height: 1;
}

.helios-ui-button:hover {
  border-color: color-mix(in srgb, var(--helios-ui-fg) 18%, transparent);
}

.helios-ui-button:active {
  transform: translateY(0.5px);
}

.helios-ui-panel__body {
  padding: 7px;
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

.helios-ui-label {
  display: grid;
  gap: 2px;
}

.helios-ui-label__title { font-weight: 500; }
.helios-ui-label__hint { color: var(--helios-ui-muted); font-size: 11px; }

.helios-ui-value {
  font-variant-numeric: tabular-nums;
  color: var(--helios-ui-muted);
  min-width: 3.5em;
  text-align: right;
}

.helios-ui-number {
  width: 86px;
  padding: 4px 6px;
  border-radius: 10px;
  border: 1px solid var(--helios-ui-border);
  background: color-mix(in srgb, var(--helios-ui-bg-solid) 85%, transparent);
  color: inherit;
  font: inherit;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.helios-ui-number:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--helios-ui-accent) 55%, var(--helios-ui-border));
}

.helios-ui-number:disabled {
  opacity: 0.55;
}

.helios-ui-slider {
  width: 100%;
  accent-color: var(--helios-ui-accent);
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

.helios-ui-dock--left { left: 0; }
.helios-ui-dock--right { right: 0; align-items: flex-end; }
.helios-ui-dock--bottom { justify-content: flex-end; }

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
  flex-wrap: wrap;
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
  cursor: default;
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
