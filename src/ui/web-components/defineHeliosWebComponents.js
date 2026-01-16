import { HeliosPanelElement } from './HeliosPanelElement.js';

export function defineHeliosWebComponents(docOrWin = document) {
  const doc = docOrWin?.nodeType === 9
    ? docOrWin
    : (docOrWin?.document ?? document);

  const win = doc?.defaultView ?? (typeof window !== 'undefined' ? window : null);
  const registry = win?.customElements ?? null;

  if (!registry) {
    return { defined: [], supported: false };
  }

  const defined = [];

  if (!registry.get('helios-panel')) {
    registry.define('helios-panel', HeliosPanelElement);
    defined.push('helios-panel');
  }

  return { defined, supported: true };
}
