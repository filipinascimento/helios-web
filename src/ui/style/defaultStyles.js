/**
 * DOM id used for the injected default Helios UI stylesheet.
 *
 * @public
 * @apiSection User Interface
 */
export const DEFAULT_STYLE_ELEMENT_ID = 'helios-ui-default-styles';

/**
 * Default CSS text for the optional Helios UI controls.
 *
 * @public
 * @apiSection User Interface
 */
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
  --helios-ui-rule-keyword-width: 56px;
  --helios-ui-danger: #dc2626;
  --helios-ui-status-success: #16a34a;
  --helios-ui-status-running: #f59e0b;
  --helios-ui-status-error: #dc2626;

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
  --helios-ui-dock-fill: color-mix(in srgb, var(--helios-ui-bg-solid) 88%, white 12%);
  --helios-ui-fg: rgba(244, 246, 250, 0.92);
  --helios-ui-muted: rgba(244, 246, 250, 0.62);
  --helios-ui-accent: #38bdf8;
  --helios-ui-accent-contrast: #ffffff;
  --helios-ui-text-outline: rgba(5, 7, 10, 0.8);
}

.helios-ui[data-theme="light"] {
  --helios-ui-bg: rgba(250, 251, 252, 0.78);
  --helios-ui-bg-solid: rgba(250, 251, 252, 0.97);
  --helios-ui-dock-fill: color-mix(in srgb, var(--helios-ui-bg-solid) 94%, black 6%);
  --helios-ui-fg: rgba(12, 14, 18, 0.92);
  --helios-ui-muted: rgba(12, 14, 18, 0.62);
  --helios-ui-accent: #0ea5e9;
  --helios-ui-accent-contrast: #ffffff;
  --helios-ui-shadow: 0 12px 30px rgba(0, 0, 0, 0.12);
  --helios-ui-text-outline: rgba(255, 255, 255, 0.88);
}

.helios-ui * { box-sizing: border-box; }

.helios-ui-interface-surface {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.helios-ui-interface-dock-toggle,
.helios-ui-interface-fullscreen-bar,
.helios-ui-resume-prompt {
  pointer-events: auto;
}

.helios-ui-interface-dock-toggle[hidden],
.helios-ui-interface-fullscreen-bar[hidden],
.helios-ui-resume-prompt[hidden] {
  display: none !important;
}

.helios-ui-interface-dock-toggle {
  position: absolute;
  top: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 36px;
  min-height: 36px;
  padding: 0;
  border-radius: 0;
  z-index: 999;
  border: 1px solid var(--helios-ui-border);
  border-top: 0;
  background: color-mix(in srgb, var(--helios-ui-bg) 88%, var(--helios-ui-bg-solid));
  color: color-mix(in srgb, var(--helios-ui-fg) 88%, transparent);
  box-shadow: none;
  -webkit-backdrop-filter: blur(calc(var(--helios-ui-blur) * 0.7));
  backdrop-filter: blur(calc(var(--helios-ui-blur) * 0.7));
  cursor: pointer;
}

.helios-ui-interface-dock-toggle:hover {
  border-color: color-mix(in srgb, var(--helios-ui-fg) 18%, transparent);
  background: color-mix(in srgb, var(--helios-ui-bg-solid) 96%, transparent);
}

.helios-ui-interface-fullscreen-bar {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  display: inline-flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0;
  width: 40px;
  pointer-events: auto;
  background: transparent;
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
}

.helios-ui[data-interface-mode="fullscreen"][data-controls-open="true"] .helios-ui-interface-fullscreen-bar {
  background: color-mix(in srgb, var(--helios-ui-bg-solid) 82%, transparent);
  -webkit-backdrop-filter: blur(calc(var(--helios-ui-blur) * 0.8));
  backdrop-filter: blur(calc(var(--helios-ui-blur) * 0.8));
}

.helios-ui-interface-bar__button--icon {
  width: 28px !important;
  height: 28px !important;
  min-width: 28px !important;
  min-height: 28px !important;
  margin: 4px auto 0 !important;
  padding: 0 !important;
  border-radius: 8px !important;
  border: 1px solid var(--helios-ui-border) !important;
  background: var(--helios-ui-bg) !important;
  box-shadow: none !important;
  -webkit-backdrop-filter: blur(calc(var(--helios-ui-blur) * 0.7));
  backdrop-filter: blur(calc(var(--helios-ui-blur) * 0.7));
}

.helios-ui-interface-bar__button--icon:hover {
  border-color: color-mix(in srgb, var(--helios-ui-fg) 12%, var(--helios-ui-border)) !important;
  background: var(--helios-ui-bg) !important;
}

.helios-ui-interface-icon {
  width: 20px;
  height: 20px;
  opacity: 0.96;
}

.helios-ui-fullscreen-panel-nav {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 0;
  flex: 1 1 auto;
  width: 100%;
  padding: 0;
  border-radius: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
}

.helios-ui-fullscreen-panel-nav[hidden] {
  display: none !important;
}

.helios-ui-fullscreen-panel-nav__button {
  width: 100%;
  height: 34px;
  min-width: 0;
  min-height: 34px;
  margin: 0;
  padding: 0 !important;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  color: color-mix(in srgb, var(--helios-ui-fg) 94%, transparent);
  box-shadow: none !important;
  outline: none !important;
  appearance: none;
}

.helios-ui-fullscreen-panel-nav__button:hover {
  background: transparent !important;
}

.helios-ui-fullscreen-panel-nav__button[data-active="true"] {
  background: linear-gradient(90deg, color-mix(in srgb, var(--helios-ui-accent) 88%, transparent) 0 2px, transparent 2px);
}

.helios-ui-fullscreen-panel-nav__icon {
  width: 22px;
  height: 22px;
}

.helios-ui[data-compact-dock-side="right"] .helios-ui-interface-dock-toggle {
  right: var(--helios-ui-right-dock-width, 0px);
  transform: translateX(1px);
  border-left: 0;
  border-top-left-radius: 10px;
  border-bottom-left-radius: 10px;
}

.helios-ui:not([data-compact-dock-side="right"]) .helios-ui-interface-dock-toggle {
  left: var(--helios-ui-left-dock-width, 0px);
  transform: translateX(-1px);
  border-right: 0;
  border-top-right-radius: 10px;
  border-bottom-right-radius: 10px;
}

.helios-ui-resume-prompt {
  position: absolute;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: min(560px, calc(100% - 32px));
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid var(--helios-ui-border);
  background: color-mix(in srgb, var(--helios-ui-bg-solid) 92%, transparent);
  box-shadow: var(--helios-ui-shadow);
}

.helios-ui-resume-prompt[hidden] {
  display: none;
}

.helios-ui-resume-prompt__text {
  flex: 1 1 auto;
}

.helios-ui-resume-prompt__actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.helios-ui[data-interface-mode="fullscreen"] .helios-ui-dock {
  display: none;
}

.helios-ui-fullscreen-flow {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 0 0 max(16px, env(safe-area-inset-bottom, 0px)) 0;
  min-height: 0;
  pointer-events: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.helios-ui[data-interface-mode="fullscreen"][data-controls-open="true"] .helios-ui-fullscreen-flow {
  padding-left: 40px;
}

.helios-ui-fullscreen-flow[hidden] {
  display: none;
}

.helios-ui[data-interface-mode="fullscreen"][data-controls-open="true"] .helios-ui-fullscreen-flow {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--helios-ui-bg-solid) 18%, transparent), color-mix(in srgb, var(--helios-ui-bg-solid) 8%, transparent) 22%, transparent 56%);
}

