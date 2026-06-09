# Centralized Persistence

Helios exposes one persistence entry point at `helios.persistence`, but durable
persistence is off by default when Helios is used as a library. A plain
`new Helios(network, { container })` creates no browser storage backends, writes
no hidden network attributes, starts no session, and does not add a `sessionId`
to the URL.

Enable persistence explicitly when an app wants it:

```js
const helios = new Helios(network, {
  container: '#app',
  persistence: true,
  workspaceId: 'project:demo',
});
await helios.ready;
```

The bundled demo opts in so persistence, sessions, and resume UI can be tested
there without surprising library consumers.

## Model

The registry stores explicit dot keys and resolves them with VSCode-style
precedence:

```text
defaults < user < workspace < network < session
```

Values are stored sparsely. If a write matches the lower-precedence value, the
override is removed instead of duplicated. This keeps network files portable and
small while allowing network-scoped settings and positions to travel with the
graph.

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
  persistence: true,
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
  persistence: {
    browser: true,
    networkAttributes: true,
  },
  workspaceId: 'my-app:workspace-42',
});
```

Disable durable persistence even if other app code still reads `helios.persistence`:

```js
const helios = new Helios(network, {
  container: '#app',
  persistence: false,
});
```

Passing persistence-related top-level options also opts in:

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

## Backends

`BrowserPersistenceBackend`
: Stores user, workspace, and session registry layers in browser storage.

`NetworkAttributePersistenceBackend`
: Stores only the `network` layer in hidden/private network attributes. It also
maintains a stable hidden network id when the network can be annotated. Remote
credentials, user preferences, and workspace preferences are never written here.

`RemotePersistenceBackend`
: Syncs registry layers through REST. It accepts `url`, `key`, `apiKey`,
`token`, `headers`, `enabled`, `writable`, and `scopes`.

`CustomPersistenceBackend`
: Lets CLI, desktop, widgets, tests, or host apps inject `read(context)` and
`write(record, context)` functions.

Example with remote and custom host storage:

```js
import {
  CustomPersistenceBackend,
  Helios,
  RemotePersistenceBackend,
} from 'helios-web-next';

const helios = new Helios(network, {
  container: '#app',
  workspaceId: 'project:demo',
  persistence: {
    backends: [
      new RemotePersistenceBackend({
        url: 'https://persistence.example.com/api',
        token: authToken,
        headers: { 'X-Project': 'demo' },
      }),
      new CustomPersistenceBackend({
        id: 'host-app',
        read: async () => host.loadPersistence(),
        write: async (record) => host.savePersistence(record),
      }),
    ],
  },
});
```

## Keys And Bindings

Register defaults once in the persistence layer. UI panels and controllers
should read defaults/status from the registry instead of duplicating defaults.

```js
helios.persistence.registerKey('layout.parameters.gravity', {
  defaultValue: 0.0008,
  scope: 'network',
  debounceMs: 150,
  validate: (value) => Number.isFinite(value) && value >= 0,
});

helios.persistence.bindKey('layout.parameters.gravity', {
  read: () => layout.gravity(),
  apply: (value) => layout.gravity(value),
  events: (notify) => layout.on('change.persistence', notify),
});

