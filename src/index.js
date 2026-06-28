// Primary public API.
export { Helios, EVENTS } from './Helios.js';
export { default } from './Helios.js';
export { HeliosFilter } from './filters/HeliosFilter.js';

// Layout and position primitives.
export { StaticLayout, WorkerLayout, Layout } from './layouts/Layout.js';
export { D3Force3DLayout } from './layouts/d3force3dLayoutWorker.js';
export { GpuForceLayout } from './layouts/GpuForceLayout.js';
export {
  DEFAULT_LAYOUT_TUNING_MODEL,
  extractLayoutTuningFeatures,
  predictLayoutTuningOptions,
} from './layouts/layoutTuningModel.generated.js';
export { PositionDelegate } from './delegates/PositionDelegate.js';
export { GpuForcePositionDelegate } from './delegates/GpuForcePositionDelegate.js';

// Mapper and visual configuration.
export { Mapper, createDefaultMappers, VISUAL_ATTRIBUTES } from './pipeline/Mapper.js';
export { MapperCollection } from './pipeline/Mapper.js';
export { VisualAttributes } from './pipeline/VisualAttributes.js';
export {
  colormaps,
  createCategoricalColormap,
  createColormapScale,
  colormapToScheme,
  colormapToInterpolator,
  decodeColormapData,
  base64ToUint8Array,
  DEFAULT_NODE_COLORMAP,
} from './colors/colormaps.js';

// Figure export and camera helpers that are intentionally documented as reusable.
export {
  FIGURE_EXPORT_PRESETS,
  buildFigureExportPresetList,
  getFigureExportCapability,
  resolveFigureExportOptions,
} from './export/figureExport.js';
export {
  CameraTransitionController,
  captureCameraPose,
  applyCameraPose,
  mergeCameraPose,
  createYawPitchQuaternion,
} from './rendering/CameraTransitionController.js';

// Behavior layer.
export {
  AppearanceBehavior,
  BEHAVIOR_IDS,
  Behavior,
  BehaviorManager,
  BehaviorRegistry,
  ExporterBehavior,
  FilterBehavior,
  HoverBehavior,
  InterfaceBehavior,
  LayoutBehavior,
  LegendsBehavior,
  LabelsBehavior,
  MappersBehavior,
  SelectionBehavior,
  createDefaultBehaviorRegistry,
} from './behaviors/index.js';

// Storage/session helpers.
export {
  IndexedDBSessionStore,
  LocalStoragePreferenceStore,
  PERSISTENCE_KINDS,
  PERSISTENCE_SCHEMA_VERSION,
  applyOverridesToVisualizationState,
  createDefaultNetworkSource,
  createDefaultPreferencesState,
  createDefaultUIState,
  createMemoryIndexedDBFactory,
  createMemoryStorage,
  createPersistenceEnvelope,
  diffOverrideMaps,
  flattenVisualizationOverrides,
  migratePersistenceEnvelope,
  parsePersistenceEnvelope,
  serializePersistenceEnvelope,
} from './persistence/index.js';

export {
  BrowserStorageManager,
  DummyStorageManager,
  HeliosStorageManager,
  RemoteStorageManager,
  SessionStore,
  createHeliosStorageManager,
} from './storage/index.js';

export {
  HeliosStateManager,
  StateBindingController,
  StateTransaction,
} from './state/index.js';

// Optional UI layer.
export { HeliosUI } from './ui/HeliosUI.js';
export { createFpsThrottle } from './ui/controls/createFpsThrottle.js';
export { LogSliderControls } from './ui/controls/LogSliderControls.js';
export { TwoHandleRange } from './ui/controls/TwoHandleRange.js';
export { createTooltipManager } from './ui/controls/createTooltipManager.js';
export { UIAttribute } from './ui/state/UIAttribute.js';
export { TabbedPanel } from './ui/panels/TabbedPanel.js';
export { PanelStack } from './ui/panels/PanelStack.js';
export {
  FILTERS_PANEL_SCHEMA,
  LABELS_PANEL_SCHEMA,
  LAYOUT_PANEL_SCHEMA,
  LEGENDS_PANEL_SCHEMA,
  MAPPERS_PANEL_SCHEMA,
  SCENE_PANEL_SCHEMA,
  SELECTION_PANEL_SCHEMA,
  createPanelSchemaIndicator,
  humanizeControlLabel,
  normalizePanelSchema,
  panelSchemaKeys,
  panelSchemaSectionKeys,
  panelSchemaSectionStatus,
  panelSchemaStatus,
  resolvePanelItemLabel,
} from './ui/panels/panelSchema.js';
export { defineHeliosWebComponents } from './ui/web-components/defineHeliosWebComponents.js';
export { ensureDefaultStyles } from './ui/style/defaultStyles.js';