.helios-ui[data-interface-mode="fullscreen"] .helios-ui-panel {
  transition:
    opacity 140ms ease,
    transform 140ms ease,
    background-color 140ms ease,
    border-color 140ms ease,
    backdrop-filter 140ms ease;
}

.helios-ui[data-interface-mode="fullscreen"] .helios-ui-panel[data-interface-visible="false"] {
  opacity: 0;
  pointer-events: none;
  visibility: hidden;
}

.helios-ui[data-interface-mode="fullscreen"] .helios-ui-fullscreen-flow > .helios-ui-panel[data-interface-visible="true"] {
  position: relative !important;
  inset: auto !important;
  left: auto !important;
  top: auto !important;
  right: auto !important;
  bottom: auto !important;
  width: 100% !important;
  max-width: none !important;
  max-height: none !important;
  min-width: 0 !important;
  flex: 0 0 auto !important;
  z-index: auto !important;
  border-radius: 0 !important;
  border-left-width: 0 !important;
  border-right-width: 0 !important;
  border-top-width: 0 !important;
  box-shadow: none !important;
}

.helios-ui[data-interface-mode="fullscreen"][data-focused-control="true"][data-focused-control-scope="row"] .helios-ui-fullscreen-flow > .helios-ui-panel[data-interface-visible="true"] {
  background: transparent !important;
  border-color: transparent !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
  box-shadow: none !important;
}

.helios-ui[data-interface-mode="fullscreen"][data-focused-control="true"][data-focused-control-scope="row"] .helios-ui-fullscreen-flow > .helios-ui-panel[data-interface-visible="true"]:not(:has([data-control-focus-active="true"])) {
  opacity: 0.02 !important;
}

.helios-ui[data-interface-mode="fullscreen"][data-focused-control="true"][data-focused-control-scope="row"] .helios-ui-fullscreen-flow > .helios-ui-panel[data-interface-visible="true"]:has([data-control-focus-active="true"]) {
  opacity: 1 !important;
}

.helios-ui[data-interface-mode="fullscreen"][data-focused-control="true"][data-focused-control-scope="row"] .helios-ui-interface-fullscreen-bar {
  opacity: 0;
  pointer-events: none;
}

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
  container-type: inline-size;
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
  position: relative;
  overflow: hidden;
}

.helios-ui-panel__header::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0;
}

.helios-ui-panel__header[data-nav-shine="true"]::after {
  opacity: 1;
  background: linear-gradient(
    102deg,
    transparent 0%,
    transparent 24%,
    color-mix(in srgb, var(--helios-ui-accent) 18%, transparent) 38%,
    color-mix(in srgb, var(--helios-ui-accent) 56%, white 12%) 50%,
    color-mix(in srgb, var(--helios-ui-accent) 22%, transparent) 62%,
    transparent 78%,
    transparent 100%
  );
  transform: translateX(-130%);
  animation: helios-ui-panel-nav-shine 1280ms cubic-bezier(0.2, 0.76, 0.18, 1) forwards;
}

.helios-ui-panel__header[data-nav-shine="true"] {
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--helios-ui-accent) 34%, transparent),
    inset 0 0 24px color-mix(in srgb, var(--helios-ui-accent) 10%, transparent);
}

.helios-ui-panel__title-wrap {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  flex: 1;
  min-width: 0;
}

.helios-ui-panel__title-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 17px;
  height: 17px;
  flex: none;
  color: color-mix(in srgb, var(--helios-ui-accent) 72%, var(--helios-ui-fg));
}

.helios-ui-panel__title-icon[hidden] {
  display: none !important;
}

.helios-ui-panel__title-icon svg {
  width: 15px;
  height: 15px;
}

