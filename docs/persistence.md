# State And Storage Management

Helios exposes two separate systems:

- `helios.states` is the live state graph. It owns registered state entries,
  defaults, overrides, bindings, status, UI metadata, dirty markers, and
  reset-to-default behavior.
- `helios.storage` is the optional durable/session sync layer. It subscribes to
  `helios.states`, coalesces incremental override changes, and owns session
  save/list/load/delete.

UI and application controls should bind to `helios.states`. Storage debounce,
autosave, and thumbnail policy must never delay live visual feedback.

```js
const helios = new Helios(network, {
  container: '#app',
  storage: { type: 'browser' },
  workspaceId: 'project:demo',
  session: {
    id: 'project-session',
    url: true,
    restore: true,
  },
  networkPersistence: { enabled: true, autosave: false },
  positionPersistence: { enabled: true, autosave: true },
});
```

If `storage` is omitted and no storage-related top-level option is provided,
Helios creates a `DummyStorageManager`. Dummy storage participates in exported
snapshots, but reports no persistent/session capability, so the built-in UI
hides resume, sync, and persistent dirty-marker chrome. Passing `storage: true`,
`storage: { type: 'browser' }`, `workspaceId`, `session`, `sessionId`,
`networkPersistence`, or `positionPersistence` opts into browser storage when
`storage` is otherwise omitted.

Native document shells can keep durable persistence outside the browser while
still using the same dirty-state contract:

```js
const helios = new Helios(network, {
  container,
  storage: { type: 'memory' },
  session: false,
  persistence: false,
  networkPersistence: { enabled: true, autosave: false, format: 'zxnet' },
  positionPersistence: { enabled: true, autosave: false },
});
```

In this mode `helios.storage` reports pending tracked-state changes through
`pendingStateChangeCount()`, graph payload changes through `networkData.dirty`,
and layout/position changes through `networkData.positionsDirty`. The host
performs explicit Save/Save As by calling `saveNetworkSnapshot()` or
`savePortableNetwork()`, writing the returned bytes to disk, then calling
`acknowledgeSavedSnapshot()` only after the file write succeeds. No
localStorage, IndexedDB, or session registry is required.

Visualization-state exports include sparse state overrides from `helios.states`
inside `storageState`. `storageState.state` does not include the full live
state value map by default. Sparse/tracked visualization exports also merge
state overrides into `payload.overrides`, using alias-preferred keys when a
state entry defines panel-facing aliases. This lets dummy-managed state
round-trip through exported network/session snapshots even when no persistent
browser or remote backend is enabled.

## State Entries vs UI Panels

State entries describe values and bindings only. They must not define panel or
section placement.

```js
helios.states.register(component, 'behaviors.layout', {
  'parameters.gravity': {
    description: 'Layout gravity',
    default: 0.5,
    type: 'number',
    scope: 'workspace',
    ui: {
      label: 'Gravity',
      controller: 'slider',
      min: 0,
      max: 2,
      debounceMs: 220,
    },
    getter: () => layout.gravity(),
    setter: (value) => layout.gravity(value),
    subscribe: (notify) => layout.on('change', () => notify(layout.gravity())),
  },
});
```

UI grouping is defined separately through panel schemas that reference state
keys:

```js
const scenePanel = {
  id: 'scene',
  title: 'Scene',
  dock: 'right',
  sections: [
    {
      id: 'appearance',
      title: 'Appearance',
      items: [
        'helios.scene.nodeSizeScale',
        'helios.scene.edgeOpacity',
        { type: 'custom', id: 'mapper-editor', keyPrefix: 'mappers.node' },
      ],
    },
  ],
};
```

