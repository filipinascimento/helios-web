import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePanelIconKind } from '../src/ui/panelIcons.js';

test('resolvePanelIconKind maps main panel ids and titles to stable icon kinds', () => {
  assert.equal(resolvePanelIconKind({ id: 'helios-ui-data', title: 'Data' }), 'data');
  assert.equal(resolvePanelIconKind({ id: 'helios-ui-demo', title: 'Scene' }), 'scene');
  assert.equal(resolvePanelIconKind({ id: 'helios-ui-metrics', title: 'Metrics' }), 'metrics');
  assert.equal(resolvePanelIconKind({ id: 'helios-ui-mappers', title: 'Mappers' }), 'mappers');
  assert.equal(resolvePanelIconKind({ id: 'helios-ui-layout', title: 'Layout' }), 'layout');
  assert.equal(resolvePanelIconKind({ id: 'helios-ui-legends', title: 'Legends' }), 'legends');
  assert.equal(resolvePanelIconKind({ id: 'helios-ui-filter', title: 'Filter' }), 'filter');
  assert.equal(resolvePanelIconKind({ id: 'helios-ui-camera', title: 'Camera' }), 'camera');
  assert.equal(resolvePanelIconKind({ id: 'helios-ui-selection', title: 'Selection' }), 'selection');
});
