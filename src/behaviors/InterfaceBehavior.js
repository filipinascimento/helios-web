import { Behavior } from './Behavior.js';

const DEFAULT_OPTIONS = Object.freeze({
  compactBreakpoint: 1100,
  fullscreenBreakpoint: 720,
  preferredDockSide: 'left',
  restorePrompt: true,
});

function cloneSerializable(value) {
  if (Array.isArray(value)) return value.map((entry) => cloneSerializable(entry));
  if (value && typeof value === 'object') {
    const next = {};
    for (const [key, entry] of Object.entries(value)) next[key] = cloneSerializable(entry);
    return next;
  }
  return value;
}

function normalizeDockSide(value, fallback = DEFAULT_OPTIONS.preferredDockSide) {
  if (value === 'left' || value === 'right') return value;
  return fallback;
}

function normalizeNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeResumePrompt(value = {}) {
  if (!value || typeof value !== 'object') return null;
  const sessionId = typeof value.sessionId === 'string' ? value.sessionId : null;
  if (!sessionId) return null;
  return {
    visible: value.visible !== false,
    sessionId,
    status: typeof value.status === 'string' ? value.status : 'prompt',
    updatedAt: Number.isFinite(value.updatedAt) ? Number(value.updatedAt) : null,
    networkSource: value.networkSource && typeof value.networkSource === 'object'
      ? cloneSerializable(value.networkSource)
      : null,
  };
}

function normalizeInterfaceSnapshot(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    dockSide: normalizeDockSide(source.dockSide, DEFAULT_OPTIONS.preferredDockSide),
    viewportWidth: Number.isFinite(source.viewportWidth) ? Number(source.viewportWidth) : null,
    mode: typeof source.mode === 'string' ? source.mode : 'desktop',
    controlsOpen: source.controlsOpen === true,
    activePanelId: typeof source.activePanelId === 'string' ? source.activePanelId : null,
    focused: source.focused === true,
    interfaceVisible: source.interfaceVisible !== false,
    resumePrompt: normalizeResumePrompt(source.resumePrompt),
  };
}

function resolveMode(width, options) {
  const numericWidth = Number(width);
  if (!Number.isFinite(numericWidth)) return 'desktop';
  if (numericWidth <= Number(options.fullscreenBreakpoint)) return 'fullscreen';
  if (numericWidth <= Number(options.compactBreakpoint)) return 'compact';
  return 'desktop';
}

export class InterfaceBehavior extends Behavior {
  static id = 'interface';

  constructor(options = {}) {
    super({ ...DEFAULT_OPTIONS, ...(options && typeof options === 'object' ? options : {}) });
    this._preferencesLoaded = false;
    this._persistenceReady = null;
    this._uiReady = false;
    this.state = normalizeInterfaceSnapshot({
      dockSide: normalizeDockSide(options?.preferredDockSide, DEFAULT_OPTIONS.preferredDockSide),
      mode: 'desktop',
      controlsOpen: false,
      focused: false,
      interfaceVisible: true,
    });
  }

  attach(context) {
    super.attach(context);
    this._applyToUI();
    this.ensurePersistenceReady();
    this.emitChange('attach');
    return this;
  }

  update(options = {}) {
    super.update(options);
    this.options = {
      ...DEFAULT_OPTIONS,
      ...this.options,
      ...(options && typeof options === 'object' ? options : {}),
      preferredDockSide: normalizeDockSide(
        options?.preferredDockSide ?? this.options?.preferredDockSide ?? this.state.dockSide,
        this.state.dockSide,
      ),
    };
    if (Object.prototype.hasOwnProperty.call(options ?? {}, 'preferredDockSide')) {
      this.state = {
        ...this.state,
        dockSide: normalizeDockSide(options.preferredDockSide, this.state.dockSide),
      };
      this.persistResponsivePreferences();
    }
    this.recomputeMode({ silent: true });
    this._applyToUI();
    this.emitChange('options');
    return this;
  }

  bindUI(ui = null) {
    this._uiReady = Boolean(ui);
    this._applyToUI();
    return this;
  }