Panel and section markers are UI aggregates: the UI asks
`helios.states.status(key)` for each referenced key and computes section/panel
state from the panel schema. Storage remains unaware of visual grouping.
The built-in Scene, Labels, Legends, Mappers, Filters, Layout, and Selection
schemas are exported as `SCENE_PANEL_SCHEMA`, `LABELS_PANEL_SCHEMA`,
`LEGENDS_PANEL_SCHEMA`, `MAPPERS_PANEL_SCHEMA`, `FILTERS_PANEL_SCHEMA`,
`LAYOUT_PANEL_SCHEMA`, and `SELECTION_PANEL_SCHEMA`; their panel and tab markers
are computed from those declared keys and custom `keyPrefix` items.
Scene/Appearance controls resolve state entry metadata where available, the
Layout panel writes layout type, running state, and active layout parameter
subkeys through `helios.states`. Its `Set from` position-source control is an
action that copies coordinates into layout positions, so the source selector is
not tracked as durable state. Complex Mappers, Filters, Selection, and Labels
panels aggregate stable state prefixes such as
`mappers.node.*`, `filters.*`, `selection.*`, and `labels.*`.
Panel item labels are resolved as UI metadata: an item-level `label` in the
panel schema wins, then `helios.states.entry(key).ui.label`, and only then a
humanized fallback is generated from the key. State entries may define labels
and control hints, but they still must not define panel or section placement.

## State And Storage Facades

Helios exposes live parameter state at `helios.states` and durable session or
network synchronization at `helios.storage`. Durable storage is off by default
when Helios is used as a library. A plain
`new Helios(network, { container })` creates no browser storage backends, writes
no hidden network attributes, starts no session, and does not add a `sessionId`
to the URL.

Enable browser storage explicitly when an app wants it:

```js
const helios = new Helios(network, {
  container: '#app',
  storage: { type: 'browser' },
  workspaceId: 'project:demo',
});
await helios.ready;
```

The bundled demo opts in so persistence, sessions, and resume UI can be tested
there without surprising library consumers.

## State Model

The state manager stores explicit dot keys. Each registered entry has a default,
an optional binding to a runtime getter/setter, optional aliases, persistence
metadata, and UI metadata. The live value map is separate from the sparse
override map:

- `values` is the current live value used by UI controls and bound runtime
  objects.
- `overrides` is the small persisted map of intentional user/program/CLI
  changes.
- `scope` (`user`, `workspace`, `network`, or `session`) is metadata that tells
  storage where a persisted override belongs; it is not a separate in-memory
  precedence stack.

A user, programmatic, or CLI write creates an override even when the written
value equals the default. Restore of an already sparse override snapshot carries
explicit override intent; default writes, binding refreshes, heuristic defaults,
and aggregate current-state syncs do not. Dirty markers mean “this key or one
of its descendants has an override”, not “current value differs from the
default.” Use `helios.states.reset(key)`, `helios.states.resetToDefault(key)`,
or the UI “Reset to default” action to remove the override.

Use stable hierarchical names:

```text
ui.theme
appearance.nodeStyle.sizeScale
appearance.edgeStyle.opacityScale
layout.parameters.gravity
network.persistence.autosave
positions.persistence.autosave
```

## Enabling Persistence

Minimal local browser persistence:

```js
const helios = new Helios(network, {
  container: '#app',
  storage: { type: 'browser', persistNetwork: true },
  workspaceId: 'my-app:workspace-42',
  networkSource: {
    name: 'customer-network.xnet',
    baseName: 'customer-network',
    format: 'xnet',
  },
});
```

Equivalent explicit form:

```js
const helios = new Helios(network, {
  container: '#app',
  storage: { type: 'browser', persistNetwork: true },
  workspaceId: 'my-app:workspace-42',
});
```

Disable durable storage:

```js
const helios = new Helios(network, {
  container: '#app',
  storage: false,
});
```

Passing storage-related top-level options also opts in:

```js
const helios = new Helios(network, {
  container: '#app',
  workspaceId: 'my-workspace',
  networkPersistence: { enabled: true },
  positionPersistence: { enabled: true },
});
```

`workspaceId` should come from the embedding application whenever possible. CLI
and desktop shells should use their project/session identity. Browser demos can
use a stable demo id. `networkSource` is optional, but applications that create
an in-memory network instead of loading a named file should provide it so
session lists and persistence metadata use the network name instead of a
generated session id.

