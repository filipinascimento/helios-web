# Persistence Interface Audit Plan

This is the working checklist for stabilizing Helios Web persistence across the UI, sessions, sync status, and registered keys.

## Rules

- Valid `sessionId` URLs restore directly and do not show the resume prompt.
- Missing or invalid `sessionId` URLs show a previous-session prompt.
- The Data > Session tab is the explicit session manager: save sessions, list saved sessions, resume any saved session, and show enough metadata to identify them.
- Saving a session must preserve previous sessions and immediately save the new session as a durable network-backed session.
- Resuming a session must restore network, positions, UI state, mappings, and then sync again.
- Camera state is first-class persistence state. Session save, URL reload, and Data > Session resume must restore camera pose and camera controls, including manual pan/zoom and auto-fit disabled state.
- 3D state is first-class persistence state. Session save, URL reload, and Data > Session resume must restore 3D mode together with non-planar 3D position buffers, not 3D controls over 2D positions.
- UI persistence markers must be driven only by registered persistence defaults and actual overrides. A value equal to its lower layer/default must not be marked custom.
- Defaults must have a single source in the persistence registry.
- Sync UI must not move controls as text changes. The manual sync button comes first, followed by status text.
- The Data > Session tab must not expose workspace ids as session names or primary metadata. Visible names come from the session nickname first, then the network name, then a compact fallback.
- The Data > Session tab layout is vertical: `Current`, session id on its own row, actions on their own row, then a bounded scrollable list.
- Session rows show `nickname network-name - compact-date` as the primary line and a smaller `session id · latest updated date/time · size` line.
- Start Fresh must dismiss the prompt with one click and must not immediately re-open the same prompt.
- The basic web demo must stay minimal: it may create/load a network and opt into browser persistence, but mapper/edge/style defaults come from Helios internals, not demo-specific setup.
- Session history retention must not collapse to only one or two sessions for small stored sessions.
- Resuming from Data > Session must not leave or show the resume prompt, because the selected session id is explicit.
- Browser session network payloads should prefer compact binary/compressed network storage. Large graph and position data should not be duplicated as avoidable text JSON when a compressed network format can carry hidden visualization/position attributes.

## UI Areas To Audit

- Data > Network: network load/save, GML warning icon, sync button/status, auto sync toggle, file name field, current positions included in save.
- Data > Figure: export options, labels/legends/interface/frame/background toggles, file name and format controls.
- Data > Attributes: hidden attribute visibility toggle and table state.
- Data > Session: current session, previous sessions, Save Session, resume session, refresh list, saved/sync status.
- Data > Session: vertical current-session layout, scrollable session list, nickname/network-name/date row formatting, no visible workspace id leakage.
- Scene > Appearance: theme, dimension, background color/alpha, blend mode, node size/opacity/outline, edge width/opacity, fast edge lines, adaptive, shaded, ambient occlusion.
- Scene > Labels: label settings and visibility thresholds.
- Scene > Advanced: any renderer/display settings.
- Metrics: calculated metric state and expanded sections where appropriate.
- Layout: layout type, force parameters, running/stopped state policy, position persistence.
- Camera: auto fit, projection/view mode, zoom/pan/orbit controls.
- Mappers/attribute rules: node color, node size, node opacity, node outline, edge color, edge width, edge opacity, density mappings, domains, palettes, enabled flags.
- Selection/filter panels: selection behavior, filters, saved selections, hover/click behavior.
- Filter panel categorical rules: visible checklist rows with counts, All/None
  actions, hidden select compatibility bridge, and normal debounced rule updates.
- Host package compatibility: CLI custom backend/status RPCs, desktop status
  summaries, widget traitlet-backed custom backend, docs/examples for each host.

## Required Tests

- Unit: default-equal overrides do not mark keys custom after restore.
- Unit: mappings and edge appearance keys are registered, bound, serialized, and restored.
- Unit: session save/create keeps existing session envelopes and current session is durable.
- Browser: valid URL session restores network/positions without prompt.
- Browser: missing URL session shows previous-session prompt and can resume.
- Browser: invalid URL session shows previous-session prompt and can resume.
- Browser: Data > Session lists multiple sessions, including current and previous, and resumes the selected one.
- Browser: resume triggers sync and reaches saved status.
- Browser: Theme marker remains default after resume when unchanged.
- Browser: edge width scale and mapper changes persist across reload/resume.
- Browser: sync row layout keeps button position stable and status text appears after the button.
- Browser: Session tab uses separate rows for current label/id/actions and has a bounded scrollable list.
- Browser: Session rows lead with nickname/network name and compact date, and do not show workspace ids.
- Browser: Start Fresh dismisses the prompt on the first click and does not rebuild it.
- Browser: basic demo does not apply demo-specific mapper or edge-width/opacity defaults.
- Browser: small sessions keep more than two entries in the history list.
- Browser: Data > Session resume clears the resume prompt.
- Browser: Data > Session Save Session and Resume restore camera pose and camera controls.
- Browser: Data > Session Save Session and URL reload after switching to 3D restore non-planar positions and mark `scene.dimension` as changed.
- Browser: Data > Session session cards expose a delete icon, require confirmation, and remove the selected saved session only after confirmation.
- Browser: session autosave after camera/settings interaction returns the visible Data > Network status to `Synced` after pending dirty changes have been written.
- Browser: default browser session network format is compact and restorable.
- Browser: categorical filter checklist renders counts, updates selected values,
  and All/None actions keep the active graph filter correct.
