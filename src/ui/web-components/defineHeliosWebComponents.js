import { HeliosPanelElement } from './HeliosPanelElement.js';

/**
 * Register Helios Web custom elements in a document or window.
 *
 * @public
 * @apiSection User Interface
 * @param {Document|Window} [docOrWin=document] - Registration target.
 * @returns {{defined:Array<string>,supported:boolean}} Registration result.
 */
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
