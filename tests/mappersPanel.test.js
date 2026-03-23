import test from 'node:test';
import assert from 'node:assert/strict';
import {
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