helios.persistence.subscribe('layout.parameters.gravity', ({ value }) => {
  console.log('gravity changed', value);
});
```

Built-in behaviors are bound automatically by Helios. Layout, legend, filter,
mapper, and selection changes are stored through canonical behavior keys such as
`behaviors.layout.state`, while panel-friendly aliases such as
`layout.layoutType`, `layout.parameters.gravity`, `legends.enabled`,
`filters.rules`, and `selection.selectedNodes` are updated at the same time.
Programmatic calls, CLI/session restores, and UI edits therefore mark and reset
through the same registry paths.

Core methods:

- `registerKey(path, options)`
- `bindKey(path, binding)`
- `bindBehaviorState(id, behavior, options)` / `unbindBehaviorState(id, behavior)`
- `get(path, fallback)`
- `set(path, value, { scope, source, reason })`
- `reset(pathOrScope)`
- `keyStatus(pathOrScope, options)`
- `subscribe(path, callback)`
- `flush(options)` / `sync(options)`
- `status()` / `backendStatus()`
- `markNetworkDirty(reason)` / `markPositionsDirty(reason)`
- `savePortableStateToNetwork(options)`
- `restorePortableStateFromNetwork(options)`

## Sessions

Sessions are also opt-in. Local browser sessions can use URL routing:

```js
const helios = new Helios(network, {
  container: '#app',
  persistence: true,
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
    },
    networkPersistence: {
      enabled: true,
      format: 'zxnet',
    },
  },
});
```

When `session.url` is enabled, Helios adds a generated `sessionId` to the URL if
one is missing. Reloading the URL restores that session. Opening a URL without a
session id creates a new session and lets the UI offer older unfinished sessions
through the resume prompt. If multiple sessions are available, the Resume button
opens a chooser.

Session retention is controlled by `session.retention`. Omitted URL parameters
or omitted retention fields keep the configured defaults; for example, omitting
`maxSessions` keeps the default list size instead of pruning down to one
session.

Session records can include a tiny PNG thumbnail used by the Resume prompt and
Data > Session list. Thumbnails are captured through the figure preview export
path only when a session record is saved, not on every settings write. The
default capture is capped at `96 x 64` pixels and `24 KB`; disable it with
`session.thumbnail = false` or `sessionThumbnail = false`.

Session network persistence defaults to `zxnet`, which keeps graph and position
attributes in a compact compressed network payload. The session manifest still
stores small JSON metadata for fast listing and restore decisions, but large
network and position data should live in the network payload whenever possible.

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
await helios.persistence.flush({ includeNetwork: true });
const sessions = await helios.persistence.getRestorableSessions();
const resumeSessions = await helios.persistence.getResumeSessions();
const prompt = await helios.persistence.getResumePrompt();
const summaries = await helios.persistence.listSessionSummaries();
await helios.persistence.resumeSession(sessionId);
await helios.persistence.startNewSession({ nickname: 'experiment A' });
await helios.persistence.setSessionNickname('curated layout');
await helios.persistence.deleteSession(sessionId);
```

Resume and restore are centralized in `helios.persistence`. When a valid
`sessionId` is present in the URL, Helios restores that session during
initialization and does not show the resume prompt. When no valid explicit
session is present, `getResumePrompt()` returns the latest restorable sessions
for the UI prompt and Session tab. `resumeSession(id)` is the preferred public
method for user-driven session switches; `restoreSession()` remains available
for lower-level compatibility.

Session restore restores saved settings, camera state, network data, and layout
positions. It does not restart a running layout by default; pass
`restoreLayoutRunState: true` only if your app explicitly wants to resume layout
execution.

Pending changes to the same key are coalesced before they are saved. The
current session record is still stored by session id, so saving the same session
id replaces that session's current manifest/network payload. Saved journal
entries remain as history; only unsaved pending entries are collapsed to the
latest value for each key.

## Network And Position Persistence

Network persistence and position persistence are separate developer controls:

```js
const helios = new Helios(network, {
  persistence: true,
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

With persistence enabled, network and position autosave default on. Apps can
disable either one independently:

```js
networkPersistence: { enabled: true, autosave: false }
positionPersistence: { enabled: true, autosave: false }
```

The Data > Network save action always writes current positions into the portable
network state before serializing. Network serialization is reserved for explicit
save, manual sync, idle autosave, or network/position dirty events. Normal
settings writes are cheap and debounced.

Automatic sync waits for view interaction to go idle before doing heavier work
such as network serialization, delegate readback, or session manifest snapshots.
Camera pan, zoom, rotate, and touch gestures reset the idle timer; manual
`flush()` / `sync()` calls still run immediately. Configure the idle window with
`autosyncInteractionIdleMs` or `session.autosyncInteractionIdleMs` (default
`1000` ms), or set it to `0` / `false` to disable this guard.

Autosave scheduling is centralized in `helios.persistence`. Settings, session
checkpoints, network data, and positions all request work from the same queue.
That queue applies the normal debounce first, then waits for the interaction
idle guard, then emits sync status only when a write actually starts or
completes. Generic camera/control changes can update persistence markers without
repainting the visible `Synced ...` text on every pointer move.

Use the shared autosync controls when an integration needs to coordinate with
expensive host work:

```js
helios.persistence.pauseAutosync('bulk-import');
// mutate settings, network, or positions
helios.persistence.resumeAutosync();