.helios-ui-panel__title {
  flex: 1;
  min-width: 0;
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  white-space: nowrap;
  border: 1px solid color-mix(in srgb, var(--helios-ui-accent) 38%, var(--helios-ui-border));
  border-radius: 10px;
  padding: 4px 6px;
  background: color-mix(in srgb, var(--helios-ui-accent) 16%, var(--helios-ui-bg-solid));
  color: inherit;
  font: inherit;
  font-weight: 600;
  line-height: 1;
}

.helios-ui-button--danger {
  border-color: color-mix(in srgb, var(--helios-ui-danger) 56%, var(--helios-ui-border));
  background: color-mix(in srgb, var(--helios-ui-danger) 18%, var(--helios-ui-bg-solid));
}

.helios-ui-button--spinning {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.helios-ui-button--spinning::before {
  content: '';
  width: 12px;
  height: 12px;
  border-radius: 999px;
  border: 1.5px solid transparent;
  border-top-color: currentColor;
  border-right-color: currentColor;
  opacity: 0.9;
  animation: helios-ui-spin 0.8s linear infinite;
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

.helios-ui-button__icon--spinning {
  animation: helios-ui-spin 0.8s linear infinite;
}

.helios-ui-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

@keyframes helios-ui-spin {
  to { transform: rotate(360deg); }
}

@keyframes helios-ui-panel-nav-shine {
  0% {
    opacity: 0;
    transform: translateX(-130%);
  }

  22% {
    opacity: 1;
  }

  100% {
    opacity: 0;
    transform: translateX(135%);
  }
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

.helios-ui-layout__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.helios-ui-layout__status-shell {
  width: 100%;
  min-height: 34px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 38px;
  align-items: stretch;
  border: 1px solid var(--helios-ui-border);
  border-radius: 14px;
  overflow: hidden;
  background: color-mix(in srgb, var(--helios-ui-bg-solid) 78%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--helios-ui-fg) 2%, transparent);
}

.helios-ui-layout__status-visual {
  position: relative;
  min-width: 0;
  min-height: 34px;
  padding: 3px 7px 4px;
  background:
    linear-gradient(to top, color-mix(in srgb, var(--helios-ui-fg) 2%, transparent), transparent 55%),
    color-mix(in srgb, var(--helios-ui-bg-solid) 78%, transparent);
}

.helios-ui-layout__status-visual[data-state="running"] {
  background:
    linear-gradient(to top, color-mix(in srgb, var(--helios-ui-status-success) 4%, transparent), transparent 55%),
    color-mix(in srgb, var(--helios-ui-bg-solid) 78%, transparent);
}

.helios-ui-layout__status-visual[data-state="stopped"] {
  background:
    linear-gradient(to top, color-mix(in srgb, var(--helios-ui-status-running) 4%, transparent), transparent 55%),
    color-mix(in srgb, var(--helios-ui-bg-solid) 78%, transparent);
}

.helios-ui-layout__status-visual[data-state="idle"] {
  background:
    linear-gradient(to top, color-mix(in srgb, var(--helios-ui-status-running) 10%, transparent), transparent 55%),
    color-mix(in srgb, var(--helios-ui-bg-solid) 78%, transparent);
}

.helios-ui-layout__status-badge {
  position: absolute;
  top: 4px;
  right: 8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  z-index: 1;
  color: color-mix(in srgb, var(--helios-ui-fg) 90%, #f3e8ff 10%);
}

.helios-ui-layout__status-temp {
  position: absolute;
  left: 9px;
  bottom: 5px;
  z-index: 1;
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
  letter-spacing: 0.01em;
  color: color-mix(in srgb, var(--helios-ui-accent) 72%, white 24%);
  text-shadow:
    0 1px 0 var(--helios-ui-text-outline),
    0 -1px 0 var(--helios-ui-text-outline),
    1px 0 0 var(--helios-ui-text-outline),
    -1px 0 0 var(--helios-ui-text-outline),
    0 0 3px color-mix(in srgb, var(--helios-ui-text-outline) 70%, transparent);
  pointer-events: none;
}

.helios-ui-layout__status-button {
  appearance: none;
  display: grid;
  place-items: center;
  width: 100%;
  min-width: 0;
  min-height: 34px;
  padding: 0;
  border: 0;
  border-left: 1px solid var(--helios-ui-border);
  background: color-mix(in srgb, var(--helios-ui-bg-solid) 78%, transparent);
  color: color-mix(in srgb, var(--helios-ui-fg) 90%, white 10%);
  cursor: pointer;
}

.helios-ui-layout__status-button[data-state="running"] {
  background: color-mix(in srgb, var(--helios-ui-danger) 24%, var(--helios-ui-bg-solid));
}

.helios-ui-layout__status-button[data-state="stopped"] {
  background: color-mix(in srgb, var(--helios-ui-status-running) 22%, var(--helios-ui-bg-solid));
}

.helios-ui-layout__status-button[data-state="idle"] {
  background: color-mix(in srgb, var(--helios-ui-danger) 24%, var(--helios-ui-bg-solid));
}

.helios-ui-layout__status-button:hover {
  filter: brightness(1.04);
}

.helios-ui-layout__status-button:active {
  filter: brightness(0.98);
}

.helios-ui-layout__status-button:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--helios-ui-accent) 32%, transparent);
}

.helios-ui-layout__status-button-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transform: translateX(-1px);
}

.helios-ui-layout__status-button .helios-ui-button__icon {
  width: 24px;
  height: 24px;
  opacity: 0.92;
}

.helios-ui-layout__status-spinner {
  width: 10px;
  height: 10px;
  flex: none;
  opacity: 0.88;
  animation: helios-ui-spin 0.8s linear infinite;
}

.helios-ui-layout__display {
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  padding: 0 10px;
  border-radius: 10px;
  border: 1px solid var(--helios-ui-border);
  background: color-mix(in srgb, var(--helios-ui-bg-solid) 82%, transparent);
  color: inherit;
}