## Storage Managers

`BrowserStorageManager`
: Stores UI state, preferences, session records, and optional network payloads in
browser storage.

`RemoteStorageManager`
: Delegates session records to a host-provided client with `putSession`,
`getSession`, `listSessions`, and `deleteSession` methods.

`DummyStorageManager`
: Tracks runtime state in memory for library-style construction and tests.

Example with host-provided remote storage:

```js
import {
  Helios,
} from 'helios-web';

const helios = new Helios(network, {
  container: '#app',
  workspaceId: 'project:demo',
  storage: {
    type: 'remote',
    client: {
      putSession: (record) => host.saveSession(record),
      getSession: (id) => host.loadSession(id),
      listSessions: () => host.listSessions(),
      deleteSession: (id) => host.deleteSession(id),
      getUnfinishedSessionId: () => host.getUnfinishedSessionId(),
      setUnfinishedSessionId: (id) => host.setUnfinishedSessionId(id),
    },
  },
});
```

## Keys And Bindings

Register defaults once in `helios.states`. UI panels and controllers should
read defaults/status from the state manager instead of duplicating defaults.

```js
helios.states.register('layout-panel', '', {
  'layout.parameters.gravity': {
    default: 0.0008,
    type: 'number',
    scope: 'network',
    ui: { debounceMs: 150 },
  },
});

helios.states.subscribe('layout.parameters.gravity', (value) => {
  console.log('gravity changed', value);
});

helios.states.set('layout.parameters.gravity', 0.0012, {
  scope: 'network',
  source: 'ui',
  reason: 'layout-control',
});
```

Subscriptions are keyed or prefix-keyed. A write to one leaf only notifies
listeners for that leaf and its prefixes, not unrelated state consumers.

Bound objects should use `helios.states` as the write authority when a user-facing
control changes. Binding subscriptions can still report current runtime values
back to state, but those refresh notifications should be non-overriding unless
they explicitly carry `trackOverride: true` or an explicit source such as
`ui`, `program`, or `cli`. A binding notification with `trackOverride: false`
always stays non-tracking.

Built-in behaviors are bound automatically by Helios. Layout, legend, filter,
mapper, and selection changes are stored through canonical behavior keys with
panel-friendly aliases such as `layout.layoutType`,
`layout.parameters.gravity`, `legends.enabled`, `filters.rules`, and
`selection.selectedNodes`. Layout parameter controls use fine-grained
`layout.parameters.<name>` aliases instead of relying on a single opaque
`layout.parameters` object. Programmatic calls, CLI commands, restored sparse
overrides, and UI edits therefore mark and reset through the same registry
paths.

Debugging state and storage:

```js
const helios = new Helios(network, {
  storage: { type: 'browser' },
  workspaceId: 'debug-workspace',
  session: { id: 'debug-session', url: true },
});

// Exposed while debug is enabled, which is the current default:
window.__helios === helios;
helios.storage.debugStats({ windowMs: 5 * 60 * 1000 });
```

Debug instrumentation is on by default for now. It exposes `window.__helios`;
when Helios owns or is given a UI, a right-docked Debug panel is appended. The
Debug panel updates on a throttled interval and reports tracked state count,
state changes, UI-origin changes, and persistence changes over the configured
time window. Pass `debug: false` to disable the debug attachment and panel.

State methods:

- `register(owner, prefix, entries)`
- `entry(path)`
- `entriesFor(prefix)`
- `get(path, fallback)`
- `set(path, value, { scope, source, reason })`
- `setDefault(path, value, options)`
- `reset(pathOrPrefix)`
- `status(pathOrPrefix, options)`
- `subscribe(path, callback)`
- `transaction(options, callback)`
- `restore(snapshot, options)`
- `snapshot(options)`
- `getOverrides(options)`
- `overrideKeys()`
- `preferredKey(path)`
- `debugStats(options)`

Storage methods:

- `configure(options)`
- `status()` / `persistenceStatus()`
- `flush(options)` / `sync(options)`
- `flushAutosync(options)`
- `markNetworkDirty(reason)`
- `markPositionsDirty(reason)`
- `pendingStateChangeCount()` / `hasPendingStateChanges()`
- `acknowledgeSavedSnapshot(reason, options)`
- `recordPortableState(path, value, options)`
- `getPreferences()` / `loadPreferences()` / `updatePreferences(patch)`
- `serializeNetworkSnapshot(options)`
- `attachVisualizationStateToNetwork(snapshot, options)`
- `saveNetworkSnapshot(format, options)`
- `restoreNetworkSnapshot(source, options)`
- `restorePortableStateFromNetwork(options)`
- `debugStats(options)`

## Sessions

Sessions are also opt-in and are controlled through the top-level `session`
constructor option plus `helios.storage` at runtime. There is no separate
`helios.session` API. Local browser sessions can use URL routing:

```js
const helios = new Helios(network, {
  container: '#app',
  storage: { type: 'browser', persistNetwork: true },
  workspaceId: 'project:demo',
  session: {
    url: true,
    restore: true,
    restoreNetwork: true,
    autosave: true,
    retention: {
      maxSessions: 20,
      maxBytes: 256 * 1024 * 1024,
    },
    thumbnail: {
      enabled: true,
      maxWidth: 96,
      maxHeight: 64,
      maxBytes: 24 * 1024,
      autosaveMinIntervalMs: 30000,
    },
    networkPersistence: {
      enabled: true,
      format: 'zxnet',
    },
  },
});
```

When `session.url` is enabled, Helios adds a generated `sessionId` to the URL if
one is missing. Generated ids are short random lowercase strings, for example
`k8m2p4xq1z`; they do not include a `session:` prefix or timestamp. Reloading
the URL restores that session. Opening a URL without a session id creates a new
session and lets the UI offer older unfinished sessions through the resume
prompt. If multiple sessions are available, the Resume button opens a chooser.

Session retention is controlled by `session.retention`. Omitted URL parameters
or omitted retention fields keep the configured defaults; for example, omitting
`maxSessions` keeps the default list size instead of pruning down to one
session.

Session records can include a tiny PNG thumbnail used by the Resume prompt and
Data > Session list. Thumbnails are captured through the figure preview export
path. Explicit Save Session captures a fresh thumbnail immediately unless
thumbnail capture is disabled. Background autosave defers while pointer,
control, camera, or layout interaction is active, then flushes the coalesced
state after the interaction idle window. Background autosave may refresh the
thumbnail only when the session is dirty, the interaction idle window has
elapsed, no pointer/control/camera/layout interaction is active, and the minimum
autosave thumbnail interval has elapsed. The default autosave interval is
`30000` ms.
Set `session.thumbnail.autosaveMinIntervalMs = false` or
`sessionThumbnail.autosaveMinIntervalMs = false` to disable background thumbnail
refresh while keeping explicit Save Session thumbnails. The default capture is
capped at `96 x 64` pixels and `24 KB`; disable all thumbnail capture with
`session.thumbnail = false` or `sessionThumbnail = false`.

Session network persistence defaults to `zxnet` for the graph payload. The
session manifest still stores small JSON metadata for fast listing and restore
decisions, but large payloads are side records: graph bytes live in
`networkData`, and changing layout positions live in a separate compressed
binary `positionData` record. Browser `SessionStore` records split both payloads
out of the manifest so state-only autosaves can update the small session
manifest, and position autosaves can update positions without rewriting the full
graph blob.

State-only autosave is incremental. `helios.states` emits changed/deleted
override deltas, storage coalesces repeated writes to the same key, and the
flush merges only the pending deltas into the existing session manifest.
Resetting a setting writes a delete delta. Camera controls, camera pose, scene
dimension, mapper channels, filters, selectors, selection, labels, legends, and
layout controls restore through state keys. Explicit network/session export
defaults to a sparse tracked visualization envelope; graph, attribute, and
current-position payloads stay in the portable network payload, while
`storageState.state` contains only tracked overrides. Callers can still request
full legacy-style visualization data with `fullVisualizationState: true` or
`trackedOnly: false` for diagnostics.

