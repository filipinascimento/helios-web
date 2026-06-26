# Helios Storage Session Change Tracking

`helios.states` owns live state, defaults, overrides, bindings, and dirty
reporting. `helios.storage` owns durable session sync and portable network
visualization snapshots by subscribing to `helios.states`. New code should not
call a separate persistence or session service.

## Current Model

- `SessionStore` stores session envelopes, side records for large network
  payloads, and the workspace-scoped unfinished-session pointer.
- `HeliosStateManager` stores sparse overrides keyed by stable paths and
  computes exact, prefix, section, and panel status.
- `HeliosStorageManager` observes `helios.states`, serializes session
  snapshots, restores active sessions, captures optional thumbnails, mutates
  session nicknames, and delegates remote record I/O through storage clients.
- Browser sessions use IndexedDB when available, with Web Storage as a compact
  fallback for indexed session ids and unfinished-session pointers.
- Remote sessions use the storage client methods `putSession`, `getSession`,
  `listSessions`, and `deleteSession`.

## State APIs

- `helios.states.get(path)`
- `helios.states.set(path, value, options)`
- `helios.states.reset(pathOrPrefix)`
- `helios.states.status(pathOrPrefix)`
- `helios.states.getOverrides(options)`

## Storage APIs

- `helios.storage.configureSession(options)`
- `helios.storage.flush(options)` / `helios.storage.sync(options)`
- `helios.storage.restoreSession(id, options)`
- `helios.storage.serializeNetworkSnapshot(options)`
- `helios.storage.attachVisualizationStateToNetwork(snapshot, options)`
- `helios.storage.restorePortableStateFromNetwork(options)`

## Dirty And Sync Behavior

- UI and behavior changes write through `helios.states.set(...)`.
- Dirty indicators subscribe to the exact key or schema scope they display.
- Hot UI inputs update the live target immediately and keep session autosync
  debounced off the interaction path.
- Autosync is serialized and rate-limited. Changes that arrive while a sync is
  running or inside the minimum sync interval stay accumulated in the pending
  delta map; the next autosync writes the latest value for each changed key.
- Interaction/UI/camera autosaves write state-only manifests when only sparse
  state overrides changed. Position autosaves write the compressed `positionData`
  side record and keep the existing network side-record reference. Autosave
  thumbnail refresh is allowed only through the centralized dirty, idle,
  active-interaction, and minimum-interval policy; skipped captures preserve the
  existing thumbnail.
- Network replacement and initial-network dirty events can request a full
  network save; manual Save Session / Sync remains the explicit full-save path.
- Camera and position changes use the session interaction-idle window before
  autosync updates the saved timestamp.
- Network and position dirty flags are reported by `helios.storage.status()` and
  surfaced in Data > Network.

## Test Plan

- Unit tests cover sparse overrides, reset-to-default, alias migration,
  storage-native session snapshots, remote client delegation, nickname mutation,
  thumbnails, and portable network storage state.
- Browser tests cover valid and invalid explicit session ids, resume prompt
  behavior, Save Session, portable network import/export, dirty markers, and UI
  responsiveness.