  compactBreakpoint(value) {
    if (arguments.length === 0) return normalizeNumber(this.options.compactBreakpoint, DEFAULT_OPTIONS.compactBreakpoint);
    this.update({ compactBreakpoint: normalizeNumber(value, this.options.compactBreakpoint) });
    return this;
  }

  fullscreenBreakpoint(value) {
    if (arguments.length === 0) return normalizeNumber(this.options.fullscreenBreakpoint, DEFAULT_OPTIONS.fullscreenBreakpoint);
    this.update({ fullscreenBreakpoint: normalizeNumber(value, this.options.fullscreenBreakpoint) });
    return this;
  }

  dockSide(value) {
    if (arguments.length === 0) return this.state.dockSide;
    const next = normalizeDockSide(value, this.state.dockSide);
    if (next === this.state.dockSide) return this;
    this.state = { ...this.state, dockSide: next };
    this.persistResponsivePreferences();
    this._applyToUI();
    this.emitChange('dock-side', { dockSide: next });
    return this;
  }

  toggleDockSide() {
    return this.dockSide(this.state.dockSide === 'left' ? 'right' : 'left');
  }

  mode() {
    return this.state.mode;
  }

  isCompact() {
    return this.state.mode === 'compact' || this.state.mode === 'fullscreen';
  }

  isFullscreen() {
    return this.state.mode === 'fullscreen';
  }

  viewportWidth() {
    return this.state.viewportWidth;
  }

  setViewportWidth(width, options = {}) {
    const numericWidth = Number(width);
    const nextWidth = Number.isFinite(numericWidth) ? numericWidth : null;
    const previousMode = this.state.mode;
    const nextMode = resolveMode(nextWidth, this.options);
    const enteringDesktop = previousMode !== 'desktop' && nextMode === 'desktop';
    const enteringFullscreen = previousMode !== 'fullscreen' && nextMode === 'fullscreen';
    const leavingFullscreen = previousMode === 'fullscreen' && nextMode !== 'fullscreen';
    const nextState = {
      ...this.state,
      viewportWidth: nextWidth,
      mode: nextMode,
    };

    if (enteringDesktop) {
      nextState.controlsOpen = false;
      nextState.activePanelId = null;
      nextState.focused = false;
    } else if (nextMode === 'compact') {
      nextState.controlsOpen = false;
      nextState.activePanelId = null;
      nextState.focused = false;
    } else if (enteringFullscreen) {
      nextState.controlsOpen = false;
      nextState.activePanelId = null;
      nextState.focused = false;
    } else if (leavingFullscreen && nextMode === 'compact') {
      nextState.controlsOpen = false;
      nextState.activePanelId = null;
      nextState.focused = false;
    }

    this.state = nextState;
    this.persistResponsivePreferences({ includeViewportClass: true });
    this._applyToUI();
    if (options.silent !== true || previousMode !== nextMode) {
      this.emitChange('viewport', {
        viewportWidth: nextWidth,
        mode: nextMode,
        previousMode,
      });
    }
    return this;
  }

  recomputeMode(options = {}) {
    return this.setViewportWidth(this.context?.ui?.getViewportWidth?.() ?? this.state.viewportWidth, options);
  }

  controlsOpen(value) {
    if (arguments.length === 0) return this.state.controlsOpen;
    const next = value === true;
    if (this.state.mode !== 'fullscreen') return this;
    this.state = {
      ...this.state,
      controlsOpen: next,
      activePanelId: next ? this.state.activePanelId : null,
      focused: next ? this.state.focused : false,
    };
    this._applyToUI();
    this.emitChange('controls-open', { open: next });
    return this;
  }

  openControlsSurface() {
    return this.controlsOpen(true);
  }

  closeControlsSurface() {
    return this.controlsOpen(false);
  }