helios.persistence.cancelAutosync();
await helios.persistence.flushAutosync({ includeSession: true });
const autosync = helios.persistence.autosyncStatus();
```

`scheduleAutosync()` is also public for custom backends/controllers, but most UI
code should prefer writing persistence keys or calling `markNetworkDirty()` /
`markPositionsDirty()` and let the service choose the timing.

Delegate/GPU layouts snapshot positions asynchronously. Non-delegate layouts read
the active/network position buffers. If a network or position payload is too
large, autosave is skipped, status remains dirty, and the UI keeps a manual sync
button available.

The Data > Network panel shows compact status such as `Synced 1m ago`,
`Remote failed`, `Positions dirty`, `Network dirty`, or `Network too large`, plus
an Auto Sync toggle in the status row.

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

Network I/O supports `.xnet`, `.zxnet`, `.bxnet`, and `.gml`. GML export is
lossy: it is useful for topology and portable public attributes, but cannot
preserve all Helios private state, credentials, or every attribute shape.

## Remote Registry API

`RemotePersistenceBackend` expects a small JSON REST API:

```text
GET  /persistence/:workspaceId
PUT  /persistence/:workspaceId
```

`GET` returns `404` for a missing workspace or a JSON record:

```json
{
  "schema": "helios-web.centralized-persistence",
  "version": 1,
  "workspaceId": "project:demo",
  "networkId": "helios-network:...",
  "updatedAt": 1710000000000,
  "layers": {
    "defaults": {},
    "user": {},
    "workspace": {
      "ui.theme": "dark"
    },
    "network": {
      "appearance.nodeStyle.sizeScale": 1.2
    },
    "session": {}
  },
  "metadata": {}
}
```

`PUT` receives the same shape. The server should persist the full record for the
workspace id. `RemotePersistenceBackend` sends:

- `Authorization: Bearer <key|apiKey|token>` when a key/token is configured and
  the caller did not provide an `Authorization` header.
- Any custom headers from `remote.headers`.
- `Content-Type: application/json` on writes.

Minimal Express-style server:

```js
import express from 'express';

const app = express();
app.use(express.json({ limit: '10mb' }));

const records = new Map();

app.get('/api/persistence/:workspaceId', (req, res) => {
  const record = records.get(req.params.workspaceId);
  if (!record) return res.sendStatus(404);
  res.json(record);
});

app.put('/api/persistence/:workspaceId', (req, res) => {
  records.set(req.params.workspaceId, {
    ...req.body,
    workspaceId: req.params.workspaceId,
    updatedAt: Date.now(),
  });
  res.sendStatus(204);
});

