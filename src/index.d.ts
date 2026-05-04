import type HeliosNetwork from 'helios-network';

export type SerializablePrimitive = string | number | boolean | null;
export type SerializableValue =
  | SerializablePrimitive
  | SerializableValue[]
  | { [key: string]: SerializableValue };

export type HeliosMode = '2d' | '3d';
export type DensityInteractionFilter = 'auto' | 'off' | 'selected' | 'highlighted' | 'selected-or-highlighted';
export type DockSide = 'left' | 'right';
export type InterfaceMode = 'desktop' | 'compact' | 'fullscreen';
export type PersistenceKind = 'preferences' | 'visualization' | 'session';
export type PortableNetworkFormat = 'bxnet' | 'zxnet' | 'xnet' | string;
export type ExportedStateFormat = 'object' | 'string' | 'blob';
export type PortableNetworkOutputFormat = 'uint8array' | 'arraybuffer' | 'base64' | 'blob';

export interface PersistenceEnvelope<TPayload = unknown, TMetadata extends Record<string, unknown> = Record<string, unknown>> {
  schema: string;
  version: number;
  kind: PersistenceKind;
  metadata: TMetadata;
  payload: TPayload;
  id?: string;
}

export interface ResponsivePreferencesState {
  compactDockSide: DockSide | null;
  preferredMode: InterfaceMode | null;
  lastViewportClass: InterfaceMode | null;
}

export interface HeliosPreferencesState {
  theme: string | null;
  autosave: boolean;
  responsive: ResponsivePreferencesState;
}

export interface HeliosUIState {
  theme: string | null;
  panels: Record<string, SerializableValue>;
  dockOrder: Record<string, SerializableValue>;
  interface: Record<string, SerializableValue>;
}

export interface HeliosNetworkSource {
  name: string | null;
  baseName: string | null;
  format: string | null;
  nodeCount: number | null;
  edgeCount: number | null;
  portableVisualizationAttached: boolean;
  loadedAt: number | null;
}

export interface CameraPose {
  mode?: HeliosMode;
  projection?: 'orthographic' | 'perspective' | string;
  target?: [number, number, number] | number[];
  position?: [number, number, number] | number[];
  rotation?: [number, number, number, number] | number[];
  zoom?: number;
  distance?: number;
  near?: number;
  far?: number;
}

export interface CameraPoseOptions {
  source?: 'ui' | 'interaction' | string;
  manual?: boolean;
  requestRender?: boolean;
  update?: boolean;
}

export interface CameraTransitionOptions extends CameraPoseOptions {
  fromPose?: Partial<CameraPose>;
  durationMs?: number;
}

export interface CameraControlsOptions {
  autoFit?: boolean;
  animation?: boolean;
  animationDurationMs?: number;
  orbit?: boolean;
  orbitAxis?: [number, number, number] | number[];
  orbitAngle?: number;
  targetNodeIndices?: ArrayLike<number> | Iterable<number> | null;
  followTarget?: boolean;
  followUpdateIntervalMs?: number;
  autoFitIntervalMs?: number;
  autoFitMaxSamples?: number;
}

export interface CameraControlsSnapshot extends CameraControlsOptions {
  activeTargetNodeIndices: number[] | null;
  effectiveAutoFitIntervalMs: number | null;
}

export interface FrameNetworkOptions {
  animate?: boolean;
  durationMs?: number;
  resetOrientation?: boolean;
  zoomScale?: number;
  maxFocusZoom?: number;
  minFocusDistance?: number;
  focusZoomTolerance?: number;
}

export interface CameraTargetNodeOptions extends FrameNetworkOptions {
  follow?: boolean;
  followTarget?: boolean;
  followUpdateIntervalMs?: number;
  zoomFactor?: number;
}

export interface ExportVisualizationStateOptions {
  preferences?: HeliosPreferencesState | null;
  format?: ExportedStateFormat;
  pretty?: boolean;
}

export interface AttachedVisualizationStateOptions {
  network?: HeliosNetwork | null;
  attributeName?: string;
  pretty?: boolean;
}

export interface SavePortableNetworkOptions extends AttachedVisualizationStateOptions {
  includeVisualization?: boolean;
  output?: PortableNetworkOutputFormat;
  saveOptions?: Record<string, unknown>;
  visualizationState?: PersistenceEnvelope<HeliosVisualizationStatePayload> | string | null;
}

export interface HeliosVisualizationStatePayload {
  preferences: HeliosPreferencesState;
  responsivePreferences: ResponsivePreferencesState | null;
  uiState: HeliosUIState;
  behaviorState: HeliosBehaviorSnapshot;
  cameraState: CameraPose | null;
  networkSource: HeliosNetworkSource;
}

export interface HeliosSessionRecord {
  id: string | null;
  createdAt: number | null;
  updatedAt: number | null;
  unfinished: boolean;
  status: string;
}

export interface HeliosSessionPayload {
  session: HeliosSessionRecord;
  preferences: HeliosPreferencesState;
  responsivePreferences: ResponsivePreferencesState | null;
  uiState: HeliosUIState;
  behaviorState: HeliosBehaviorSnapshot;
  networkSource: HeliosNetworkSource;
  networkData: {
    format: string;
    data: unknown;
  };
  visualizationState: PersistenceEnvelope<HeliosVisualizationStatePayload>;
}

export interface HeliosPersistenceServiceOptions {
  helios?: Helios | null;
  preferenceStore?: LocalStoragePreferenceStore;
  sessionStore?: IndexedDBSessionStore;
  preferences?: Record<string, unknown>;
  sessions?: Record<string, unknown>;
  defaults?: Partial<HeliosPreferencesState>;
  idFactory?: () => string;
  now?: () => number;
}