.helios-ui-layout__display-stack {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: min(220px, 100%);
}

.helios-ui-layout__status-text {
  color: var(--helios-ui-fg);
  text-align: right;
  white-space: nowrap;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.01em;
  text-shadow:
    0 1px 0 var(--helios-ui-text-outline),
    0 -1px 0 var(--helios-ui-text-outline),
    1px 0 0 var(--helios-ui-text-outline),
    -1px 0 0 var(--helios-ui-text-outline),
    0 0 3px color-mix(in srgb, var(--helios-ui-text-outline) 70%, transparent);
}

.helios-ui-layout__status-text[data-state="running"] {
  color: color-mix(in srgb, var(--helios-ui-fg) 88%, var(--helios-ui-status-success) 12%);
}

.helios-ui-layout__status-text[data-state="stopped"] {
  color: color-mix(in srgb, var(--helios-ui-fg) 82%, #f2b7bf 18%);
}

.helios-ui-layout__status-text[data-state="idle"] {
  color: color-mix(in srgb, var(--helios-ui-fg) 84%, var(--helios-ui-status-running) 16%);
}

.helios-ui-layout__status[data-state="running"] {
  border-color: color-mix(in srgb, var(--helios-ui-status-running) 56%, var(--helios-ui-border));
  background: color-mix(in srgb, var(--helios-ui-status-running) 18%, var(--helios-ui-bg-solid));
}

.helios-ui-layout__status[data-state="error"] {
  border-color: color-mix(in srgb, var(--helios-ui-status-error) 56%, var(--helios-ui-border));
  background: color-mix(in srgb, var(--helios-ui-status-error) 18%, var(--helios-ui-bg-solid));
}

.helios-ui-layout__status[data-state="idle"] {
  border-color: color-mix(in srgb, var(--helios-ui-status-running) 44%, var(--helios-ui-border));
  background: color-mix(in srgb, var(--helios-ui-status-running) 12%, var(--helios-ui-bg-solid));
}

.helios-ui-layout__bindings {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.helios-ui-layout__sparkline {
  display: block;
  width: 100%;
  height: 28px;
  border-radius: 8px;
  border: 1px solid var(--helios-ui-border);
  background:
    linear-gradient(to top, color-mix(in srgb, var(--helios-ui-fg) 4%, transparent), color-mix(in srgb, var(--helios-ui-fg) 1%, transparent)),
    color-mix(in srgb, var(--helios-ui-bg-solid) 72%, transparent);
  overflow: hidden;
}

.helios-ui-layout__sparkline path {
  stroke: color-mix(in srgb, var(--helios-ui-accent) 88%, white 8%);
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.helios-ui-layout__sparkline--status {
  position: absolute;
  inset: 0;
  height: 100%;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.helios-ui-layout__sparkline--status path {
  stroke-width: 1.8;
}

.helios-ui-layout__empty {
  color: var(--helios-ui-muted);
  font-size: 12px;
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

.helios-ui-attributes-table-wrap {
  border: 1px solid var(--helios-ui-border);
  border-radius: 10px;
  overflow: auto;
  background: color-mix(in srgb, var(--helios-ui-bg-solid) 82%, transparent);
}

.helios-ui-attributes-table {
  width: 100%;
  border-collapse: collapse;
  font: inherit;
}

.helios-ui-attributes-table th,
.helios-ui-attributes-table td {
  padding: 6px 8px;
  text-align: left;
  white-space: nowrap;
  border-bottom: 1px solid color-mix(in srgb, var(--helios-ui-border) 76%, transparent);
}

.helios-ui-attributes-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: color-mix(in srgb, var(--helios-ui-bg-solid) 94%, transparent);
  font-weight: 700;
}

.helios-ui-attributes-table tbody tr:last-child td {
  border-bottom: 0;
}

.helios-ui-dialog {
  width: min(320px, calc(100vw - 32px));
  margin: auto;
  padding: 12px;
  border: 1px solid var(--helios-ui-border);
  border-radius: 14px;
  background: var(--helios-ui-bg-solid);
  color: inherit;
  box-shadow: var(--helios-ui-shadow);
}

.helios-ui-dialog::backdrop {
  background: rgba(0, 0, 0, 0.28);
}

.helios-ui-dialog__title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 700;
}

.helios-ui-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}

.helios-ui-select:hover {
  border-color: color-mix(in srgb, var(--helios-ui-fg) 18%, transparent);
}

.helios-ui-select:disabled {
  cursor: not-allowed;
  color: color-mix(in srgb, var(--helios-ui-muted) 98%, transparent);
  border-color: color-mix(in srgb, var(--helios-ui-border) 72%, black 28%);
  background:
    linear-gradient(45deg, transparent 50%, color-mix(in srgb, var(--helios-ui-muted) 35%, transparent) 50%) right 12px center/6px 6px no-repeat,
    linear-gradient(135deg, color-mix(in srgb, var(--helios-ui-muted) 35%, transparent) 50%, transparent 50%) right 8px center/6px 6px no-repeat,
    repeating-linear-gradient(
      -45deg,
      color-mix(in srgb, var(--helios-ui-bg-solid) 90%, black 10%) 0 6px,
      color-mix(in srgb, var(--helios-ui-bg-solid) 80%, black 20%) 6px 12px
    );
  box-shadow: inset 0 0 0 1px color-mix(in srgb, black 24%, transparent);
}

.helios-ui-select:disabled:hover {
  border-color: color-mix(in srgb, var(--helios-ui-border) 72%, black 28%);
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

.helios-ui-rule-keyword {
  width: var(--helios-ui-rule-keyword-width);
  flex: 0 0 var(--helios-ui-rule-keyword-width);
  font-size: 12px;
  color: var(--helios-ui-muted);
  text-align: right;
  white-space: nowrap;
}

.helios-ui-number {
  width: 66px;
  flex: 0 1 66px;
  min-width: 52px;
  max-width: 100%;
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
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
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

.helios-ui-segmented-toggle {
  display: inline-grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  align-items: stretch;
  gap: 1px;
  padding: 2px;
  border-radius: 999px;
  border: 1px solid var(--helios-ui-border);
  background: color-mix(in srgb, var(--helios-ui-bg-solid) 84%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--helios-ui-fg) 3%, transparent);
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

.helios-ui-segmented-toggle[aria-disabled="true"] {
  opacity: 0.56;
}

.helios-ui-segmented-toggle__option {
  min-width: 0;
  min-height: 28px;
  padding: 5px 10px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--helios-ui-muted);
  font: inherit;
  font-weight: 600;
  letter-spacing: 0.01em;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 140ms ease, color 140ms ease, box-shadow 140ms ease;
}

.helios-ui-segmented-toggle__option:hover {
  color: var(--helios-ui-fg);
}

.helios-ui-segmented-toggle__option[data-selected="true"] {
  background: color-mix(in srgb, var(--helios-ui-accent) 22%, var(--helios-ui-bg-solid));
  color: var(--helios-ui-fg);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--helios-ui-accent) 28%, transparent);
}

.helios-ui-segmented-toggle__option:focus-visible {
  outline: none;
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--helios-ui-accent) 28%, transparent),
    0 0 0 2px color-mix(in srgb, var(--helios-ui-accent) 28%, transparent);
}

