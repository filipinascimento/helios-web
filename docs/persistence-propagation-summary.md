# Persistence And State Propagation Summary

This note summarizes the current `helios-web-next` state, persistence, and
session contract so the same behavior can be propagated to `helios-cli` and
Helios desktop.

## Core Architecture

- `helios.states` is the live hierarchical state graph. It owns registered
  state entries, defaults, explicit overrides, bindings, key-based
  subscriptions, dirty-marker status, aliases, and reset-to-default behavior.
- `helios.storage` is the durable/session layer. It observes `helios.states`,
  coalesces incremental changes, writes session records, restores sessions, and
  handles portable network snapshots.
- The old persistence/session service should not be used by new integrations.
  Treat `helios.storage` as the only session and durable-sync facade.
- Storage saves sparse tracked state, not full live state snapshots.
  Visualization/session payloads carry overrides through
  `storageState.state.overrides`; `storageState.state.values` should not be
  required by new code.
- Large graph bytes and node positions are not stored in the state map. They
  live in network/session payloads or side records.

## State And Binding Contract

- Register state through `helios.states.register(owner, prefix, entries)` or the
  behavior `stateEntries()` path. Built-in behaviors are attached by
  `BehaviorManager`, then registered into storage/state with stable prefixes.
- Entries describe values and bindings only. UI panel/section placement belongs
  to panel schemas, not state entries.
- Defaults are the current baseline. If Helios chooses a value heuristically
  from network size, density, layout type, or renderer conditions, register that
  computed value as the default or set it with `trackOverride: false`.
- Intentional writes create overrides. UI controls, programmatic API calls, and
  CLI commands should call:

```js
helios.states.set(path, value, {
  source: 'ui', // or 'program' / 'cli'
  reason: 'short-reason',
  scope: 'user', // or workspace / network / session
});
```

- Non-intentional refreshes, restore application, binding echoes, and default
  initialization must use `trackOverride: false`.
- A state becomes untracked only through an explicit reset:

```js
helios.states.reset(pathOrPrefix);
```

  Do not infer reset just because `value === defaultValue`.
- Subscriptions are key-based. Consumers should subscribe only to the exact key
  or prefix they need. Do not add notify-all paths.
- Mappers, filters, labels, layout, camera, and selection use nested keys and
  aliases, such as:
  - `mappers.node.*`
  - `filters.*`
  - `selection.*`
  - `labels.*`
  - `layout.layoutType`
  - `layout.parameters.<name>`
  - `camera.pose`
  - `camera.controls`

## Session And Storage APIs

Preferred API surface:

```js
helios.storage.configureSession(options);
await helios.storage.flush(options);
await helios.storage.sync(options); // alias for flush
await helios.storage.flushAutosync(options);
await helios.storage.loadSession(sessionId);
await helios.storage.restoreSession(sessionIdOrRecord, options);
await helios.storage.resumeSession(sessionId, options);
await helios.storage.deleteSession(sessionId);
helios.storage.status();
helios.storage.debugStats({ windowMs });
```

Portable network helpers:

```js
await helios.storage.serializeNetworkSnapshot(options);
await helios.storage.attachVisualizationStateToNetwork(snapshot, options);
await helios.storage.restorePortableStateFromNetwork(options);
```

Remote or host storage clients should provide:

```text
putSession(record)
getSession(sessionId)
listSessions(options)
deleteSession(sessionId)
```

Optional unfinished-session pointer methods can be provided by host apps that
want resume prompts across app restarts.

## Session IDs

- Browser-generated sessions now use short random IDs.
- New IDs should not include a `session:` prefix.
- URL routing uses the `sessionId` parameter by default.
- If a valid explicit `sessionId` is present, restore it directly.
- If an explicit ID is missing/invalid, expose resumable sessions instead of
  silently starting a conflicting restore.

## Autosync Model

- Manual `flush()` / `sync()` is the explicit full-save path. It can save
  sparse state, graph/network payloads, current positions, and thumbnails.
- Autosync is incremental and centralized in `helios.storage`.
- Hot UI or camera interactions should update the live view immediately, mark
  state/positions dirty, and let storage schedule durable work.
- Autosync must wait for interaction idle before writing. Camera pan, zoom,
  rotate, touch gestures, layout activity, and control drags reset the idle
  guard. The default idle window is controlled by
  `autosyncInteractionIdleMs` / `session.autosyncInteractionIdleMs`.
