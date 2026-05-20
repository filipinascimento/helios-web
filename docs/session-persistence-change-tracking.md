# Helios Session Persistence And Change Tracking

## Summary

Build first-class persistence in `helios-web-next`, with `helios-cli` using the same APIs. The model should persist only explicit user/CLI changes as overrides, keep a readable change journal for agents, and optionally persist the network/attributes when size limits allow. Browser IndexedDB/localStorage is the default backend; REST sync is an optional backend with S3-compatible storage documented as future work.

## Key Changes

- Add a `HeliosSessionController` inside `helios-web-next` with:
  - `sessionId`: provided via constructor option, URL query, or auto-generated.
  - `overrides`: sparse changed values only, keyed by stable paths like `appearance.nodeStyle.sizeScale`.
  - `journal`: append-only user/CLI change records with timestamp, source, path, old value, new value, and persistence status.
  - `dirtyState`: per-control, per-section, and per-panel changed/default/partial status.
- Extend persistence APIs:
  - `helios.persistence.configureSession({ id, autosave, local, remote, networkPersistence })`
  - `helios.persistence.getOverrides()`
  - `helios.persistence.getChangeJournal({ since, limit, source })`
  - `helios.persistence.resetOverride(path | scope)`
  - `helios.persistence.flush({ includeNetwork })`
  - `helios.persistence.restoreSession(id)`
- CLI additions:
  - `persistence.changes` to read journal entries since the last agent checkpoint.
  - `persistence.checkpoint` to mark "agent has seen changes through this sequence id".
  - `persistence.overrides`, `persistence.reset`, `persistence.flush`, and `persistence.status`.
  - CLI mutating RPCs must pass `source: "cli"`; UI changes pass `source: "user"`.

## Persistence Strategy

- Store changed settings as sparse patches, not full defaults. Restore applies defaults first, then session overrides.
- Persist layout runtime separately from sparse UI overrides:
  - Capture current node positions from the active position source. Delegate-backed and GPU layouts use async delegate snapshots instead of stale network attributes.
  - Store layout type, run state, enabled/running flags, current temperature/alpha, center, and encoded positions.
  - Restore writes positions back to both the active delegate, when supported, and the hidden network position attribute so interpolation, renderer buffers, and future exports agree.
  - Reset interpolation caches after restore so the view does not briefly animate from random/default positions.
- Autosave tiers:
  - Immediate lightweight journal write for every durable user/CLI change.
  - Debounced override snapshot after quiet periods, default `750ms`.
  - Network snapshot only when network/attribute data is dirty, browser storage is enabled, and size limits allow.
- Network persistence defaults:
  - Enabled in the Data > Network UI.
  - Persist if serialized graph is under `min(256MB, 20% of available quota)`; if quota is unknown, use `128MB`.
  - If skipped, persist metadata and a clear status: `networkData.skipped = { reason: "size-limit" }`.
- Use a persistence worker for JSON diff compaction, chunked IndexedDB writes, compression where useful, and REST upload. Main-thread network serialization can be scheduled only on idle/durable save triggers; never on every slider/control event.
- Remote REST backend:
  - `GET /sessions/:id/manifest`
  - `PUT /sessions/:id/manifest`
  - `POST /sessions/:id/events`
  - `PUT /sessions/:id/blobs/:blobId`
  - `GET /sessions/:id/blobs/:blobId`
  - Optional auth key sent as `Authorization: Bearer <key>`.
- Browser close behavior:
  - Flush small pending override/journal writes on `visibilitychange`/`pagehide`.
  - Use `beforeunload` only to warn when network/blob persistence is still pending; browsers cannot reliably block for large async saves.

## UI Behavior

- Add subtle dirty indicators to controls:
  - Empty circle: default/untracked.
  - Subtle green filled circle: this control has a persisted override.
  - Subtle yellow/orange partial circle on sections/panels: some descendants are overridden.
- Clicking a dirty indicator opens a small reset menu:
  - `Reset this setting`
  - `Reset this section` where applicable
- Data > Network gets a "Network persistence" control with status:
  - enabled/disabled
  - last saved size/time
  - skipped reason if over size/quota
  - manual "Save network now" action.

## Test Plan

- Unit tests for sparse override diffing, reset-to-default, journal append/query/checkpoint, and schema migration.
- Browser/UI tests for dirty indicators, reset menus, panel partial state, and Data > Network persistence status.
- CLI tests:
  - user-style UI change appears in `persistence.changes`.
  - CLI mutation appears as `source: "cli"`.
  - checkpoint hides previously read changes.
  - reload restores only overrides plus defaults.
- Persistence tests:
  - browser local restore by session id.
  - network saved below size cap.
  - network skipped above size cap without blocking visual-state restore.
  - REST backend stores/retrieves manifest, events, and blobs.
- Performance tests:
  - slider/control bursts produce one debounced snapshot.
  - UI remains responsive during autosave.
  - unload warning appears only when durable saves are pending.

## Assumptions

- v1 tracks durable user/CLI changes, not transient hover state.
- Selection is persisted only when explicitly saved or represented as a durable behavior state.
- Internal/private attributes use the underscore convention, for example `_helios_visualization_state` on the graph and `_helios_visuals_position` on nodes.
- UI network saves with visualization enabled attach sparse config and layout runtime to `_helios_visualization_state`, and mirror current positions to `_helios_visuals_position` for compatibility.
- REST is the v1 remote protocol; S3-compatible storage is documented as a future backend.
- Existing full session snapshot APIs remain supported, but the preferred app/CLI path becomes sparse overrides plus optional network blob.

## Future Backend Notes

The v1 remote backend is REST because it is easy to host, test, and call from both browsers and CLI-managed sessions. S3-compatible object storage remains a future candidate for large network blobs and multi-tenant deployments; it should be layered behind the same manifest/event/blob abstraction rather than exposed as a separate session model.
