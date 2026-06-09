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

// Persistence/public session helpers.
export {
  HeliosPersistenceService,
  IndexedDBSessionStore,
  LocalStoragePreferenceStore,
  HeliosSessionController,
  BrowserPersistenceBackend,
  CustomPersistenceBackend,
  NetworkAttributePersistenceBackend,
  PersistenceBackend,
  PersistenceRegistry,
  RemotePersistenceBackend,
  NETWORK_ID_ATTRIBUTE,
  NETWORK_PERSISTENCE_ATTRIBUTE,
  PERSISTENCE_SCOPES,
  PERSISTENCE_KINDS,
  PERSISTENCE_SCHEMA_VERSION,
  applyOverridesToVisualizationState,
  createPersistenceBackend,
  createDefaultNetworkSource,
  createDefaultPreferencesState,
  createDefaultUIState,
  createPersistenceRecord,
  createMemoryIndexedDBFactory,
  createMemoryStorage,
  createPersistenceEnvelope,
  diffOverrideMaps,
  flattenVisualizationOverrides,
  migratePersistenceEnvelope,
  normalizePersistenceRecord,
  parsePersistenceEnvelope,
  serializePersistenceEnvelope,
} from './persistence/index.js';

// Optional UI layer.
export { HeliosUI } from './ui/HeliosUI.js';
export { UIAttribute } from './ui/state/UIAttribute.js';
export { TabbedPanel } from './ui/panels/TabbedPanel.js';
export { PanelStack } from './ui/panels/PanelStack.js';
export { defineHeliosWebComponents } from './ui/web-components/defineHeliosWebComponents.js';
export { ensureDefaultStyles } from './ui/style/defaultStyles.js';