.helios-ui-number::-webkit-outer-spin-button,
.helios-ui-number::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.helios-ui-row--slider .helios-ui-number {
  width: 72px;
  flex-basis: 72px;
  min-width: 58px;
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
  background-position: 0 0;
  background-size: 100% 100%;
  background-clip: padding-box;
  background-color: transparent;
  background-image: linear-gradient(90deg, rgba(120, 120, 120, 1), rgba(40, 40, 40, 1));
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
  cursor: default;
  user-select: none;
}

.helios-ui-colormap-picker {
  position: relative;
}

.helios-ui-colormap-picker__preview {
  cursor: pointer;
  user-select: none;
}

.helios-ui-colormap-popover {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 2147483000;
  pointer-events: auto;
}

.helios-ui-colormap-popover__panel {
  border: 1px solid var(--helios-ui-border);
  border-radius: 10px;
  padding: 0;
  background: color-mix(in srgb, var(--helios-ui-bg-solid) 92%, transparent);
  overflow: hidden;
  box-shadow: var(--helios-ui-shadow);
  display: flex;
  flex-direction: column;
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

.helios-ui-colormap-popover__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 7px;
}

.helios-ui-colormap-popover__filter {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 22px;
  padding: 2px 8px;
  border-radius: 8px;
  border: 1px solid var(--helios-ui-border);
  background: color-mix(in srgb, var(--helios-ui-bg-solid) 84%, transparent);
  color: inherit;
  font: 600 11px/1.2 var(--helios-ui-font);
  cursor: pointer;
  user-select: none;
}

.helios-ui-colormap-popover__filter[data-active="true"] {
  border-color: color-mix(in srgb, var(--helios-ui-accent) 58%, var(--helios-ui-border));
  background: color-mix(in srgb, var(--helios-ui-accent) 18%, var(--helios-ui-bg-solid));
  color: color-mix(in srgb, var(--helios-ui-accent) 82%, var(--helios-ui-fg));
}

.helios-ui-colormap-popover__list {
  padding: 0;
  overflow: auto;
  flex: 1 1 auto;
  min-height: 0;
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
  user-select: none;
}

.helios-ui-colormap-picker__item:hover {
  background: color-mix(in srgb, var(--helios-ui-fg) 8%, transparent);
  border-color: color-mix(in srgb, var(--helios-ui-fg) 14%, transparent);
}

.helios-ui-colormap-picker__item[data-selected="true"] {
  background: color-mix(in srgb, var(--helios-ui-accent) 16%, transparent);
  border-color: color-mix(in srgb, var(--helios-ui-accent) 42%, var(--helios-ui-border));
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
  user-select: none;
}

.helios-ui-colormap-section__body {
  display: grid;
  gap: 2px;
  padding: 0 4px;
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
  --helios-ui-slider-thumb: 16px;

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
  width: 100%;
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

.helios-ui-light-direction {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  width: min(164px, 100%);
  min-width: 0;
}

.helios-ui-light-direction__pad {
  appearance: none;
  width: 76px;
  height: 76px;
  padding: 0;
  border: 1px solid var(--helios-ui-border);
  border-radius: 8px;
  background:
    radial-gradient(circle at 34% 28%, color-mix(in srgb, var(--helios-ui-fg) 18%, transparent), transparent 26%),
    radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--helios-ui-accent) 18%, var(--helios-ui-bg-solid)) 0, color-mix(in srgb, var(--helios-ui-bg-solid) 86%, transparent) 62%, color-mix(in srgb, var(--helios-ui-fg) 8%, transparent) 100%);
  color: inherit;
  cursor: crosshair;
  touch-action: none;
}

.helios-ui-light-direction__pad:disabled {
  opacity: 0.55;
  cursor: default;
}

.helios-ui-light-direction__pad:focus-visible {
  outline: none;
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--helios-ui-accent) 22%, transparent);
}

