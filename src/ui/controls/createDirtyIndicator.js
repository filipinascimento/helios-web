function normalizePath(path) {
  return String(path ?? '').trim();
}

function stateForPath(dirtyState, path, scope = path, mode = 'control') {
  const target = normalizePath(path);
  const resetScope = normalizePath(scope || path);
  if (target && dirtyState?.controls?.[target]) return 'changed';
  if (mode === 'scope') {
    if (resetScope && dirtyState?.sections?.[resetScope]) return dirtyState.sections[resetScope];
    if (target && dirtyState?.panels?.[target]) return dirtyState.panels[target];
  }
  return 'default';
}

function resolvePersistenceState(helios, path, scope, mode) {
  const persistence = helios?.persistence ?? null;
  if (typeof persistence?.keyStatus === 'function') {
    return persistence.keyStatus(path, { scope, mode })?.state ?? 'default';
  }
  const dirtyState = persistence?.getDirtyState?.() ?? { controls: {}, sections: {}, panels: {} };
  return stateForPath(dirtyState, path, scope, mode);
}

function closeOpenMenus(root = document) {
  for (const menu of root.querySelectorAll?.('.helios-ui-dirty-menu') ?? []) {
    menu.remove();
  }
}

function resolveMenuRoot(indicator) {
  return indicator.closest?.('.helios-ui') ?? indicator.ownerDocument?.body ?? document.body;
}

export function createDirtyIndicator({
  helios,
  path,
  scope = path,
  mode = 'control',
  attachTooltip = null,
} = {}) {
  const indicator = document.createElement('span');
  indicator.className = 'helios-ui-dirty-indicator';
  indicator.dataset.state = 'default';
  indicator.setAttribute('aria-label', 'Persistence status');
  const hasPath = Boolean(normalizePath(path));
  if (hasPath) {
    indicator.dataset.path = normalizePath(path);
    indicator.dataset.scope = normalizePath(scope || path);
    indicator.dataset.mode = mode === 'scope' ? 'scope' : 'control';
  }
  if (hasPath) {
    indicator.setAttribute('role', 'button');
    indicator.setAttribute('tabindex', '0');
    indicator.setAttribute('aria-haspopup', 'menu');
  }
  if (!hasPath) {
    indicator.classList.add('helios-ui-dirty-indicator--static');
    indicator.setAttribute('aria-hidden', 'true');
  }

  const update = () => {
    indicator.dataset.state = resolvePersistenceState(helios, path, scope, mode);
  };

  const buildMenu = () => {
    closeOpenMenus(indicator.ownerDocument);
    const menu = document.createElement('div');
    menu.className = 'helios-ui-dirty-menu';
    menu.setAttribute('role', 'menu');

    const addItem = (label, onClick, options = {}) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = options.muted ? 'helios-ui-dirty-menu__item helios-ui-dirty-menu__item--muted' : 'helios-ui-dirty-menu__item';
      item.textContent = label;
      item.disabled = options.disabled === true;
      item.addEventListener('click', async (event) => {
        event.stopPropagation();
        await onClick?.();
        menu.remove();
        update();
      });
      menu.appendChild(item);
      return item;
    };

    const resetTarget = normalizePath(mode === 'scope' ? (scope || path) : path);
    addItem('Reset to default', () => helios?.persistence?.resetOverride?.(resetTarget), {
      disabled: !resetTarget || indicator.dataset.state === 'default',
    });

    const rect = typeof indicator.getBoundingClientRect === 'function'
      ? indicator.getBoundingClientRect()
      : { bottom: 0, left: 0 };
    Object.assign(menu.style, {
      position: 'fixed',
      top: `${Math.round(rect.bottom + 6)}px`,
      left: `${Math.round(rect.left)}px`,
      zIndex: '2147483100',
    });
    resolveMenuRoot(indicator).appendChild(menu);
    setTimeout(() => {
      const close = (event) => {
        if (!menu.contains(event.target) && event.target !== indicator) {
          menu.remove();
          indicator.ownerDocument.removeEventListener('pointerdown', close, true);
        }
      };
      indicator.ownerDocument.addEventListener('pointerdown', close, true);
    }, 0);
  };

  indicator.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!hasPath) return;
    buildMenu();
  });
  indicator.addEventListener('keydown', (event) => {
    if (!hasPath || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    buildMenu();
  });

  const controller = helios?.persistence?.sessionController ?? null;
  const persistence = helios?.persistence ?? null;
  const onChange = () => update();
  controller?.addEventListener?.('change', onChange);
  controller?.addEventListener?.('config', onChange);
  persistence?.addEventListener?.('change', onChange);
  persistence?.addEventListener?.('config', onChange);
  indicator.destroy = () => {
    controller?.removeEventListener?.('change', onChange);
    controller?.removeEventListener?.('config', onChange);
    persistence?.removeEventListener?.('change', onChange);
    persistence?.removeEventListener?.('config', onChange);
    closeOpenMenus(indicator.ownerDocument);
  };
  if (hasPath) attachTooltip?.(indicator, 'Shows whether this setting is tracked as a session override.');
  update();
  return indicator;
}

export default createDirtyIndicator;