  activateControl(panelId) {
    if (this.state.mode !== 'fullscreen') return this;
    const id = typeof panelId === 'string' && panelId.trim() ? panelId.trim() : null;
    if (!id) return this;
    const nextState = {
      ...this.state,
      controlsOpen: true,
      activePanelId: id,
      focused: true,
    };
    this.state = nextState;
    this._applyToUI();
    this.emitChange('active-control', { panelId: id, focused: nextState.focused });
    return this;
  }

  clearActiveControl() {
    if (!this.state.activePanelId && !this.state.focused) return this;
    this.state = {
      ...this.state,
      activePanelId: null,
      focused: false,
    };
    this._applyToUI();
    this.emitChange('active-control-cleared', {});
    return this;
  }

  interfaceVisible(value) {
    if (arguments.length === 0) return this.state.interfaceVisible;
    const next = value !== false;
    if (next === this.state.interfaceVisible) return this;
    this.state = { ...this.state, interfaceVisible: next };
    this._applyToUI();
    this.emitChange('interface-visible', { visible: next });
    return this;
  }

  serialize() {
    return {
      options: {
        compactBreakpoint: this.compactBreakpoint(),
        fullscreenBreakpoint: this.fullscreenBreakpoint(),
        preferredDockSide: this.state.dockSide,
        restorePrompt: this.options.restorePrompt !== false,
      },
      state: {
        dockSide: this.state.dockSide,
        interfaceVisible: this.state.interfaceVisible,
      },
    };
  }

  restore(snapshot = {}) {
    super.restore(snapshot);
    const source = snapshot && typeof snapshot === 'object' ? snapshot : {};
    const nextDockSide = source.state?.dockSide ?? source.options?.preferredDockSide ?? this.state.dockSide;
    const nextVisible = source.state?.interfaceVisible ?? this.state.interfaceVisible;
    this.state = {
      ...this.state,
      dockSide: normalizeDockSide(nextDockSide, this.state.dockSide),
      interfaceVisible: nextVisible !== false,
    };
    this.recomputeMode({ silent: true });
    this._applyToUI();
    return this;
  }

  serializeInterfaceState() {
    return {
      dockSide: this.state.dockSide,
      mode: this.state.mode,
      interfaceVisible: this.state.interfaceVisible,
      controlsOpen: this.state.mode === 'fullscreen' ? this.state.controlsOpen : false,
      activePanelId: this.state.mode === 'fullscreen' ? this.state.activePanelId : null,
      focused: this.state.mode === 'fullscreen' ? this.state.focused : false,
      resumePrompt: this.state.resumePrompt ? {
        sessionId: this.state.resumePrompt.sessionId,
        visible: this.state.resumePrompt.visible,
        status: this.state.resumePrompt.status,
        updatedAt: this.state.resumePrompt.updatedAt,
        networkSource: cloneSerializable(this.state.resumePrompt.networkSource),
      } : null,
    };
  }

  restoreInterfaceState(snapshot = {}, options = {}) {
    const next = normalizeInterfaceSnapshot({
      ...this.state,
      ...(snapshot && typeof snapshot === 'object' ? snapshot : {}),
    });
    const modeFromViewport = resolveMode(this.context?.ui?.getViewportWidth?.() ?? next.viewportWidth, this.options);
    this.state = {
      ...next,
      mode: options.keepStoredMode === true ? next.mode : modeFromViewport,
      controlsOpen: modeFromViewport === 'fullscreen' ? next.controlsOpen : false,
      activePanelId: modeFromViewport === 'fullscreen' ? next.activePanelId : null,
      focused: modeFromViewport === 'fullscreen' ? next.focused : false,
    };
    this._applyToUI();
    this.emitChange('restore-interface', this.serializeInterfaceState());
    return this;
  }

  async ensurePersistenceReady() {
    if (this._persistenceReady) return this._persistenceReady;
    this._persistenceReady = this._loadPersistenceState();
    return this._persistenceReady;
  }