- CLI: persistence RPCs expose backend status and default full-session network
  checkpoints to compact `zxnet`.
- Desktop: dirty/sync status handles backend errors, active sync, dirty
  positions/network data, and too-large payloads from the centralized status
  model.
- Widget: `persistence_state` traitlet and packaged frontend bundle keep using
  a deduplicated custom backend.

## Regression Checklist

- Theme must not be marked changed after resume when the user did not change it.
- Data > Network sync status text must stay after the button so button position does not shift.
- Mapper settings and edge appearance settings must persist and restore across reload/resume.
- Data > Session must keep previous sessions after creating a new one.
- Session resume/sync flow must restore the selected network and return to saved status.
- Data > Session must not expose `helios-web-basic-demo` or workspace ids as visible session naming.
- Data > Session current session, session id, actions, and session list must use separate rows.
- Start Fresh must dismiss the prompt with one click.
- Basic demo must not apply custom mapper or edge defaults; it should use Helios internal defaults.
- Missing URL parameters such as `maxSessions` must not parse as `0` and accidentally enable one-session retention.
- Small sessions must not be pruned down to two history entries unless explicit retention limits require it.
- Data > Session explicit resume must clear the resume prompt immediately and after restore.
- Data > Session explicit resume must restore camera pan/zoom and camera controls from the selected session, not the current transient camera.
- Reloading or resuming a 3D session must not restore a planar position buffer under 3D controls.
- Data > Session delete must ask for confirmation, cancel cleanly when dismissed, remove the selected card when accepted, and clear any matching unfinished-session pointer.
- Storage session saves and central registry status must stay aligned so camera, mapper, and parameter autosaves update the visible sync timestamp even when no network payload is rewritten.
- Session storage must use compressed/binary network payloads by default where supported, and avoid storing large position/network state twice as plain JSON.
- Session manifests must not depend on large `localStorage` writes; full manifests and large layout/position state must survive through IndexedDB when localStorage is over quota.
- Loading a network file must update the network basename/name used by the Data > Network field, Session nickname, and export defaults.
- Categorical filtering must use the funding-style checklist interface without
  duplicating rule/default definitions or bypassing the centralized/debounced
  rule editor path.
- CLI, desktop, and widget must stay source-compatible with centralized storage
  after web-next API changes.

## Latest Verification