.helios-ui-light-direction__sphere {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.helios-ui-light-direction__outline,
.helios-ui-light-direction__latitude {
  fill: none;
  stroke: color-mix(in srgb, var(--helios-ui-fg) 28%, transparent);
  stroke-width: 1.2;
}

.helios-ui-light-direction__latitude {
  stroke: color-mix(in srgb, var(--helios-ui-fg) 16%, transparent);
}

.helios-ui-light-direction__ray {
  stroke: color-mix(in srgb, var(--helios-ui-accent) 86%, var(--helios-ui-fg));
  stroke-width: 2;
  stroke-linecap: round;
  stroke-dasharray: 4 4;
}

.helios-ui-light-direction--axis .helios-ui-light-direction__ray {
  stroke-dasharray: none;
}

.helios-ui-light-direction__center {
  fill: color-mix(in srgb, var(--helios-ui-fg) 78%, transparent);
}

.helios-ui-light-direction--axis .helios-ui-light-direction__center {
  fill: color-mix(in srgb, var(--helios-ui-accent) 70%, var(--helios-ui-fg));
}

.helios-ui-light-direction__handle {
  fill: color-mix(in srgb, var(--helios-ui-accent) 92%, var(--helios-ui-bg-solid));
  stroke: color-mix(in srgb, var(--helios-ui-accent) 40%, var(--helios-ui-fg));
  stroke-width: 1.5;
}

.helios-ui-light-direction__axis-arrow {
  display: none;
  fill: color-mix(in srgb, var(--helios-ui-accent) 92%, var(--helios-ui-bg-solid));
  stroke: color-mix(in srgb, var(--helios-ui-accent) 40%, var(--helios-ui-fg));
  stroke-width: 1.2;
  stroke-linejoin: round;
}

.helios-ui-light-direction--axis .helios-ui-light-direction__axis-arrow {
  display: block;
}

.helios-ui-light-direction__handle-group--back {
  display: none;
}

.helios-ui-light-direction--axis .helios-ui-light-direction__handle-group--back {
  display: block;
}

.helios-ui-light-direction__handle-group[data-back="true"] .helios-ui-light-direction__handle,
.helios-ui-light-direction__pad[data-back="true"] .helios-ui-light-direction__ray {
  opacity: 0.62;
}

.helios-ui-light-direction--axis .helios-ui-light-direction__pad[data-back="true"] .helios-ui-light-direction__ray {
  opacity: 1;
}

.helios-ui-light-direction__fields {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.helios-ui-light-direction__fields .helios-ui-number {
  width: 68px;
  min-width: 0;
  padding: 2px 4px;
  border-radius: 8px;
  font-size: 11px;
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
  gap: 16px;
  align-items: center;
  width: 100%;
}

.helios-ui-range2__values .helios-ui-number {
  flex: 0 1 min(132px, calc(50% - 8px));
  width: min(132px, calc(50% - 8px));
  max-width: 132px;
}

.helios-ui-range2__values .helios-ui-number:last-child {
  text-align: right;
}

@container (max-width: 280px) {
  .helios-ui-row--aligned {
    grid-template-columns: minmax(0, 1fr);
  }

  .helios-ui-label {
    justify-items: start;
    text-align: left;
  }

  .helios-ui-label__title-row {
    justify-content: flex-start;
  }

  .helios-ui-row__controls {
    justify-content: stretch;
  }
}

.helios-ui-range2__histogram {
  position: relative;
  width: 100%;
  height: 26px;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 2px;
  align-items: end;
  box-sizing: border-box;
  overflow: visible;
  --helios-ui-range2-thumb: var(--helios-ui-slider-thumb, 12px);
  --helios-ui-range2-marker-w: 2px;
  padding: 2px calc(var(--helios-ui-range2-thumb) / 2);
  border-radius: 6px;
  background: color-mix(in srgb, var(--helios-ui-fg) 6%, transparent);
}

.helios-ui-range2__histogram-bin {
  width: 100%;
  border-radius: 4px 4px 2px 2px;
  background: color-mix(in srgb, var(--helios-ui-fg) 32%, transparent);
  opacity: 0.9;
}

.helios-ui-range2__histogram-marker {
  position: absolute;
  top: 2px;
  bottom: 2px;
  width: var(--helios-ui-range2-marker-w);
  border-radius: 999px;
  background: color-mix(in srgb, var(--helios-ui-accent) 92%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--helios-ui-border) 60%, transparent);
  pointer-events: none;
  transform: translateX(calc(var(--helios-ui-range2-marker-w) / -2));
}

.helios-ui-dock {
  position: absolute;
  top: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
  overflow: hidden;
  max-height: 100%;
}

.helios-ui-dock--side {
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  pointer-events: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
}

.helios-ui[data-interface-mode="compact"] .helios-ui-dock--side {
  width: auto;
  max-width: min(60vw, 420px);
  padding-top: 0;
  background: var(--helios-ui-dock-fill);
  scrollbar-gutter: stable;
}

.helios-ui-dock--left { left: 0; padding-left: 0; }
.helios-ui-dock--right { right: 0; align-items: flex-end; padding-right: 0; }

.helios-ui-dock .helios-ui-panel {
  position: relative;
  max-height: none;
  flex: 0 0 auto;
}

.helios-ui-panel[data-responsive-mode="compact"],
.helios-ui-panel[data-responsive-mode="fullscreen"] {
  min-width: 0 !important;
  max-width: none !important;
}

.helios-ui-panel[data-responsive-mode="fullscreen"] {
  width: 100% !important;
  min-height: fit-content;
}

.helios-ui-panel[data-responsive-mode="compact"] .helios-ui-panel__header,
.helios-ui-panel[data-responsive-mode="fullscreen"] .helios-ui-panel__header {
  cursor: default;
}

.helios-ui-panel[data-responsive-mode="fullscreen"] .helios-ui-resize-handle {
  display: none;
}

.helios-ui-panel[data-responsive-mode="fullscreen"] .helios-ui-panel__body {
  overflow: auto;
  -webkit-overflow-scrolling: touch;
}

.helios-ui-panel[data-responsive-mode="compact"] .helios-ui-panel__body,
.helios-ui-panel[data-responsive-mode="compact"] .helios-ui-panel__header,
.helios-ui-panel[data-responsive-mode="fullscreen"] .helios-ui-panel__header,
.helios-ui-panel[data-responsive-mode="fullscreen"] .helios-ui-panel__body,
.helios-ui-panel[data-responsive-mode="fullscreen"] .helios-ui-row,
.helios-ui-panel[data-responsive-mode="fullscreen"] .helios-ui-layout__actions,
.helios-ui-panel[data-responsive-mode="fullscreen"] .helios-ui-network__actions,
.helios-ui-panel[data-responsive-mode="fullscreen"] .helios-ui-subpanel,
.helios-ui-panel[data-responsive-mode="fullscreen"] .helios-ui-subpanel__header,
.helios-ui-panel[data-responsive-mode="fullscreen"] .helios-ui-subpanel__body,
.helios-ui-panel[data-responsive-mode="fullscreen"] .helios-ui-tabs__bar,
.helios-ui-panel[data-responsive-mode="fullscreen"] .helios-ui-tabs__content,
.helios-ui-panel[data-responsive-mode="fullscreen"] .helios-ui-tabpanel,
.helios-ui-panel[data-responsive-mode="fullscreen"] .helios-ui-stack {
  transition:
    opacity 180ms ease,
    background-color 180ms ease,
    border-color 180ms ease,
    box-shadow 180ms ease,
    backdrop-filter 180ms ease;
}

.helios-ui[data-interface-mode="fullscreen"][data-focused-control="true"][data-focused-control-scope="row"] .helios-ui-panel__header,
.helios-ui[data-interface-mode="fullscreen"][data-focused-control="true"][data-focused-control-scope="row"] .helios-ui-panel__body,
.helios-ui[data-interface-mode="fullscreen"][data-focused-control="true"][data-focused-control-scope="row"] .helios-ui-subpanel,
.helios-ui[data-interface-mode="fullscreen"][data-focused-control="true"][data-focused-control-scope="row"] .helios-ui-subpanel__body,
.helios-ui[data-interface-mode="fullscreen"][data-focused-control="true"][data-focused-control-scope="row"] .helios-ui-tabs__bar,
.helios-ui[data-interface-mode="fullscreen"][data-focused-control="true"][data-focused-control-scope="row"] .helios-ui-tabs__content,
.helios-ui[data-interface-mode="fullscreen"][data-focused-control="true"][data-focused-control-scope="row"] .helios-ui-tabpanel,
.helios-ui[data-interface-mode="fullscreen"][data-focused-control="true"][data-focused-control-scope="row"] .helios-ui-stack {
  background: transparent !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
  box-shadow: none !important;
}

.helios-ui[data-interface-mode="fullscreen"][data-focused-control="true"][data-focused-control-scope="row"] .helios-ui-panel:has([data-control-focus-active="true"]) .helios-ui-panel__header,
.helios-ui[data-interface-mode="fullscreen"][data-focused-control="true"][data-focused-control-scope="row"] .helios-ui-panel:has([data-control-focus-active="true"]) .helios-ui-panel__body,
.helios-ui[data-interface-mode="fullscreen"][data-focused-control="true"][data-focused-control-scope="row"] .helios-ui-panel:has([data-control-focus-active="true"]) .helios-ui-subpanel,
.helios-ui[data-interface-mode="fullscreen"][data-focused-control="true"][data-focused-control-scope="row"] .helios-ui-panel:has([data-control-focus-active="true"]) .helios-ui-subpanel__body,
.helios-ui[data-interface-mode="fullscreen"][data-focused-control="true"][data-focused-control-scope="row"] .helios-ui-panel:has([data-control-focus-active="true"]) .helios-ui-tabs__bar,
.helios-ui[data-interface-mode="fullscreen"][data-focused-control="true"][data-focused-control-scope="row"] .helios-ui-panel:has([data-control-focus-active="true"]) .helios-ui-tabs__content,
.helios-ui[data-interface-mode="fullscreen"][data-focused-control="true"][data-focused-control-scope="row"] .helios-ui-panel:has([data-control-focus-active="true"]) .helios-ui-tabpanel,
.helios-ui[data-interface-mode="fullscreen"][data-focused-control="true"][data-focused-control-scope="row"] .helios-ui-panel:has([data-control-focus-active="true"]) .helios-ui-stack {
  border-color: transparent !important;
  box-shadow: none !important;
  background: transparent !important;
}

.helios-ui[data-interface-mode="fullscreen"][data-focused-control="true"][data-focused-control-scope="row"] .helios-ui-fullscreen-flow > .helios-ui-panel[data-interface-visible="true"]:has([data-control-focus-active="true"]) *:not(
  :has([data-control-focus-active="true"]),
  [data-control-focus-active="true"],
  [data-control-focus-active="true"] *
) {
  opacity: 0.02 !important;
  border-color: transparent !important;
  box-shadow: none !important;
  background: transparent !important;
}

.helios-ui[data-interface-mode="fullscreen"][data-focused-control="true"][data-focused-control-scope="row"] [data-control-focus-active="true"] {
  opacity: 1 !important;
  background: color-mix(in srgb, var(--helios-ui-bg-solid) 58%, transparent) !important;
  border-radius: 10px;
  -webkit-backdrop-filter: blur(10px) saturate(1.05);
  backdrop-filter: blur(10px) saturate(1.05);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--helios-ui-accent) 20%, transparent),
    0 8px 24px color-mix(in srgb, black 18%, transparent);
}