export interface HeliosPersistenceSaveSessionOptions {
  id?: string;
  createdAt?: number;
  updatedAt?: number;
  networkFormat?: PortableNetworkFormat;
  networkData?: unknown;
  visualizationState?: PersistenceEnvelope<HeliosVisualizationStatePayload> | string;
  preferences?: HeliosPreferencesState;
  responsivePreferences?: ResponsivePreferencesState | null;
  uiState?: HeliosUIState;
  behaviorState?: HeliosBehaviorSnapshot;
  networkSource?: HeliosNetworkSource;
  unfinished?: boolean;
  status?: string;
}

export interface HeliosPersistenceListSessionsOptions {
  includeFinished?: boolean;
  limit?: number;
}

export interface HeliosPersistenceRestoreSessionOptions {
  disposeOld?: boolean;
  recreateRenderer?: boolean;
  markFinished?: boolean;
}

export interface HeliosInterfaceResumePrompt {
  visible: boolean;
  sessionId: string;
  status: string;
  updatedAt: number | null;
  networkSource: HeliosNetworkSource | null;
}

export interface HeliosInterfaceState {
  dockSide: DockSide;
  viewportWidth: number | null;
  mode: InterfaceMode;
  controlsOpen: boolean;
  activePanelId: string | null;
  focused: boolean;
  interfaceVisible: boolean;
  resumePrompt: HeliosInterfaceResumePrompt | null;
}

export interface HeliosBehaviorChangeEvent<TState = unknown> extends Event {
  detail?: {
    reason?: string;
    state?: TState;
    [key: string]: unknown;
  };
}

export interface BehaviorListenerOptions extends AddEventListenerOptions {}

export class Behavior<TOptions extends Record<string, unknown> = Record<string, unknown>, TState = unknown> extends EventTarget {
  static id: string | null;
  id: string | null;
  options: TOptions;
  context: unknown;
  state?: TState;
  constructor(options?: TOptions);
  attach(context?: unknown): this;
  detach(): this;
  update(options?: Partial<TOptions>): this;
  serialize(): Record<string, unknown>;
  restore(snapshot?: Record<string, unknown>): this;
  addCleanup(cleanup: (() => void) | null | undefined): (() => void) | null | undefined;
  removeCleanup(cleanup: (() => void) | null | undefined): this;
  emit(type: string, detail?: unknown): this;
  on(type: string, handler: (event: HeliosBehaviorChangeEvent<TState>) => void, options?: BehaviorListenerOptions): () => void;
}

export class BehaviorRegistry {
  register<T extends Behavior>(id: string, behavior: new (options?: any) => T): this;
  has(id: string): boolean;
  get<T extends Behavior = Behavior>(id: string): (new (options?: any) => T) | null;
  create<T extends Behavior = Behavior>(id: string, options?: Record<string, unknown>): T;
}

export class BehaviorManager {
  helios: Helios | null;
  registry: BehaviorRegistry;
  ui: HeliosUI | null;
  constructor(helios?: Helios | null, registry?: BehaviorRegistry);
  setUI(ui?: HeliosUI | null): this;
  has(id: string): boolean;
  get<T extends Behavior = Behavior>(id: string): T | null;
  entries(): Array<[string, Behavior]>;
  values(): Behavior[];
  use<T extends Behavior = Behavior>(id: string, options?: Record<string, unknown>): T;
  use<T extends Behavior = Behavior>(behavior: T, options?: Record<string, unknown>): T;
  detach(id: string): boolean;
  detachAll(): this;
  destroy(): void;
  serialize(): HeliosBehaviorSnapshot;
  restore(snapshot?: HeliosBehaviorSnapshot): this;
}

export interface SelectionStyle {
  color?: string | null;
  fill?: string | null;
  opacity?: number | null;
  width?: number | null;
  scale?: number | null;
}

export interface SelectionTone {
  mode?: string;
  amount?: number;
}

export interface SelectionBehaviorOptions {
  enableNodeSelection?: boolean;
  nodeClick?: boolean;
  enableEdgeSelection?: boolean;
  edgeClick?: boolean;
  selectedConnectedEdges?: boolean;
  enableSelectionLabels?: boolean;
  otherSelectedNodeStyle?: SelectionStyle;
  otherSelectedEdgeStyle?: SelectionStyle;
  otherSelectedNodeTone?: SelectionTone;
  otherSelectedEdgeTone?: SelectionTone;
}

export interface SelectionBehaviorState extends SelectionBehaviorOptions {
  nodeClick: boolean;
  edgeClick: boolean;
  selectedConnectedEdges: boolean;
  selectedNodes: Set<number>;
  selectedEdges: Set<number>;
  savedSelectionAttribute: string;
  lastNamedSelectionAttribute: string;
  otherSelectedNodeStyle: SelectionStyle;
  otherSelectedEdgeStyle: SelectionStyle;
  otherSelectedNodeTone: SelectionTone;
  otherSelectedEdgeTone: SelectionTone;
}

export class SelectionBehavior extends Behavior<SelectionBehaviorOptions, SelectionBehaviorState> {
  static id: 'selection';
  state: SelectionBehaviorState;
  clearSelection(options?: { preserveBinding?: boolean; preserveCameraFollow?: boolean; silent?: boolean }): void;
  selectNodes(indices: Iterable<number> | ArrayLike<number>, options?: { mode?: 'replace' | 'add' | 'remove'; silent?: boolean }): this;
  selectEdges(indices: Iterable<number> | ArrayLike<number>, options?: { mode?: 'replace' | 'add' | 'remove'; silent?: boolean }): this;
  expandSelectionToNeighbors(): this;
  saveSelectionToAttribute(attributeName?: string): this;
}

