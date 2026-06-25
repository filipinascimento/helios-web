import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import * as heliosWeb from '../src/index.js';
import packageJson from '../package.json' with { type: 'json' };

test('package root exposes the stabilized public API and omits renderer internals', () => {
  assert.equal(typeof heliosWeb.Helios, 'function');
  assert.equal(typeof heliosWeb.EVENTS, 'object');
  assert.equal(typeof heliosWeb.BEHAVIOR_IDS, 'object');
  assert.equal(typeof heliosWeb.createDefaultBehaviorRegistry, 'function');
  assert.equal(typeof heliosWeb.HeliosStorageManager, 'function');
  assert.equal(typeof heliosWeb.BrowserStorageManager, 'function');
  assert.equal(typeof heliosWeb.RemoteStorageManager, 'function');
  assert.equal(typeof heliosWeb.HeliosUI, 'function');

  assert.equal('LayeredRenderer' in heliosWeb, false);
  assert.equal('Camera' in heliosWeb, false);
  assert.equal('WebGL2Renderer' in heliosWeb, false);
  assert.equal('WebGPURenderer' in heliosWeb, false);
  assert.equal('Store' in heliosWeb, false);
});

test('behavior id export matches the default registry surface', () => {
  const registry = heliosWeb.createDefaultBehaviorRegistry();
  assert.deepEqual(heliosWeb.BEHAVIOR_IDS, [
    'appearance',
    'exporter',
    'mappers',
    'filters',
    'interface',
    'layout',
    'legends',
    'labels',
    'hover',
    'selection',
  ]);
  for (const id of heliosWeb.BEHAVIOR_IDS) {
    assert.equal(registry.has(id), true);
  }
});

test('package metadata points at the public declaration entrypoint', () => {
  assert.equal(packageJson.types, './src/index.d.ts');
  assert.equal(packageJson.exports['.'].types, './src/index.d.ts');
});

test('public declaration file covers Phase 1 behavior, storage, and camera surface', async () => {
  const declarations = await readFile(new URL('../src/index.d.ts', import.meta.url), 'utf8');
  for (const token of [
    'export interface HeliosOptions',
    'powerPreference?:',
    'webglContextAttributes?:',
    'webgpuAdapterOptions?:',
    'webgpuDeviceDescriptor?:',
    'webgpuCanvasConfiguration?:',
    'export interface HeliosQuickControlsOptions',
    'quickControls?:',
    'export interface CameraControlsOptions',
    'export interface HeliosVisualizationStatePayload',
    'export interface HeliosSessionPayload',
    'export interface HeliosBehaviorNamespace',
    'export interface BehaviorConfigObject',
    'export class InterfaceBehavior',
    'export class HeliosStorageManager',
    'export class BrowserStorageManager',
    'export class RemoteStorageManager',
    'workspaceId?:',
    'positionPersistence?:',
    "'gml'",
    'fileDrop?:',
    'getResumeSessions',
    'getResumePrompt',
    'HeliosSessionSummary',
    'nickname?:',
    'startNewSession',
    'setSessionNickname',
    'resumeSession',
    'restoreActiveSession',
  ]) {
    assert.ok(declarations.includes(token), `Expected declaration token: ${token}`);
  }
  for (const removed of [
    'export class HeliosPersistenceService',
    'export class PersistenceRegistry',
    'export class CustomPersistenceBackend',
  ]) {
    assert.equal(declarations.includes(removed), false, `Removed declaration still present: ${removed}`);
  }
});