.helios-ui[data-interface-mode="fullscreen"][data-focused-control="true"][data-focused-control-scope="row"] [data-control-focus-active="true"],
.helios-ui[data-interface-mode="fullscreen"][data-focused-control="true"][data-focused-control-scope="row"] [data-control-focus-active="true"] * {
  opacity: 1 !important;
}

.helios-ui-panel[data-side-docked="true"] .helios-ui-panel__body {
  overflow: visible;
}

.helios-ui-panel[data-side-docked="true"] .helios-ui-panel__header {
  cursor: grab;
}

.helios-ui--dock-reordering,
.helios-ui--dock-reordering * {
  cursor: grabbing !important;
}

.helios-ui-panel--dock-source {
  opacity: 0.46;
}

.helios-ui-dock-drop-line {
  position: relative;
  z-index: 4;
  align-self: stretch;
  height: 6px;
  margin: 6px 8px;
  border-radius: 999px;
  border: 1px solid rgba(32, 32, 32, 0.38);
  background: rgba(176, 176, 176, 0.96);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.26),
    0 0 12px rgba(0, 0, 0, 0.32);
  flex: 0 0 auto;
  pointer-events: none;
}

.helios-ui-dock-drag-preview {
  position: absolute;
  left: 0;
  top: 0;
  pointer-events: none;
  z-index: calc(var(--helios-ui-z) + 250);
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--helios-ui-fg) 20%, transparent);
  background: color-mix(in srgb, var(--helios-ui-bg-solid) 92%, transparent);
  box-shadow:
    0 9px 24px rgba(0, 0, 0, 0.28),
    0 0 0 1px color-mix(in srgb, var(--helios-ui-accent) 28%, transparent);
  overflow: hidden;
}