export interface HoverBehaviorOptions {
  hoverLabel?: boolean;
  nodeHover?: boolean;
  edgeHover?: boolean;
  hoverConnectedEdges?: boolean;
  highlightConnectedEdges?: boolean;
  hoverAffectsOtherElements?: boolean;
  hoverStyleFromHighlight?: boolean;
  [key: string]: unknown;
}

export interface HoverBehaviorState extends HoverBehaviorOptions {
  hoverLabel: boolean;
  hoveredNode: number;
  hoveredEdge: number;
}

export class HoverBehavior extends Behavior<HoverBehaviorOptions, HoverBehaviorState> {
  static id: 'hover';
  state: HoverBehaviorState;
  getPublicState(): HoverBehaviorState;
}

export interface LabelsBehaviorOptions {
  enabled?: boolean;
  source?: string | ((...args: any[]) => unknown) | null;
  selectionMode?: 'auto' | 'selected-only' | 'ranked';
  pinnedNodes?: Iterable<number>;
  selectedOnlySpaceAware?: boolean;
  fallbackSources?: string[];
  maxVisible?: number;
  minScreenRadiusPx?: number;
  fontSizeScale?: number;
  outlineWidth?: number;
  offsetRadiusFactor?: number;
  offsetPx?: number;
  maxChars?: number;
  maxRows?: number;
  maxUpdateFps?: number;
  keepBoost?: number;
  selectedBoost?: number;
  hoveredBoost?: number;
  delegateSnapshotMaxFps?: number;
  collisionPaddingPx?: number;
  collisionCellPx?: number;
  fill?: string | null;
  outlineColor?: string | null;
  fontFamily?: string | null;
  illustratorCompatible?: boolean;
}

export interface LabelsBehaviorState extends LabelsBehaviorOptions {
  enabled: boolean;
  hoveredNodeEnabled?: boolean;
  hoveredNodeSource?: string | null;
}

export class LabelsBehavior extends Behavior<LabelsBehaviorOptions, LabelsBehaviorState> {
  static id: 'labels';
  state: LabelsBehaviorState;
  labels(options?: LabelsBehaviorOptions | null): this | LabelsBehaviorState;
  enabled(value?: boolean): boolean | this;
  mode(value?: 'off' | 'auto' | 'selected-only'): 'off' | 'auto' | 'selected-only' | this;
  maxVisible(value?: number): number | this;
}

export interface LegendPlacement {
  x?: number;
  y?: number;
}

export interface LegendsBehaviorOptions {
  enabled?: boolean;
  respectDockInsets?: boolean;
  illustratorCompatible?: boolean;
  zoomAwareSizeIn2D?: boolean;
  showPanel?: boolean;
  textOutline?: boolean;
  showNodeColor?: boolean;
  showDensity?: boolean;
  showEdgeColor?: boolean;
  showNodeSize?: boolean;
  showEdgeWidth?: boolean;
  scalePreviewLegends?: boolean;
  interactiveCategorical?: boolean;
  legendHoverHighlight?: boolean;
  legendClickSelect?: boolean;
  margin?: number;
  gap?: number;
  maxChars?: number;
  maxRows?: number;
  fontSize?: number;
  scale?: number;
  continuousHeight?: number;
  panelOpacity?: number;
  textOutlineWidth?: number;
  maxScale?: number;
  fontFamily?: string | null;
  titles?: Partial<Record<'nodeColor' | 'density' | 'edgeColor' | 'nodeSize' | 'edgeWidth', string | null>>;
  placements?: Partial<Record<'nodeColor' | 'density' | 'edgeColor' | 'nodeSize' | 'edgeWidth', 'auto' | string | LegendPlacement>>;
}

export interface NodeHoverStyle {
  sizeMul?: number;
  opacityMul?: number;
  outlineMul?: number;
  discard?: boolean;
  colorMul?: number[];
  colorAdd?: number[];
  forceMaxAlpha?: boolean;
}

export interface EdgeHoverStyle {
  widthMul?: number;
  opacityMul?: number;
  discard?: boolean;
  colorMul?: number[];
  colorAdd?: number[];
  forceMaxAlpha?: boolean;
}

export interface LegendsBehaviorState extends LegendsBehaviorOptions {
  enabled: boolean;
  titles: NonNullable<LegendsBehaviorOptions['titles']>;
  placements: NonNullable<LegendsBehaviorOptions['placements']>;
}

export class LegendsBehavior extends Behavior<LegendsBehaviorOptions, LegendsBehaviorState> {
  static id: 'legends';
  state: LegendsBehaviorState;
  legends(options?: LegendsBehaviorOptions | false | null): this | LegendsBehaviorState;
  enabled(value?: boolean): boolean | this;
}

export interface LayoutBehaviorOptions {
  positionAttribute?: string;
  layoutType?: 'worker:force3d' | 'gpu-force' | 'd3force3d' | 'worker:jitter' | 'static' | string;
  parameters?: Record<string, unknown>;
  running?: boolean;
  preserveRunState?: boolean;
}

export interface LayoutBehaviorState {
  positionAttribute: string;
}