app.listen(8787);
```

Use it from Helios:

```js
const helios = new Helios(network, {
  persistence: {
    remote: {
      url: 'http://localhost:8787/api',
      token: authToken,
    },
  },
  workspaceId: 'project:demo',
});
```

## Remote Session API

When `session.remote` is configured, session manifests/events/network blobs use
separate endpoints:

```text
GET  /sessions/:sessionId/manifest
PUT  /sessions/:sessionId/manifest
POST /sessions/:sessionId/events
PUT  /sessions/:sessionId/blobs/:blobId
GET  /sessions/:sessionId/blobs/:blobId
```

The manifest is the lightweight session record used for fast reload:

```json
{
  "schema": "helios-web.session-manifest",
  "version": 1,
  "sessionId": "session-123",
  "nickname": "network",
  "updatedAt": 1710000000000,
  "overrides": {
    "camera.zoom": 2.5,
    "appearance.nodeStyle.sizeScale": 1.4
  },
  "journal": [],
  "checkpointSeq": 0,
  "networkPersistence": {
    "enabled": true,
    "format": "zxnet"
  },
  "networkData": {
    "status": "saved",
    "format": "zxnet",
    "blobId": "network-zxnet"
  },
  "layoutRuntimeState": null
}
```

`POST /events` receives:

```json
{
  "events": [
    {
      "seq": 1,
      "timestamp": 1710000000000,
      "source": "user",
      "path": "camera.zoom",
      "oldValue": 1,
      "newValue": 2.5,
      "reason": "camera",
      "status": "saved"
    }
  ]
}
```

Blob endpoints store raw network bytes such as `xnet`, `zxnet`, or `bxnet`.

## Browser Storage And Quota

Browser session persistence uses IndexedDB as the durable store for session
envelopes and full session manifests. `localStorage` is only a compact fallback
for small pointers/metadata because browser Web Storage quotas are low, string
only, and synchronous. Helios therefore stores large network bytes, position
payloads, and full manifests in IndexedDB where possible.

If a `localStorage` manifest write hits quota, Helios now keeps the full
manifest in IndexedDB and writes only a compact best-effort local fallback. This
prevents `QuotaExceededError` from breaking autosave/reload flows while still
leaving a small legacy pointer when the browser allows it.
Servers should set appropriate body size limits and return non-2xx on rejected
payloads so Helios can surface `Remote failed` or `Network too large`.

`session.remote` accepts `url`, `key`, `apiKey`, `token`, and `headers`, matching
the registry remote backend.

```js
const helios = new Helios(network, {
  persistence: true,
  workspaceId: 'project:demo',
  session: {
    url: true,
    remote: {
      url: 'https://persistence.example.com/api',
      token: authToken,
      headers: { 'X-Project': 'demo' },
    },
  },
});
```

## CLI, Desktop, Widget, And Tests

Use `CustomPersistenceBackend` when the host already owns persistence:

```js
const backend = new CustomPersistenceBackend({
  id: 'widget-traitlets',
  read: async () => widgetModel.get('settings_state'),
  write: async (record) => widgetModel.set('settings_state', record),
});

const helios = new Helios(network, {
  persistence: { backends: [backend] },
  workspaceId: kernelSessionId,
});
```

`helios-cli` uses this pattern with browser local storage as the in-page backend
and mirrors sparse status, overrides, backend status, and the journal to its
filesystem session state. CLI full-session checkpoints default to `zxnet` so
network and position bytes stay compressed; RPC callers can still pass
`networkFormat` when they need another portable format. Relevant RPCs are:

- `persistence.status`
- `persistence.backendStatus`
- `persistence.flush`
- `persistence.changes`
- `persistence.reset`
- `persistence.save`

`helios-desktop` talks to the same CLI persistence RPCs. The window title/status
uses the centralized status model, including backend failures, active syncing,
dirty positions, dirty network payloads, and skipped too-large network saves.

`helios-widget` passes a traitlet-backed custom backend through
`persistence_state`. Settings persistence is deduplicated before writing back to
Python so notebook traitlets are not spammed, while network mutations continue to
flow through the widget's normal snapshot/mutation channel.

Tests should cover both registry logic and host integration. At minimum, changes
to persistence should run the web-next unit persistence tests, browser session
tests, and the CLI/desktop/widget compatibility tests that assert each host
still passes a custom backend and exposes backend status.

CLI and desktop integrations should provide a workspace/session id from their
project context and may expose `persistence.status`, `persistence.flush`,
`persistence.changes`, and `persistence.reset` over their RPC layer by forwarding
to `helios.persistence`.

## Troubleshooting

- No data is saved: confirm `persistence` or a persistence-related option was
  provided. Default library construction is storage-free.
- URL reload does not restore: sessions require `session: { url: true }` and a
  `sessionId` in the URL or an auto-generated one.
- Resume prompt is missing: only older unfinished sessions excluding the current
  URL session are shown.
- Layout reruns after restore: default session restore does not restart layouts;
  check whether the app passed `restoreLayoutRunState: true` or starts layout
  separately after `helios.ready`.
- GML lost settings: use `xnet`, `zxnet`, or `bxnet` for full Helios portable
  state. GML is intentionally lossy.
