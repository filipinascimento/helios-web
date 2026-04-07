import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isSpecialNoneCategoryLabel,
  orderCategoricalEntries,
  resolveCategoricalDefaultPalette,
  resolveCategoricalPaletteCatalogGroup,
  shouldShowCategoricalPaletteEntry,
} from '../src/ui/panels/MappersPanel.js';

test('categorical palette catalog keeps category18 under a Helios-specific group', () => {
  assert.equal(resolveCategoricalPaletteCatalogGroup('category18', true), 'Helios category');
  assert.equal(resolveCategoricalPaletteCatalogGroup('interpolateInferno', false), 'helios ramps');
});

test('categorical palette default prefers category18 when it is available', () => {
  assert.equal(resolveCategoricalDefaultPalette([
    { key: 'schemeTableau10', isScheme: true },
    { key: 'category18', isScheme: true },
  ]), 'category18');
});

test('categorical palette filtering keeps non-scheme names like category18 when scheme mode is enabled', () => {
  assert.equal(shouldShowCategoricalPaletteEntry({ key: 'category18', isScheme: true }, true), true);
  assert.equal(shouldShowCategoricalPaletteEntry({ key: 'schemeSet3', isScheme: true }, true), true);
  assert.equal(shouldShowCategoricalPaletteEntry({ key: 'interpolateInferno', isScheme: false }, true), false);
  assert.equal(shouldShowCategoricalPaletteEntry({ key: 'interpolateInferno', isScheme: false }, false), true);
});

test('special None labels collapse into Others when categories overflow', () => {
  const ordered = orderCategoricalEntries([
    { id: 0, label: 'None', count: 100, specialNone: true },
    { id: 1, label: 'Alpha', count: 90 },
    { id: 2, label: 'Beta', count: 80 },
  ], {
    sortOrder: 'frequency',
    maxCategories: 2,
  });

  assert.deepEqual(ordered.map((entry) => entry.label), ['Alpha', 'Beta']);
});

test('special None labels move to the end when no Others bucket is needed', () => {
  const ordered = orderCategoricalEntries([
    { id: 0, label: 'beta', count: 2 },
    { id: 1, label: 'None', count: 10, specialNone: true },
    { id: 2, label: 'alpha', count: 3 },
  ], {
    sortOrder: 'alphabetical',
  });

  assert.deepEqual(ordered.map((entry) => entry.label), ['alpha', 'beta', 'None']);
});

test('null category labels are treated as special None categories', () => {
  assert.equal(isSpecialNoneCategoryLabel(null), true);
  assert.equal(isSpecialNoneCategoryLabel('null'), true);
  assert.equal(isSpecialNoneCategoryLabel('None'), true);
  assert.equal(isSpecialNoneCategoryLabel('alpha'), false);

  const ordered = orderCategoricalEntries([
    { id: 0, label: 'None', rawLabel: null, count: 5, specialNone: true },
    { id: 1, label: 'Alpha', count: 4 },
  ], {
    sortOrder: 'frequency',
  });

  assert.deepEqual(ordered.map((entry) => entry.label), ['Alpha', 'None']);
});