export class LayoutBehavior extends Behavior<LayoutBehaviorOptions, LayoutBehaviorState> {
  static id: 'layout';
  state: LayoutBehaviorState;
  type(value?: LayoutBehaviorOptions['layoutType'], options?: { preserveRunState?: boolean; emitChange?: boolean }): string | this;
  positionAttribute(value?: string): string | this;
  parameters(values?: Record<string, unknown>, options?: { silent?: boolean }): Record<string, unknown> | this;
  start(reason?: string): this;
  stop(reason?: string): this;
  reheat(reason?: string): this;
  reset(options?: { reason?: string }): this;
  runState(): string;
  isDynamic(): boolean;
}

export interface AppearanceBehaviorOptions {
  background?: string | number[] | ArrayBufferView | null;
  clearColor?: string | number[] | ArrayBufferView | null;
  edgeTransparencyMode?: string;
  nodeSizeScale?: number;
  nodeOpacityScale?: number;
  nodeOutlineWidthScale?: number;
  edgeWidthScale?: number;
  edgeOpacityScale?: number;
  nodeBlendWithEdges?: boolean;
  edgeWidthClampToNodeDiameter?: boolean;
  edgeFastRendering?: boolean;
  edgeAdaptiveQuality?: Record<string, unknown> | null;
  shadedEnabled?: boolean;
  shadedNodes?: boolean;
  shadedEdges?: boolean;
  shadedLightDirection?: number[] | null;
  shadedLightColor?: string | number[] | null;
  shadedAmbientTopColor?: string | number[] | null;
  shadedAmbientBottomColor?: string | number[] | null;
  shadedDiffuseStrength?: number;
  shadedAmbientStrength?: number;
  shadedSpecularColor?: string | number[] | null;
  shadedSpecularStrength?: number;
  shadedShininess?: number;
  ambientOcclusionEnabled?: boolean;
  ambientOcclusionNodes?: boolean;
  ambientOcclusionEdges?: boolean;
  ambientOcclusionStrength?: number;
  ambientOcclusionRadius?: number;
  ambientOcclusionBias?: number;
  ambientOcclusionMode?: string;
  ambientOcclusionIntensityScale?: number;
  ambientOcclusionIntensityShift?: number;
  ambientOcclusionQuality?: string;
  nodeStyle?: {
    sizeScale?: number;
    opacityScale?: number;
    outlineWidthScale?: number;
    blendWithEdges?: boolean;
  };
  edgeStyle?: {
    widthScale?: number;
    opacityScale?: number;
    fastRendering?: boolean;
    clampToNodeDiameter?: boolean;
    adaptiveQuality?: Record<string, unknown> | null;
  };
  shaded?: {
    enabled?: boolean;
    nodes?: boolean;
    edges?: boolean;
    lightDirection?: number[] | null;
    lightColor?: string | number[] | null;
    ambientTopColor?: string | number[] | null;
    ambientBottomColor?: string | number[] | null;
    diffuseStrength?: number;
    ambientStrength?: number;
    specularColor?: string | number[] | null;
    specularStrength?: number;
    shininess?: number;
  };
  ambientOcclusion?: {
    enabled?: boolean;
    nodes?: boolean;
    edges?: boolean;
    strength?: number;
    radius?: number;
    bias?: number;
    mode?: string;
    intensityScale?: number;
    intensityShift?: number;
    quality?: string;
  };
}

export interface AppearanceBehaviorState {
  background: number[] | null;
  edgeTransparencyMode: string;
  nodeStyle: {
    sizeScale: number;
    opacityScale: number;
    outlineWidthScale: number;
    blendWithEdges: boolean;
  };
  edgeStyle: {
    widthScale: number;
    opacityScale: number;
    clampToNodeDiameter: boolean;
    fastRendering: boolean;
    adaptiveQuality: Record<string, unknown> | null;
  };
  shaded: {
    enabled: boolean;
    nodes: boolean;
    edges: boolean;
    lightDirection: number[] | null;
    lightColor: number[] | null;
    ambientTopColor: number[] | null;
    ambientBottomColor: number[] | null;
    diffuseStrength: number | null;
    ambientStrength: number | null;
    specularColor: number[] | null;
    specularStrength: number | null;
    shininess: number | null;
  };
  ambientOcclusion: {
    supported: boolean;
    enabled: boolean;
    nodes: boolean;
    edges: boolean;
    strength: number | null;
    radius: number | null;
    bias: number | null;
    mode: string | null;
    intensityScale: number | null;
    intensityShift: number | null;
    quality: string | null;
  };
}

export class AppearanceBehavior extends Behavior<AppearanceBehaviorOptions, AppearanceBehaviorState> {
  static id: 'appearance';
  state: AppearanceBehaviorState;
  appearance(options?: AppearanceBehaviorOptions): this | AppearanceBehaviorState;
  background(value?: AppearanceBehaviorOptions['background']): number[] | null | this;
  shadedEnabled(value?: boolean): boolean | this;
  supportsAmbientOcclusion(): boolean;
}