  async _loadPersistenceState() {
    const persistence = this.context?.helios?.persistence ?? null;
    if (!persistence) return null;

    if (!this._preferencesLoaded && typeof persistence.loadPreferences === 'function') {
      const preferences = await persistence.loadPreferences();
      this._preferencesLoaded = true;
      const persistedDockSide = preferences?.responsive?.compactDockSide;
      if (persistedDockSide === 'left' || persistedDockSide === 'right') {
        this.state = { ...this.state, dockSide: persistedDockSide };
      }
    }

    if (this.options.restorePrompt !== false && typeof persistence.getRestorableSession === 'function') {
      const session = await persistence.getRestorableSession();
      if (session?.payload?.session?.id) {
        this.state = {
          ...this.state,
          resumePrompt: {
            visible: true,
            sessionId: session.payload.session.id,
            status: 'prompt',
            updatedAt: session.payload.session.updatedAt ?? null,
            networkSource: cloneSerializable(session.payload.networkSource),
          },
        };
      }
    }

    this._applyToUI();
    this.emitChange('persistence-ready', {
      dockSide: this.state.dockSide,
      resumePrompt: cloneSerializable(this.state.resumePrompt),
    });
    return true;
  }

  async persistResponsivePreferences(options = {}) {
    const persistence = this.context?.helios?.persistence ?? null;
    if (!persistence?.updatePreferences) return null;
    const patch = {
      responsive: {
        compactDockSide: this.state.dockSide,
      },
    };
    if (options.includeViewportClass === true) {
      patch.responsive.lastViewportClass = this.state.mode;
      patch.responsive.preferredMode = this.state.mode === 'desktop' ? null : this.state.mode;
    }
    try {
      return await persistence.updatePreferences(patch);
    } catch {
      return null;
    }
  }

  resumePrompt() {
    return this.state.resumePrompt ? cloneSerializable(this.state.resumePrompt) : null;
  }

  async resumeSession(options = {}) {
    const prompt = this.state.resumePrompt;
    const persistence = this.context?.helios?.persistence ?? null;
    if (!prompt?.sessionId || !persistence?.restoreSession) return null;
    this.state = {
      ...this.state,
      resumePrompt: {
        ...prompt,
        status: 'restoring',
      },
    };
    this._applyToUI();
    const restored = await persistence.restoreSession(prompt.sessionId, options);
    this.state = {
      ...this.state,
      resumePrompt: null,
    };
    this._applyToUI();
    this.emitChange('resume-session', {
      sessionId: prompt.sessionId,
      restored: restored != null,
    });
    return restored;
  }

  async startFresh(options = {}) {
    const prompt = this.state.resumePrompt;
    const persistence = this.context?.helios?.persistence ?? null;
    if (prompt?.sessionId && persistence) {
      if (options.delete === true && typeof persistence.deleteSession === 'function') {
        await persistence.deleteSession(prompt.sessionId);
      } else if (typeof persistence.markSessionFinished === 'function') {
        await persistence.markSessionFinished(prompt.sessionId);
      }
    }
    this.state = {
      ...this.state,
      resumePrompt: null,
    };
    this._applyToUI();
    this.emitChange('start-fresh', {
      sessionId: prompt?.sessionId ?? null,
    });
    return true;
  }

  dismissResumePrompt() {
    if (!this.state.resumePrompt) return this;
    this.state = {
      ...this.state,
      resumePrompt: null,
    };
    this._applyToUI();
    this.emitChange('dismiss-resume-prompt', {});
    return this;
  }

  _applyToUI() {
    const ui = this.context?.ui ?? null;
    if (!ui || typeof ui.applyInterfaceBehaviorState !== 'function') return;
    ui.applyInterfaceBehaviorState({
      dockSide: this.state.dockSide,
      mode: this.state.mode,
      compact: this.isCompact(),
      fullscreen: this.isFullscreen(),
      controlsOpen: this.state.controlsOpen,
      activePanelId: this.state.activePanelId,
      focused: this.state.focused,
      interfaceVisible: this.state.interfaceVisible,
      resumePrompt: this.resumePrompt(),
    });
  }

  emitChange(reason, detail = {}) {
    this.emit('change', {
      reason,
      ...cloneSerializable(detail),
      state: this.serializeInterfaceState(),
    });
    return this;
  }
}

export default InterfaceBehavior;