Named file loads and drag/drop loads start a new session by default, named from
the network filename, and flush the previous session first so it can still be
resumed. Opt out for a specific load:

```js
await helios.loadNetwork(file, {
  format: 'xnet',
  preserveSession: true,
});
```

Useful session APIs:

```js
helios.storage.configureSession({ url: true });
await helios.storage.flush({ includeNetwork: true });
const summaries = await helios.storage.listSessionSummaries();
const resumeSessions = await helios.storage.getResumeSessions();
const prompt = await helios.storage.getResumePrompt();
await helios.storage.resumeSession(sessionId);
await helios.storage.saveSession({ nickname: 'experiment A' });
await helios.storage.startNewSession({ nickname: 'experiment B' });
await helios.storage.deleteSession(sessionId);
await helios.storage.markSessionFinished(sessionId);

const snapshot = await helios.storage.serializeSessionSnapshot();
await helios.storage.restoreSessionSnapshot(snapshot);

const networkSnapshot = await helios.storage.serializeNetworkSnapshot();
await helios.storage.attachVisualizationStateToNetwork(networkSnapshot);
```

Resume and restore are centralized in `helios.storage`. Browser and remote
storage managers save, list, load, and delete session envelopes through their
own `SessionStore`. When a valid
`sessionId` is present in the URL, Helios restores that session during
initialization and does not show the resume prompt. When no valid explicit
session is present, `helios.storage.getResumePrompt()` returns the latest restorable sessions
for the UI prompt and Session tab. `resumeSession(id)` is the preferred public
method for user-driven session switches; `restoreSession()` remains available
for lower-level compatibility.

Session restore restores saved settings, camera state, network data, layout
positions, layout parameters, and the saved layout run/temperature state. The
layout may continue moving after reload, but it starts from the saved positions
and runtime state rather than being reinitialized.

Pending changes to the same key are coalesced before they are saved. The
current session record is still stored by session id, so saving the same session
id replaces that session's current manifest/network payload. Saved journal
entries remain as history; only unsaved pending entries are collapsed to the
latest value for each key.

## Network And Position Persistence

Network persistence and position persistence are separate developer controls:

```js
const helios = new Helios(network, {
  storage: { type: 'browser', persistNetwork: true },
  workspaceId: 'project:demo',
  networkPersistence: {
    enabled: true,
    autosave: true,
    debounceMs: 2000,
  },
  positionPersistence: {
    enabled: true,
    autosave: true,
    debounceMs: 750,
  },
});
```

Browser storage enables the session/persistence backend, but apps should set
network and position autosave policy explicitly. The main app enables both
autosave paths by default and lets query parameters disable either one:

```js
networkPersistence: { enabled: true, autosave: false }
positionPersistence: { enabled: true, autosave: false }
```

The Data > Network save action can still write current positions into the
portable network state for explicit exports. Session autosave treats graph bytes
and position bytes separately. Network serialization is reserved for explicit
save/manual sync and network replacement/initial-network dirty events. Normal
settings, camera, and UI writes are state-only, cheap, debounced, and coalesced
to the latest value per key. Position writes snapshot the active delegate or
network position buffer into the compressed binary position side record after
the autosync debounce and interaction-idle guard. These session writes keep the
existing network side-record reference and do not rewrite full graph bytes.
They may carry a throttled thumbnail refresh through the autosave thumbnail
policy described above; if the policy declines capture, the existing thumbnail
is preserved.

Automatic sync waits for view interaction to go idle before doing any session
write. Camera pan, zoom, rotate, touch gestures, layout updates, and control
drags reset the idle timer; manual `flush()` / `sync()` calls still run
immediately and are allowed to write full network and position payloads. Configure the idle window with
`autosyncInteractionIdleMs` or `session.autosyncInteractionIdleMs` (default
`1000` ms), or set it to `0` / `false` to disable this guard.
`flushAutosync()` uses the same autosave thumbnail policy; manual full
`flush()` / `sync()` calls can capture a thumbnail immediately unless
`captureThumbnail: false` or thumbnail capture is disabled.

