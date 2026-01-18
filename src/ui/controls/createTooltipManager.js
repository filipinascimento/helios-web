export function createTooltipManager() {
  const cleanups = new Set();

  const attachTooltip = (anchorEl, hint) => {
    if (!anchorEl || !hint) return () => {};

    let tooltip = null;
    let tooltipRoot = null;
    let hideTooltipTimer = null;

    const resolveTooltipRoot = () => anchorEl.closest?.('.helios-ui') ?? anchorEl.ownerDocument?.body ?? document.body;

    const setTooltipHidden = (hidden) => {
      if (!tooltip) return;
      tooltip.dataset.open = hidden ? 'false' : 'true';
      tooltip.hidden = hidden;
    };

    const placeTooltip = () => {
      if (!tooltip) return;
      const anchor = tooltip.dataset.anchorId ? anchorEl.ownerDocument?.getElementById?.(tooltip.dataset.anchorId) : null;
      const el = anchor ?? null;
      if (!el) return;

      const margin = 8;
      const rect = el.getBoundingClientRect();
      const { innerWidth: vw, innerHeight: vh } = window;

      tooltip.style.left = '0px';
      tooltip.style.top = '0px';
      tooltip.style.transform = 'translate(-9999px, -9999px)';
      const tipRect = tooltip.getBoundingClientRect();

      const preferredLeft = rect.left + rect.width / 2 - tipRect.width / 2;
      const left = Math.max(margin, Math.min(vw - margin - tipRect.width, preferredLeft));

      const preferredTop = rect.top - 8 - tipRect.height;
      const fallbackTop = rect.bottom + 8;
      const top = preferredTop >= margin ? preferredTop : Math.min(vh - margin - tipRect.height, fallbackTop);

      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
      tooltip.style.transform = 'translate(0, 0)';
    };

    const scheduleHideTooltip = () => {
      if (hideTooltipTimer != null) window.clearTimeout(hideTooltipTimer);
      hideTooltipTimer = window.setTimeout(() => setTooltipHidden(true), 120);
    };

    const showTooltip = () => {
      if (!tooltip) return;
      if (hideTooltipTimer != null) window.clearTimeout(hideTooltipTimer);
      if (!tooltipRoot) {
        tooltipRoot = resolveTooltipRoot();
        tooltipRoot.appendChild(tooltip);
      }
      setTooltipHidden(false);
      placeTooltip();
    };

    tooltip = document.createElement('div');
    tooltip.className = 'helios-ui-tooltip';
    tooltip.hidden = true;
    tooltip.dataset.open = 'false';
    tooltip.textContent = hint;
    tooltip.setAttribute('role', 'tooltip');

    const tooltipId = `helios-ui-tooltip-${Math.random().toString(16).slice(2)}`;
    tooltip.dataset.anchorId = tooltipId;
    anchorEl.id = tooltipId;
    anchorEl.tabIndex = 0;

    const onPointerEnter = () => showTooltip();
    const onPointerLeave = () => scheduleHideTooltip();
    const onFocus = () => showTooltip();
    const onBlur = () => setTooltipHidden(true);
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setTooltipHidden(true);
        anchorEl.blur();
      }
    };
    const onScrollOrResize = () => {
      if (!tooltip || tooltip.hidden) return;
      placeTooltip();
    };

    anchorEl.addEventListener('pointerenter', onPointerEnter);
    anchorEl.addEventListener('pointerleave', onPointerLeave);
    anchorEl.addEventListener('focus', onFocus);
    anchorEl.addEventListener('blur', onBlur);
    anchorEl.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScrollOrResize, { capture: true });
    window.addEventListener('resize', onScrollOrResize);

    const cleanup = () => {
      if (hideTooltipTimer != null) window.clearTimeout(hideTooltipTimer);
      anchorEl.removeEventListener('pointerenter', onPointerEnter);
      anchorEl.removeEventListener('pointerleave', onPointerLeave);
      anchorEl.removeEventListener('focus', onFocus);
      anchorEl.removeEventListener('blur', onBlur);
      anchorEl.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScrollOrResize, { capture: true });
      window.removeEventListener('resize', onScrollOrResize);
      tooltip?.remove?.();
      tooltip = null;
      tooltipRoot = null;
    };

    cleanups.add(cleanup);
    return cleanup;
  };

  return {
    attachTooltip,
    destroy() {
      for (const cleanup of cleanups) cleanup();
      cleanups.clear();
    },
  };
}