- State-only autosync writes sparse override deltas and should not rewrite graph
  bytes.
- Position autosync writes a separate binary Float32 position payload or side
  record and should not rewrite graph bytes when the network itself did not
  change.
- Network serialization is reserved for explicit save/manual sync,
  network replacement, initial-network dirty events, or other deliberate
  network-level changes.
- Thumbnail refresh is throttled and centralized. Autosync can skip thumbnail
  capture and preserve the existing thumbnail; manual save can capture
  immediately unless disabled.

## Large Network Policy

- Autosync has payload-size guards for expensive graph or position payloads.
- If a network or position payload exceeds the autosync limit, autosync is
  forced off and disabled for that session.
- Restoring an already-large saved session must also come back with Auto Sync
  off/disabled, not enabled until the next dirty event.
- The session remains dirty after later changes; closing/reloading should warn
  about unsaved changes.
- Manual Sync or Save Session must still be allowed and must save the full graph
  and current positions.
- The UI should show Auto Sync disabled with a hover reason. The sync status
  should keep showing the dirty age, for example `Synced 42s ago`, until manual
  sync/save completes.

## Position Restore

- Restored sessions must restore displayed positions, including delegated layout
  positions.
- Layout may continue moving after restore, but it should continue from the
  restored positions, restored layout parameters, restored runtime state, and
  restored temperature.
- Position payloads are stored separately from graph/network payloads because
  positions change much more frequently than the graph.
- Current positions are stored as Float32 binary bytes and compressed when the
  runtime exposes compression streams.

## UI And Debug Behavior

- The Data panel has one sync control group: manual Sync, Auto Sync, and status
  live together.
- Disabled controls should look visually muted and blend with the current
  theme.
- Sync text should be stable:
  - `Synced` means clean/up to date.
  - `Synced Xs ago` means there are dirty changes waiting since the last save.
  - The age label should refresh periodically, not on every pointer event.
- Debug instrumentation is on by default for now. With debug enabled:
  - `window.__helios` points at the active Helios instance.
  - A right-docked Debug panel is appended when UI is enabled.
  - `helios.storage.debugStats({ windowMs })` reports tracked state count,
    state changes, UI-origin changes, persistence changes, session ID, and
    network dirty status.

## CLI Integration Checklist

- Use `helios.states.set(..., { source: 'cli' })` for user-requested CLI
  changes so they become explicit overrides.
- Use `helios.states.reset(pathOrPrefix)` for CLI reset commands.
- Use `trackOverride: false` for initialization, restore, or heuristic defaults.
- Prefer nested stable paths for mappers, filters, labels, layout, camera, and
  selection instead of opaque whole-state blobs.
- Call `helios.storage.flush()` or `helios.storage.sync()` when a CLI command
  explicitly saves a session.
- Do not serialize full live state maps. Export sparse overrides plus network
  and position payloads through `helios.storage`.
- For large networks, do not rely on background autosync. Surface that autosync
  is disabled and require an explicit save/sync command.

## Desktop Integration Checklist

- Use `helios.storage` as the single bridge between renderer state and the
  native session/document store.
- Implement the remote/host storage client methods for session records, or wrap
  the desktop document store behind an equivalent manager.
- Keep native close/reload handling aligned with browser behavior: if storage
  reports dirty state and autosync cannot run, show an unsaved-changes warning.
- Preserve the same large-network policy: Auto Sync disabled/off for oversized
  sessions, manual save still available.
- Store graph/network payloads and position payloads separately in the desktop
  document/session format.
- Keep thumbnails on the centralized throttle/manual-save policy. Avoid
  thumbnail capture during interaction.
- Expose equivalent debug data from `helios.storage.debugStats()` in developer
  builds or debug panels.

## Verification Targets

Ported integrations should cover:

- Fresh session -> user changes state -> reload same session -> sparse state is
  restored and only intentionally changed controls are marked tracked.
- Pan/zoom or camera interaction -> autosync waits for idle and does not write
  on every pointer event.
- Layout positions -> autosync/manual save -> reload -> displayed positions
  continue from the saved positions and layout runtime.
- Large network or large position payload -> autosync disabled/off on first
  dirty event and also after restoring the saved session.
- Manual Sync/Save Session on a large session -> full graph and positions saved.
- Reset to default -> override removed only through explicit reset.
- Mappers, filters, labels, layout, camera, and selection restore by nested
  state paths, not by broad full-object snapshots.