Autosync also has a payload-size guard. If the active network or position
payload is larger than the configured autosync limit, Helios disables autosync
for that session instead of repeatedly serializing expensive data in the
background. The session remains dirty; closing or reloading the page triggers
the browser's unsaved-changes warning. The user can still press Sync or Save
Session manually, and those manual paths save the full graph and position side
records. In the Data panel the Auto Sync toggle is forced off and disabled with
a hover reason, while the sync label continues to show the dirty age such as
`Synced 42s ago` until a manual save completes.

Autosave scheduling is centralized in `helios.storage`. Settings, session
records, network data, and positions all request work from the same queue.
That queue applies the normal debounce first, then waits for the interaction
idle guard, then emits sync status only when a write actually starts or
completes. Generic camera/control changes can update persistence markers without
repainting the visible status text on every pointer move. The UI shows `Synced`
when the active session is up to date; it shows `Synced Xs ago` only while
there are dirty changes waiting to be written after that last successful sync,
and that pending-age text is refreshed periodically rather than on each dirty
event. Completion of a save updates the label back to `Synced` immediately.

Use the shared autosync controls when an integration needs to coordinate with
expensive host work:

```js
// mutate settings, network, or positions
await helios.storage.flush({ includeSession: true });
await helios.storage.sync({ includeNetwork: true, includePositions: true });
```

Storage managers may expose richer host-specific autosync controls, but most UI
code should prefer writing persistence keys or calling `markNetworkDirty()` /
`markPositionsDirty()` and let the service choose the timing.

Delegate/GPU layouts snapshot positions asynchronously. Non-delegate layouts read
the active/network position buffers. Position payloads are stored as Float32
binary bytes and gzip-compressed when the runtime exposes compression streams;
otherwise Helios stores the raw Float32 bytes. Autosync uses the payload-size
guard before taking large position snapshots; manual Sync and Save Session use
the same storage format without the autosync cap.

## Large-Network Autosave Verification

Large-network storage checks should instrument browser-side method calls rather
than infer behavior from elapsed time alone. The regression contract is:

- hot controls and camera interaction do not synchronously call
  `helios.savePortableNetwork(...)`;
- hot controls and camera interaction do not synchronously call
  `helios.serializeVisualizationState(...)` or
  `helios.serializeVisualizationStateAsync(...)`;
- state-only autosave performs at most one coalesced incremental session
  manifest write after the interaction idle window, without rebuilding a full
  visualization/session snapshot;
- state-only autosave keeps `includeNetwork: false`, so `SessionStore.put(...)`
  updates the session manifest without rewriting the network side record;
- thumbnail capture only happens through
  `helios.storage.captureSessionThumbnail(...)` after dirty, idle, and
  `autosaveMinIntervalMs` gates all allow it.

The default browser regression uses the generated grid path:

```bash
npm run test:e2e -- tests/ui-responsiveness.spec.js --project=chromium --workers=1
```

For machine-local headed WebGPU correlation runs, use the optional storage perf
path. It records frame interval summaries, storage method counters, method
durations, and whether frames over 50 ms overlap storage events:

```bash
HELIOS_PERF_NODE_COUNTS=100000,1000000 npm run perf:storage
```

The optional path exercises both `dataset=grid` and `dataset=grid3d&mode=3d`.
It writes JSONL history to
`artifacts/performance-history/helios-storage-autosave.jsonl` unless
`HELIOS_STORAGE_PERF_HISTORY_FILE` overrides the location.

The Data > Network panel shows compact status such as `Synced`,
`Synced 1m ago` for pending dirty changes, or `Remote failed`, plus an Auto Sync
toggle in the status row. When autosync is disabled by the payload-size guard,
the toggle is forced off/disabled with the reason on hover, and the status text
continues to show the dirty age until a manual sync/save completes.