.helios-ui-dock-drag-preview__header {
  display: flex;
  align-items: center;
  min-height: 28px;
  padding: 6px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--helios-ui-border) 75%, transparent);
  background: color-mix(in srgb, var(--helios-ui-bg-solid) 95%, transparent);
}

.helios-ui-dock-drag-preview__title {
  font-weight: 600;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
  gap: 6px;
}

.helios-ui-subpanel {
  border: 1px solid color-mix(in srgb, var(--helios-ui-border) 85%, transparent);
  border-radius: 10px;
  overflow: hidden;
  background: color-mix(in srgb, var(--helios-ui-bg-solid) 60%, transparent);
}

.helios-ui-subpanel__header-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.helios-ui-subpanel__header {
  width: auto;
  flex: 1 1 auto;
  min-width: 0;
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

.helios-ui-subpanel__header-controls {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding-right: 8px;
}

.helios-ui-subpanel__header-controls .helios-ui-button {
  padding: 3px 6px;
}

.helios-ui-subpanel__toggle {
  width: 1.1em;
  color: var(--helios-ui-muted);
  font-weight: 700;
  display: inline-block;
}

.helios-ui-subpanel__status {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  display: inline-block;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--helios-ui-fg) 14%, transparent);
}

.helios-ui-subpanel__status[hidden] {
  display: none !important;
}

.helios-ui-subpanel__status[data-state="idle"] {
  background: transparent;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--helios-ui-muted) 58%, transparent);
}

.helios-ui-subpanel__status[data-state="running"] {
  background: var(--helios-ui-status-running);
}

.helios-ui-subpanel__status[data-state="success"] {
  background: var(--helios-ui-status-success);
}

.helios-ui-subpanel__status[data-state="error"] {
  background: var(--helios-ui-status-error);
}

.helios-ui-subpanel__body {
  padding: 6px;
  border-top: 1px solid color-mix(in srgb, var(--helios-ui-border) 65%, transparent);
}

.helios-ui-figure-preview {
  display: grid;
  gap: 8px;
}

.helios-ui-figure-preview__viewport {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 132px;
  border: 1px solid color-mix(in srgb, var(--helios-ui-border) 85%, transparent);
  border-radius: 10px;
  overflow: hidden;
  background:
    linear-gradient(45deg, color-mix(in srgb, var(--helios-ui-fg) 5%, transparent) 25%, transparent 25%, transparent 75%, color-mix(in srgb, var(--helios-ui-fg) 5%, transparent) 75%),
    linear-gradient(45deg, color-mix(in srgb, var(--helios-ui-fg) 5%, transparent) 25%, transparent 25%, transparent 75%, color-mix(in srgb, var(--helios-ui-fg) 5%, transparent) 75%),
    color-mix(in srgb, var(--helios-ui-bg-solid) 84%, transparent);
  background-position: 0 0, 10px 10px, 0 0;
  background-size: 20px 20px, 20px 20px, auto;
}

.helios-ui-figure-preview__image {
  display: block;
  max-width: 100%;
  width: 100%;
  height: auto;
  object-fit: contain;
}

.helios-ui-figure-preview__status {
  color: var(--helios-ui-muted);
  font-size: 11.5px;
  line-height: 1.45;
  text-align: right;
}

.helios-ui-subpanel[data-collapsed="true"] .helios-ui-subpanel__body { display: none; }
`;

/**
 * Ensure the default Helios UI stylesheet is present in a document.
 *
 * @public
 * @apiSection User Interface
 * @param {Document} [doc=document] - Target document.
 * @returns {HTMLStyleElement|null} Existing or inserted stylesheet element.
 */
export function ensureDefaultStyles(doc = document) {
  if (!doc || doc.getElementById(DEFAULT_STYLE_ELEMENT_ID)) return;
  const style = doc.createElement('style');
  style.id = DEFAULT_STYLE_ELEMENT_ID;
  style.textContent = defaultStylesText;
  doc.head.appendChild(style);
}