- Fixed: default-layout session reload after manual pan now restores saved camera pose and disabled auto-fit instead of applying a queued frame-network fit.
- Fixed: `importVisualizationState` restores camera controls before camera pose so persisted `autoFit=false` cannot overwrite the restored pose.
- Fixed: session network restore no longer queues a fresh frame-network camera fit; ordinary user network loads still frame loaded networks.
- Fixed: generated URL sessions (`session=1` with an appended `sessionId`) reload directly without a resume prompt; persisted UI state can no longer resurrect a prompt once storage marks the URL session explicit and valid.
- Fixed: controls appearance browser test now targets `Save network` instead of any Data-panel button containing `Save`, so `Save Session` cannot collide.
- Fixed: Layout panel controls now register persistence defaults before user edits and write through the centralized UI persistence helper, so layout parameter markers update from registry status instead of panel-local logic.
- Passed: `npx playwright test tests/interface-persistence.spec.js --project=chromium --reporter=line --workers=1` (17/17).
- Passed: `node --test tests/persistence.test.js` (48/48).
- Passed: `npm test` (539/539).
- Passed: `npx playwright test tests/controls-appearance.spec.js --reporter=line --workers=1` (7/7).
- Passed: `npx playwright test tests/controls-appearance.spec.js --reporter=line --workers=1` (8/8 after adding layout marker coverage).
- Passed: `node --test tests/persistence.test.js tests/layoutBehavior.test.js tests/ui-attributes.test.js` (60/60).
- Passed: `npm test` (540/540 after adding layout persistence coverage).
- Fixed: Data > Session saved-session cards now have a delete icon with native confirmation; cancel leaves the session intact, accept removes the session and refreshes the list.
- Fixed: removed the shadowing `deleteSession` method so session deletion uses the full cleanup path instead of only deleting the main envelope.
- Fixed: session manifest saves now emit central sync events and update merged `lastSyncedAt`, so settings/camera-only autosaves refresh the visible Data > Network sync timestamp without rewriting the network payload timestamp.
- Fixed: full session manifests now persist through IndexedDB with compact best-effort localStorage fallback, avoiding `QuotaExceededError` from large manifest or position payloads.
- Fixed: `loadNetwork` updates `_lastLoadedNetworkName`, `_lastLoadedNetworkBase`, and `_lastLoadedNetworkFormat` from either `File.name` or explicit `options.name`/`options.filename`.
- Passed: `node --test tests/persistence.test.js` (49/49 after adding session deletion coverage).
- Passed: `npx playwright test tests/interface-persistence.spec.js -g "Data Session tab saves" --reporter=line --workers=1` (1/1).
- Passed: `npx playwright test tests/interface-persistence.spec.js --reporter=line --workers=1` (14/14).
- Passed: `npm test` (541/541 after adding session deletion coverage).
- Passed: `node --test tests/persistence.test.js` (50/50 after adding session sync timestamp coverage).
- Passed: `npx playwright test tests/interface-persistence.spec.js -g "session autosave refreshes" --reporter=line --workers=1` (1/1).
- Passed: `npx playwright test tests/interface-persistence.spec.js --reporter=line --workers=1` (15/15 after adding session sync timestamp coverage).
- Passed: `npm test` (542/542 after adding session sync timestamp coverage).
- Passed: `node --test tests/persistence.test.js` (51/51 after adding IndexedDB manifest fallback coverage).
- Passed: `npx playwright test tests/network-io.spec.js --reporter=line --workers=1` (8/8 after adding loaded basename coverage).
- Passed: `npm test` (543/543 after adding quota and basename coverage).
- Partial: `npm run test:e2e -- --reporter=line --workers=1` passed the chromium/browser persistence, controls, session, GML, drag-drop, mapper, and ordinary network camera tests, but failed two reproducible headed WebGPU tests that are outside persistence/session restore:
  - `tests/attribute-picking.spec.js` in `chromium-webgpu-headed`: node picking target has nonzero node pixels, but `directPick.node` returns `-1`.
  - `tests/layout-gpuforce.spec.js` in `chromium-webgpu-headed`: GPU force locality guardrail fails with `gpu.edgeMean` far above the d3 baseline threshold.
- Fixed: `scene.dimension` is now mapped explicitly to camera mode in session override flatten/apply paths, so restored 3D sessions keep the dimension marker changed instead of restoring the view while reporting default status.
- Fixed: quick controls now stack below the main UI panel layer, so top-right quick control buttons cannot intercept clicks on mappers/density controls when panels scroll beneath them.
- Fixed: Selection panel style rows now expose stable node/edge style metadata, and the selected-edge opacity test targets the edge row directly instead of relying on repeated label order.
- Fixed: controls appearance sync-row test now accepts immediate autosync status text while still enforcing `[sync button] [status text]` order and no sync status inside the network filename row.
- Passed: `node --test tests/persistence*.test.js tests/interfaceBehavior.test.js` (68/68).
- Passed: `npx playwright test tests/basic-selection-panel.spec.js -g "ships the expected selection defaults" --project=chromium --reporter=line --workers=1` (1/1).
- Passed: `npx playwright test tests/controls-appearance.spec.js -g "persistence markers|restored persisted dimension" --project=chromium --reporter=line --workers=1` (3/3).
- Passed: `npx playwright test tests/density-map.spec.js --project=chromium --reporter=line --workers=1` (6/6).
- Passed: `node --test tests/*.test.js` (554/554).
- Passed: `npx playwright test tests/interface-persistence.spec.js --project=chromium --reporter=line --workers=1` (17/17).
- Passed: `npx playwright test --project=chromium --reporter=line --workers=1` (131/131 passed, 2 skipped).
- Fixed: Filter panel categorical attributes now render a funding-style checklist
  with counts, All/None actions, and a hidden select bridge for compatibility.
- Fixed: `helios-cli` full-session persistence defaults to compact `zxnet` and
  exposes `persistence.backendStatus` alongside enriched `persistence.status`.
- Fixed: `helios-desktop` status summaries now understand backend error shapes,
  active sync, too-large network payloads, and session sync timestamps from the
  centralized status model.
- Fixed: `helios-widget` docs/tests now pin the traitlet-backed custom
  persistence backend and `persistence_state` contract.