## Portable Network Attributes

Hidden network attributes store portable network-scoped settings and positions.
They should not store:

- remote credentials
- user/global preferences
- workspace preferences
- host-app private state unrelated to the network

Save with visualization state:

```js
const blob = await helios.savePortableNetwork('zxnet', {
  output: 'blob',
  includeVisualization: true,
});
```

`savePortableNetwork(..., { includeVisualization: true })` uses
`helios.storage` to capture `storageState`, attach the visualization envelope,
and record portable network-scoped state. Browser and remote storage keep
durable network/blob persistence opt-in through `persistNetwork: true`; dummy
storage only contributes the export snapshot state.

The built-in Data panel Save action uses `helios.storage.saveNetworkSnapshot()`
for `.xnet`, `.zxnet`, and `.bxnet` files. It writes a full visualization
envelope plus the current layout/delegate positions, matching the native macOS
document-save path. Use plain `helios.saveNetwork()` only when an application
intentionally wants a raw graph export without attached Helios state.

Network I/O supports `.xnet`, `.zxnet`, `.bxnet`, `.gml`, graph-tool `.gt`,
and zstd-compressed graph-tool `.gt.zst` input.
GML and GT exports are lossy interoperability formats: they are useful for
topology and portable public attributes, but cannot preserve all Helios private
state, credentials, or every attribute shape.

## Remote Session API

`RemoteStorageManager` expects a client object. A REST wrapper commonly maps
that client to:

```text
GET    /sessions
GET    /sessions/:sessionId
PUT    /sessions/:sessionId
DELETE /sessions/:sessionId
```

`GET /sessions/:sessionId` returns `404` for a missing session or a session
envelope:

```json
{
  "schema": "helios-web.persistence",
  "version": 1,
  "kind": "session",
  "payload": {
    "session": {
      "id": "demo-session",
      "workspaceId": "project:demo",
      "nickname": "demo"
    },
    "visualizationState": {
      "schema": "helios-web.persistence",
      "version": 1,
      "kind": "visualization"
    },
    "networkData": {
      "format": "zxnet",
      "data": null
    }
  },
  "metadata": {}
}
```

`PUT` receives the same shape. The host wrapper owns authentication headers,
multi-tenant routing, and object storage for large network payloads.

```js
import express from 'express';

const app = express();
app.use(express.json({ limit: '10mb' }));

const records = new Map();

app.get('/api/storage/sessions/:sessionId', (req, res) => {
  const record = records.get(req.params.sessionId);
  if (!record) return res.sendStatus(404);
  res.json(record);
});

app.put('/api/storage/sessions/:sessionId', (req, res) => {
  records.set(req.params.sessionId, {
    ...req.body,
    updatedAt: Date.now(),
  });
  res.sendStatus(204);
});

app.listen(8787);
```

Use it from Helios:

```js
const helios = new Helios(network, {
  storage: {
    type: 'remote',
    persistNetwork: true,
    client: {
      putSession: async (record) => fetch(`/api/storage/sessions/${record.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      }),
      getSession: async (id) => {
        const response = await fetch(`/api/storage/sessions/${id}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        return response.ok ? response.json() : null;
      },
      listSessions: async () => [],
      deleteSession: async (id) => fetch(`/api/storage/sessions/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      }),
    },
  },
  workspaceId: 'project:demo',
});
```

## Session Record Shape

Remote storage uses full storage session records. The required client methods
are `putSession(record)`, `getSession(id)`, `listSessions(options)`, and
`deleteSession(id)`. Optional unfinished-session pointer methods are
`getUnfinishedSessionId(workspaceId)` and
`setUnfinishedSessionId(id, workspaceId)`.

A stored session record is a storage envelope:

```json
{
  "schema": "helios-web.persistence",
  "version": 1,
  "kind": "session",
  "id": "session-123",
  "payload": {
    "session": {
      "id": "session-123",
      "workspaceId": "project:demo",
      "nickname": "network",
      "updatedAt": 1710000000000,
      "unfinished": true
    },
    "visualizationState": {
      "payload": {
        "storageState": {
          "schema": "helios-web.storage",
          "state": {
            "overrides": {
              "camera.zoom": 2.5
            }
          }
        }
      }
    }
  }
}
```

## Browser Storage And Quota

Browser session persistence uses IndexedDB as the durable store for session
envelopes and full session manifests. `localStorage` is only a compact fallback
for small pointers/metadata because browser Web Storage quotas are low, string
only, and synchronous. Helios therefore stores large network bytes, position
payloads, and full manifests in IndexedDB where possible.

If a `localStorage` write hits quota, Helios keeps full session records in
IndexedDB. This prevents `QuotaExceededError` from breaking autosave/reload
flows.
Servers should set appropriate body size limits and return non-2xx on rejected
payloads so Helios can surface `Remote failed` or `Network too large`.

Remote storage delegates record I/O to a storage client supplied by the host
application.

```js
const helios = new Helios(network, {
  storage: {
    type: 'remote',
    persistNetwork: true,
    client: {
      putSession: async (record) => api.saveSession(record),
      getSession: async (id) => api.loadSession(id),
      listSessions: async () => api.listSessions(),
      deleteSession: async (id) => api.deleteSession(id),
    },
  },
  workspaceId: 'project:demo',
});
```

## CLI, Desktop, Widget, And Tests

Use a custom storage client when the host already owns persistence:

```js
const helios = new Helios(network, {
  storage: {
    type: 'remote',
    client: {
      putSession: async (record) => widgetModel.set('session_state', record),
      getSession: async () => widgetModel.get('session_state'),
      listSessions: async () => [widgetModel.get('session_state')].filter(Boolean),
    },
  },
  workspaceId: kernelSessionId,
});
```

`helios-cli` uses this pattern with browser local storage for in-page state and
mirrors sparse status, overrides, and the storage journal to its filesystem
session state. CLI full-session checkpoints default to `zxnet` so
network and position bytes stay compressed; RPC callers can still pass
`networkFormat` when they need another portable format. Relevant RPCs should
wrap storage status, flush, change journal, reset, and save operations.

`helios-desktop` talks to the same CLI storage RPCs. The window title/status
uses storage status, including active syncing, dirty positions, dirty network
payloads, and skipped too-large network saves.

`helios-mac` embeds Helios in a native document window and uses in-memory
storage as a document dirtiness adapter. Native Open/Save owns disk I/O;
`helios.storage` owns tracked state deltas, network dirty flags, position dirty
flags, and the full portable snapshot used for `xnet`, `zxnet`, and `bxnet`
document saves.

`helios-widget` passes a traitlet-backed storage client through widget state.
Settings state is deduplicated before writing back to Python so notebook
traitlets are not spammed, while network mutations continue to flow through the
widget's normal snapshot/mutation channel.

Tests should cover both registry logic and host integration. At minimum, changes
to storage should run the web-next unit storage tests, browser session tests,
and the CLI/desktop/widget integration tests that assert each host passes a
storage client and exposes storage status.

CLI and desktop integrations should provide a workspace/session id from their
project context and may expose storage status, flush, changes, and reset over
their RPC layer by forwarding to `helios.storage`.

## Troubleshooting

- No data is saved: confirm `storage`, `session`, `workspaceId`,
  `networkPersistence`, or `positionPersistence` was provided. Default library
  construction uses dummy storage.
- URL reload does not restore: sessions require `session: { url: true }` and a
  `sessionId` in the URL or an auto-generated one.
- Resume prompt is missing: only older unfinished sessions excluding the current
  URL session are shown.
- Layout reruns after restore: default session restore does not restart layouts;
  check whether the app passed `restoreLayoutRunState: true` or starts layout
  separately after `helios.ready`.
- GML/GT lost settings: use `xnet`, `zxnet`, or `bxnet` for full Helios
  portable state. GML and GT are intentionally lossy interoperability formats.
