function normalizePanelToken(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^helios-ui-/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function resolvePanelIconKind(source = {}) {
  const id = normalizePanelToken(source?.id ?? source?.panelId);
  const title = normalizePanelToken(source?.title ?? source?.heading);
  const token = id || title;

  if (token.includes('data')) return 'data';
  if (token.includes('debug')) return 'debug';
  if (token.includes('scene') || token.includes('demo')) return 'scene';
  if (token.includes('metrics')) return 'metrics';
  if (token.includes('mapper')) return 'mappers';
  if (token.includes('layout')) return 'layout';
  if (token.includes('legend')) return 'legends';
  if (token.includes('filter')) return 'filter';
  if (token.includes('camera')) return 'camera';
  if (token.includes('selection')) return 'selection';
  return 'panel';
}

export function createPanelIcon(doc, source = {}, options = {}) {
  const iconKind = typeof source === 'string' ? source : resolvePanelIconKind(source);
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add(options.className ?? 'helios-ui-panel-icon');

  const addPath = (d, extra = {}) => {
    const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', extra.fill ?? 'none');
    path.setAttribute('stroke', extra.stroke ?? 'currentColor');
    path.setAttribute('stroke-width', extra.strokeWidth ?? '1.8');
    path.setAttribute('stroke-linecap', extra.strokeLinecap ?? 'round');
    path.setAttribute('stroke-linejoin', extra.strokeLinejoin ?? 'round');
    svg.appendChild(path);
  };

  if (iconKind === 'data') {
    addPath('M5 7.5C5 6.12 8.13 5 12 5s7 1.12 7 2.5S15.87 10 12 10 5 8.88 5 7.5Z');
    addPath('M5 7.5v4C5 12.88 8.13 14 12 14s7-1.12 7-2.5v-4');
    addPath('M5 11.5v5C5 17.88 8.13 19 12 19s7-1.12 7-2.5v-5');
  } else if (iconKind === 'debug') {
    addPath('M5 6.5h14');
    addPath('M5 12h14');
    addPath('M5 17.5h14');
    addPath('M8 4.5v4');
    addPath('M16 10v4');
    addPath('M11 15.5v4');
  } else if (iconKind === 'scene') {
    addPath('M12 4v4');
    addPath('M12 16v4');
    addPath('M4 12h4');
    addPath('M16 12h4');
    addPath('M6.7 6.7l2.8 2.8');
    addPath('M14.5 14.5l2.8 2.8');
    addPath('M17.3 6.7l-2.8 2.8');
    addPath('M9.5 14.5l-2.8 2.8');
    addPath('M12 9.2a2.8 2.8 0 1 1 0 5.6a2.8 2.8 0 0 1 0-5.6');
  } else if (iconKind === 'metrics') {
    addPath('M5 19V9');
    addPath('M12 19V5');
    addPath('M19 19v-7');
    addPath('M4 19h16');
  } else if (iconKind === 'mappers') {
    addPath('M6 7.5a1.5 1.5 0 1 1 0 3a1.5 1.5 0 0 1 0-3');
    addPath('M18 5a1.5 1.5 0 1 1 0 3a1.5 1.5 0 0 1 0-3');
    addPath('M18 16a1.5 1.5 0 1 1 0 3a1.5 1.5 0 0 1 0-3');
    addPath('M7.4 8.7 16.6 6.8');
    addPath('M7.4 9.9 16.6 17.1');
  } else if (iconKind === 'layout') {
    addPath('M7 7a2 2 0 1 1 0 .01');
    addPath('M17 7a2 2 0 1 1 0 .01');
    addPath('M12 17a2 2 0 1 1 0 .01');
    addPath('M8.6 8.1 10.9 15');
    addPath('M15.4 8.1 13.1 15');
    addPath('M9 7h6');
  } else if (iconKind === 'legends') {
    addPath('M6 6.5h3');
    addPath('M6 12h3');
    addPath('M6 17.5h3');
    addPath('M11.5 6.5H18');
    addPath('M11.5 12H18');
    addPath('M11.5 17.5H18');
  } else if (iconKind === 'filter') {
    addPath('M4.5 6h15l-6 7v4.5l-3 1.5V13L4.5 6Z');
  } else if (iconKind === 'camera') {
    addPath('M5 8.5h3l1.4-2h5.2l1.4 2H19a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 19 18.5H5A1.5 1.5 0 0 1 3.5 17v-7A1.5 1.5 0 0 1 5 8.5Z');
    addPath('M12 10a3.25 3.25 0 1 1 0 6.5a3.25 3.25 0 0 1 0-6.5');
  } else if (iconKind === 'selection') {
    addPath('M12 5v3');
    addPath('M12 16v3');
    addPath('M5 12h3');
    addPath('M16 12h3');
    addPath('M8.5 8.5l1.8 1.8');
    addPath('M13.7 13.7l1.8 1.8');
    addPath('M15.5 8.5l-1.8 1.8');
    addPath('M10.3 13.7l-1.8 1.8');
    addPath('M12 9.75a2.25 2.25 0 1 1 0 4.5a2.25 2.25 0 0 1 0-4.5');
  } else {
    addPath('M6 6h12v12H6Z');
    addPath('M9 10h6');
    addPath('M9 14h4');
  }

  return svg;
}