export interface MapperChannelConfig {
  type?: string;
  attributes?: string | string[] | null;
  from?: string | string[] | null;
  colormap?: string;
  domain?: number[];
  range?: number[];
  value?: unknown;
  meta?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface MapperModeConfig {
  channels?: Record<string, MapperChannelConfig>;
}

export interface MappersBehaviorOptions {
  node?: MapperModeConfig;
  edge?: MapperModeConfig;
  nodeChannels?: Record<string, MapperChannelConfig>;
  edgeChannels?: Record<string, MapperChannelConfig>;
}

export interface MappersBehaviorState {
  node: {
    mode: string | null;
    defaultId: string | null;
    mappers: Record<string, { channels: Record<string, { type: string | null; meta: Record<string, unknown> | null }> }>;
  };
  edge: {
    mode: string | null;
    defaultId: string | null;
    mappers: Record<string, { channels: Record<string, { type: string | null; meta: Record<string, unknown> | null }> }>;
  };
}

export class MappersBehavior extends Behavior<MappersBehaviorOptions, MappersBehaviorState> {
  static id: 'mappers';
  state: MappersBehaviorState;
  mappers(options?: MappersBehaviorOptions): this | MappersBehaviorState;
  getSerializedChannelConfig(mode: 'node' | 'edge', channel: string): MapperChannelConfig;
  setChannelConfig(mode: 'node' | 'edge', channel: string, config: MapperChannelConfig): this;
}

export interface FilterRule {
  id?: string;
  scope?: 'node' | 'edge' | string;
  type?: string;
  attribute?: string;
  min?: number;
  max?: number;
  values?: string[];
  value?: unknown;
  operator?: string;
  [key: string]: unknown;
}

export interface FilterBehaviorOptions {
  id?: string;
  name?: string;
  scope?: 'render' | 'render+layout' | string;
  rules?: FilterRule[];
  nodeRules?: FilterRule[];
  edgeRules?: FilterRule[];
}

export interface FilterBehaviorState {
  enabled: boolean;
  scope: string;
  options: Record<string, unknown> | null;
  nodeCount?: number;
  edgeCount?: number;
  baseNodeCount?: number;
  baseEdgeCount?: number;
  error?: unknown;
}

export class FilterBehavior extends Behavior<FilterBehaviorOptions, FilterBehaviorState> {
  static id: 'filters';
  state: FilterBehaviorState;
  filters(options?: FilterBehaviorOptions): this | FilterBehaviorState;
  replaceRules(options: FilterBehaviorOptions): this;
  clear(): this;
}

export interface ExporterBehaviorOptions {
  baseName?: string;
  name?: string;
  filename?: string;
  format?: 'png' | 'jpeg' | 'webp' | 'svg' | string;
  preset?: string | null;
  width?: number | null;
  height?: number | null;
  customSize?: { width?: number | null; height?: number | null };
  supersampling?: number | boolean | 'auto';
  includeLabels?: boolean;
  includeLegends?: boolean;
  includeInterface?: boolean;
  legendScale?: number;
  transparentBackground?: boolean;
  alphaMode?: 'straight' | 'premultiplied' | string;
  showFrame?: boolean;
}

export interface ExporterBehaviorState extends ExporterBehaviorOptions {
  baseName: string;
  format: string;
  preset: string | null;
  width: number | null;
  height: number | null;
  supersampling: number;
  includeLabels: boolean;
  includeLegends: boolean;
  includeInterface: boolean;
  legendScale: number;
  transparentBackground: boolean;
  alphaMode: string;
}

export class ExporterBehavior extends Behavior<ExporterBehaviorOptions, ExporterBehaviorState> {
  static id: 'exporter';
  state: ExporterBehaviorState;
  exporter(options?: ExporterBehaviorOptions): this | ExporterBehaviorState;
  baseName(value?: string): string | this;
  format(value?: string): string | this;
  includeInterface(value?: boolean): boolean | this;
  legendScale(value?: number): number | this;
}

export interface InterfaceBehaviorOptions {
  compactBreakpoint?: number;
  fullscreenBreakpoint?: number;
  preferredDockSide?: DockSide;
  restorePrompt?: boolean;
}

export class InterfaceBehavior extends Behavior<InterfaceBehaviorOptions, HeliosInterfaceState> {
  static id: 'interface';
  state: HeliosInterfaceState;
  compactBreakpoint(value?: number): number | this;
  fullscreenBreakpoint(value?: number): number | this;
  dockSide(value?: DockSide): DockSide | this;
  toggleDockSide(): this;
  mode(): InterfaceMode;
  isCompact(): boolean;
  isFullscreen(): boolean;
  viewportWidth(): number | null;
  setViewportWidth(width: number | null, options?: { silent?: boolean }): this;
  controlsOpen(value?: boolean): boolean | this;
  openControlsSurface(): this;
  closeControlsSurface(): this;
  activateControl(panelId: string): this;
  clearActiveControl(): this;
  resumePrompt(): HeliosInterfaceResumePrompt | null;
  ensurePersistenceReady(): Promise<this>;
  restoreInterfaceState(snapshot?: Partial<HeliosInterfaceState>, options?: Record<string, unknown>): this;
  resumeSession(options?: HeliosPersistenceRestoreSessionOptions & { markFinished?: boolean }): Promise<PersistenceEnvelope<HeliosSessionPayload> | null>;
  startFresh(options?: { deletePendingSession?: boolean }): Promise<this>;
}

export interface HeliosBuiltInBehaviorMap {
  appearance: AppearanceBehavior;
  exporter: ExporterBehavior;
  mappers: MappersBehavior;
  filters: FilterBehavior;
  interface: InterfaceBehavior;
  layout: LayoutBehavior;
  legends: LegendsBehavior;
  labels: LabelsBehavior;
  hover: HoverBehavior;
  selection: SelectionBehavior;
}

export interface HeliosBuiltInBehaviorOptionsMap {
  appearance: AppearanceBehaviorOptions;
  exporter: ExporterBehaviorOptions;
  mappers: MappersBehaviorOptions;
  filters: FilterBehaviorOptions;
  interface: InterfaceBehaviorOptions;
  layout: LayoutBehaviorOptions;
  legends: LegendsBehaviorOptions;
  labels: LabelsBehaviorOptions;
  hover: HoverBehaviorOptions;
  selection: SelectionBehaviorOptions;
}

export type HeliosBehaviorSnapshot = Partial<Record<string, Record<string, unknown>>>;

export interface BehaviorConfigObject extends Partial<{
  [K in keyof HeliosBuiltInBehaviorOptionsMap]:
    | boolean
    | HeliosBuiltInBehaviorOptionsMap[K]
    | HeliosBuiltInBehaviorMap[K];
}> {
  use?: string | Behavior | Array<string | Behavior>;
  options?: Partial<HeliosBuiltInBehaviorOptionsMap>;
}

export interface HeliosBehaviorNamespace {
  (name: keyof HeliosBuiltInBehaviorMap): HeliosBuiltInBehaviorMap[keyof HeliosBuiltInBehaviorMap] | null;
  (name: string): Behavior | null;
  appearance: AppearanceBehavior;
  exporter: ExporterBehavior;
  mappers: MappersBehavior;
  filters: FilterBehavior;
  interface: InterfaceBehavior;
  layout: LayoutBehavior;
  legends: LegendsBehavior;
  labels: LabelsBehavior;
  hover: HoverBehavior;
  selection: SelectionBehavior;
  manager: BehaviorManager | null;
  registry: BehaviorRegistry | null;
}

export class Helios extends EventTarget {
  static STATES: Readonly<{
    FILTERED: number;
    SELECTED: number;
    HIGHLIGHTED: number;
  }>;
  static STATE_BITS: typeof Helios.STATES;
  static UI_BINDINGS: Readonly<Record<string, unknown>>;
  behavior: HeliosBehaviorNamespace;
  behaviors: BehaviorManager;
  persistence: HeliosPersistenceService;
  network: HeliosNetwork | null;
  ready: Promise<this>;
  constructor(network?: HeliosNetwork | null, options?: HeliosOptions);
  hasBehavior(name: string): boolean;
  getBehavior<K extends keyof HeliosBuiltInBehaviorMap>(name: K): HeliosBuiltInBehaviorMap[K] | null;
  getBehavior(name: string): Behavior | null;
  registerBehavior<T extends Behavior>(name: string, behaviorCtor: new (options?: any) => T): this;
  useBehavior<K extends keyof HeliosBuiltInBehaviorOptionsMap>(name: K, behaviorOrOptions?: HeliosBuiltInBehaviorOptionsMap[K] | true): HeliosBuiltInBehaviorMap[K];
  useBehavior<T extends Behavior>(name: string, behaviorOrOptions: T): T;
  serializeBehaviorState(): HeliosBehaviorSnapshot;
  restoreBehaviorState(snapshot?: HeliosBehaviorSnapshot): this;
  serializeVisualizationState(options?: ExportVisualizationStateOptions): PersistenceEnvelope<HeliosVisualizationStatePayload>;
  exportVisualizationState(options?: ExportVisualizationStateOptions): PersistenceEnvelope<HeliosVisualizationStatePayload> | string | Blob;
  importVisualizationState(source: PersistenceEnvelope<HeliosVisualizationStatePayload> | string, options?: Record<string, unknown>): Promise<PersistenceEnvelope<HeliosVisualizationStatePayload>>;
  restoreVisualizationState(source: PersistenceEnvelope<HeliosVisualizationStatePayload> | string, options?: Record<string, unknown>): Promise<PersistenceEnvelope<HeliosVisualizationStatePayload>>;
  getAttachedVisualizationState(network?: HeliosNetwork | null, options?: AttachedVisualizationStateOptions): PersistenceEnvelope<HeliosVisualizationStatePayload> | null;
  attachVisualizationStateToNetwork(snapshot?: PersistenceEnvelope<HeliosVisualizationStatePayload> | null, options?: AttachedVisualizationStateOptions): this;
  clearAttachedVisualizationState(options?: AttachedVisualizationStateOptions): this;
  savePortableNetwork(format?: PortableNetworkFormat, options?: SavePortableNetworkOptions): Promise<Uint8Array | ArrayBuffer | string | Blob>;
  cameraPose(): CameraPose;
  cameraControls(): CameraControlsSnapshot;
  cameraControls(options: CameraControlsOptions): this;
  cameraTargetNodes(nodeIndices: ArrayLike<number> | Iterable<number>, options?: CameraTargetNodeOptions): this;
  cameraTargetNodes(): number[];
  cameraFollowNodes(nodeIndices: ArrayLike<number> | Iterable<number>, options?: CameraTargetNodeOptions): this;
  cameraFollowNodes(): number[];
  setCameraPose(pose: Partial<CameraPose>, options?: CameraPoseOptions): this;
  transitionCamera(pose: Partial<CameraPose>, options?: CameraTransitionOptions): Promise<this>;
  stopCameraTransition(): this;
  frameNetwork(options?: FrameNetworkOptions): this;
  nodeHoverStyle(): NodeHoverStyle | null;
  nodeHoverStyle(style: NodeHoverStyle): this;
  edgeHoverStyle(): EdgeHoverStyle | null;
  edgeHoverStyle(style: EdgeHoverStyle): this;
  hoverStyleFromHighlight(): boolean;
  hoverStyleFromHighlight(value: boolean): this;
  highlightConnectedEdges(): boolean;
  highlightConnectedEdges(value: boolean): this;
  setNodeHoverStyle(style: NodeHoverStyle): this;
  setEdgeHoverStyle(style: EdgeHoverStyle): this;
  setHoverStyleFromHighlight(value: boolean): this;
  setHighlightConnectedEdges(value: boolean): this;
  mode(): HeliosMode;
  setMode(mode: HeliosMode, options?: Record<string, unknown>): Promise<this>;
  loadNetwork(source: Blob | ArrayBuffer | Uint8Array | string, options?: Record<string, unknown>): Promise<unknown>;
}

export interface HeliosOptions extends Record<string, unknown> {
  container?: string | HTMLElement | null;
  canvas?: HTMLCanvasElement | null;
  hoverStyleFromHighlight?: boolean;
  highlightConnectedEdges?: boolean;
  hoverAffectsOtherElements?: boolean;
  mode?: HeliosMode;
  autoCleanup?: boolean;
  disposeNetworkOnDestroy?: boolean;
  legends?: LegendsBehaviorOptions;
  labels?: LabelsBehaviorOptions;
  densityInteractionFilter?: DensityInteractionFilter;
  /**
   * Built-in behaviors attach by default. Pass an object to tune individual
   * behaviors, custom behavior instances to attach extra behavior, or `false`
   * to opt out of default behavior attachment.
   */
  behaviors?: false | string | Behavior | Array<string | Behavior> | BehaviorConfigObject;
  persistence?: Omit<HeliosPersistenceServiceOptions, 'helios'>;
}

export const EVENTS: Readonly<{
  LAYOUT_START: 'layout:start';
  LAYOUT_STOP: 'layout:stop';
  LAYOUT_CHANGED: 'layout:changed';
  MODE_CHANGED: 'mode:changed';
  NODE_HOVER: 'node:hover';
  EDGE_HOVER: 'edge:hover';
  GRAPH_CLICK: 'graph:click';
  GRAPH_DBLCLICK: 'graph:dblclick';
  NODE_CLICK: 'node:click';
  EDGE_CLICK: 'edge:click';
  NODE_DBLCLICK: 'node:dblclick';
  EDGE_DBLCLICK: 'edge:dblclick';
  BEFORE_RENDER: 'render:before';
  AFTER_RENDER: 'render:after';
  RESIZE: 'resize';
  CAMERA_MOVE: 'camera:move';
  CAMERA_CONTROL_CHANGE: 'camera:control-change';
  NETWORK_REPLACED: 'network:replaced';
  MAPPERS_CHANGED: 'mappers:changed';
  GRAPH_FILTER_CHANGED: 'graph:filter-changed';
}>;

export class HeliosFilter {
  constructor(options?: Record<string, unknown>);
  addRule(rule: FilterRule): this;
  clearRules(): this;
  toGraphFilterOptions(): Record<string, unknown>;
}

export class Layout {
  constructor(...args: any[]);
}

export class StaticLayout extends Layout {}
export class WorkerLayout extends Layout {}
export class D3Force3DLayout extends Layout {}
export class GpuForceLayout extends Layout {}

export class PositionDelegate {
  constructor(...args: any[]);
}

export class GpuForcePositionDelegate extends PositionDelegate {}

export class Mapper {
  constructor(...args: any[]);
}

export class MapperCollection {
  constructor(mode?: 'node' | 'edge', network?: HeliosNetwork | null, onChange?: (() => void) | null, debug?: unknown);
  createMapper(id: string): Mapper;
  channel(name: string): Mapper;
}

export function createDefaultMappers(...args: any[]): unknown;
export const VISUAL_ATTRIBUTES: Readonly<Record<string, unknown>>;
export class VisualAttributes {
  constructor(...args: any[]);
}

export const colormaps: Record<string, unknown>;
export function createCategoricalColormap(...args: any[]): unknown;
export function createColormapScale(...args: any[]): unknown;
export function colormapToScheme(...args: any[]): unknown;
export function colormapToInterpolator(...args: any[]): unknown;
export function decodeColormapData(...args: any[]): unknown;
export function base64ToUint8Array(value: string): Uint8Array;

export const FIGURE_EXPORT_PRESETS: readonly unknown[];
export function buildFigureExportPresetList(...args: any[]): unknown[];
export function getFigureExportCapability(...args: any[]): Record<string, unknown>;
export function resolveFigureExportOptions(...args: any[]): Record<string, unknown>;

export function captureCameraPose(camera: unknown): CameraPose;
export function applyCameraPose(camera: unknown, pose: Partial<CameraPose>, options?: { update?: boolean }): void;
export function mergeCameraPose(basePose: Partial<CameraPose>, patch?: Partial<CameraPose>): CameraPose;
export function createYawPitchQuaternion(yawRadians?: number, pitchRadians?: number): [number, number, number, number];

export class CameraTransitionController {
  constructor(options?: { requestRender?: (() => void) | null });
  stop(): this;
  transition(camera: unknown, options?: { fromPose?: Partial<CameraPose>; toPose?: Partial<CameraPose>; durationMs?: number }): Promise<void>;
}

export const BEHAVIOR_IDS: readonly [
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
];

export function createDefaultBehaviorRegistry(): BehaviorRegistry;

export const PERSISTENCE_SCHEMA_VERSION: number;
export const PERSISTENCE_KINDS: Readonly<{
  preferences: 'preferences';
  visualization: 'visualization';
  session: 'session';
}>;

export function createDefaultPreferencesState(value?: Partial<HeliosPreferencesState>): HeliosPreferencesState;
export function createDefaultUIState(value?: Partial<HeliosUIState>): HeliosUIState;
export function createDefaultNetworkSource(value?: Partial<HeliosNetworkSource>): HeliosNetworkSource;
export function createPersistenceEnvelope(kind: 'preferences', payload: Partial<HeliosPreferencesState>, metadata?: Record<string, unknown>): PersistenceEnvelope<HeliosPreferencesState>;
export function createPersistenceEnvelope(kind: 'visualization', payload: Partial<HeliosVisualizationStatePayload>, metadata?: Record<string, unknown>): PersistenceEnvelope<HeliosVisualizationStatePayload>;
export function createPersistenceEnvelope(kind: 'session', payload: Partial<HeliosSessionPayload>, metadata?: Record<string, unknown>): PersistenceEnvelope<HeliosSessionPayload>;
export function migratePersistenceEnvelope(source: unknown, expectedKind?: 'preferences'): PersistenceEnvelope<HeliosPreferencesState>;
export function migratePersistenceEnvelope(source: unknown, expectedKind: 'visualization'): PersistenceEnvelope<HeliosVisualizationStatePayload>;
export function migratePersistenceEnvelope(source: unknown, expectedKind: 'session'): PersistenceEnvelope<HeliosSessionPayload>;
export function parsePersistenceEnvelope(source: unknown, expectedKind?: 'preferences'): PersistenceEnvelope<HeliosPreferencesState>;
export function parsePersistenceEnvelope(source: unknown, expectedKind: 'visualization'): PersistenceEnvelope<HeliosVisualizationStatePayload>;
export function parsePersistenceEnvelope(source: unknown, expectedKind: 'session'): PersistenceEnvelope<HeliosSessionPayload>;
export function serializePersistenceEnvelope(envelope: PersistenceEnvelope<any>, pretty?: boolean): string;

export class LocalStoragePreferenceStore {
  constructor(options?: { storage?: Storage | null; key?: string; unfinishedSessionKey?: string });
  read(): Promise<unknown>;
  write(value: unknown): Promise<unknown>;
  clear(): Promise<void>;
  getUnfinishedSessionId(): Promise<string | null>;
  setUnfinishedSessionId(id: string | null): Promise<string | null>;
}

export class IndexedDBSessionStore {
  constructor(options?: { indexedDB?: IDBFactory | null; dbName?: string; storeName?: string; version?: number });
  put(record: PersistenceEnvelope<HeliosSessionPayload>): Promise<PersistenceEnvelope<HeliosSessionPayload>>;
  get(id: string): Promise<PersistenceEnvelope<HeliosSessionPayload> | null>;
  getAll(): Promise<Array<PersistenceEnvelope<HeliosSessionPayload>>>;
  delete(id: string): Promise<boolean>;
}

export function createMemoryStorage(): Storage;
export function createMemoryIndexedDBFactory(): IDBFactory;

export class HeliosPersistenceService {
  helios: Helios | null;
  preferences: HeliosPreferencesState;
  constructor(options?: HeliosPersistenceServiceOptions);
  loadPreferences(): Promise<HeliosPreferencesState>;
  savePreferences(nextPreferences?: HeliosPreferencesState): Promise<HeliosPreferencesState>;
  getPreferences(): HeliosPreferencesState;
  updatePreferences(patch?: Partial<HeliosPreferencesState>): Promise<HeliosPreferencesState>;
  exportVisualizationState(options?: ExportVisualizationStateOptions): PersistenceEnvelope<HeliosVisualizationStatePayload> | string | Blob;
  importVisualizationState(source: PersistenceEnvelope<HeliosVisualizationStatePayload> | string, options?: Record<string, unknown>): Promise<PersistenceEnvelope<HeliosVisualizationStatePayload>>;
  saveSession(options?: HeliosPersistenceSaveSessionOptions): Promise<PersistenceEnvelope<HeliosSessionPayload>>;
  getSession(id: string): Promise<PersistenceEnvelope<HeliosSessionPayload> | null>;
  listSessions(options?: HeliosPersistenceListSessionsOptions): Promise<Array<PersistenceEnvelope<HeliosSessionPayload>>>;
  getRestorableSession(): Promise<PersistenceEnvelope<HeliosSessionPayload> | null>;
  restoreSession(idOrEnvelope: string | PersistenceEnvelope<HeliosSessionPayload>, options?: HeliosPersistenceRestoreSessionOptions): Promise<PersistenceEnvelope<HeliosSessionPayload> | null>;
  restoreUnfinishedSession(options?: HeliosPersistenceRestoreSessionOptions): Promise<PersistenceEnvelope<HeliosSessionPayload> | null>;
  markSessionFinished(id: string): Promise<PersistenceEnvelope<HeliosSessionPayload> | null>;
  deleteSession(id: string): Promise<boolean>;
}

export class HeliosUI {
  helios: Helios | null;
  constructor(options?: Record<string, unknown>);
  serializeState(): HeliosUIState;
  restoreState(state?: Partial<HeliosUIState>, options?: Record<string, unknown>): this;
}

export class UIAttribute<T = unknown> {
  constructor(options: Record<string, unknown>);
  static number<T = number>(options: Record<string, unknown>): UIAttribute<T>;
  static string<T = string>(options: Record<string, unknown>): UIAttribute<T>;
  static boolean<T = boolean>(options: Record<string, unknown>): UIAttribute<T>;
}

export class TabbedPanel {
  constructor(options?: Record<string, unknown>);
}

export class PanelStack {
  constructor(options?: Record<string, unknown>);
}

export function defineHeliosWebComponents(docOrWin?: Document | Window): void;
export function ensureDefaultStyles(doc?: Document): HTMLStyleElement | null;

export default Helios;
