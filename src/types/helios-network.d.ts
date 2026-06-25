declare module 'helios-network' {
  export enum AttributeType {
    String = 0,
    Boolean = 1,
    Float = 2,
    Integer = 3,
    UnsignedInteger = 4,
    Double = 5,
    Category = 6,
    Data = 7,
    Javascript = 8,
    Unknown = 255
  }

  export interface AttributeBuffer<T extends ArrayBufferView = Float32Array> {
    readonly view: T;
    readonly type: AttributeType;
    readonly dimension: number;
    bumpVersion?: () => void;
  }

  export interface NodeNeighbors {
    nodes: Uint32Array;
    edges: Uint32Array;
  }

  export interface HeliosNetworkOptions {
    directed?: boolean;
    initialNodes?: number;
    initialEdges?: number;
  }

  export interface SerializedOptions {
    path?: string;
    format?: 'uint8array' | 'arraybuffer' | 'base64' | 'blob';
  }

  export interface LeidenOptions {
    resolution?: number;
    edgeWeightAttribute?: string | null;
    outNodeCommunityAttribute?: string;
    categoricalCommunities?: boolean;
    seed?: number;
    maxLevels?: number;
    maxPasses?: number;
    passes?: number;
  }

  export interface LeidenStepOptions {
    budget?: number;
    timeoutMs?: number | null;
    chunkBudget?: number;
  }

  export interface LeidenProgress {
    progressCurrent: number;
    progressTotal: number;
    phase: number;
    level: number;
    maxLevels: number;
    pass: number;
    maxPasses: number;
    visitedThisPass?: number;
    nodeCount?: number;
    communityCount?: number;
  }

  export interface LeidenResult {
    communityCount: number;
    modularity: number;
  }

  export enum DimensionDifferenceMethod {
    Forward = 0,
    Backward = 1,
    Central = 2,
    LeastSquares = 3,
  }

  export enum NeighborDirection {
    Out = 0,
    In = 1,
    Both = 2,
  }

  export enum StrengthMeasure {
    Sum = 0,
    Average = 1,
    Maximum = 2,
    Minimum = 3,
  }

  export enum ClusteringCoefficientVariant {
    Unweighted = 0,
    Onnela = 1,
    Newman = 2,
  }

  export enum MeasurementExecutionMode {
    Auto = 0,
    SingleThread = 1,
    Parallel = 2,
  }

  export interface NodeMetricResult {
    nodeIndices: Uint32Array;
    values: Float32Array;
    valuesByNode: Float32Array;
  }

  export interface DegreeOptions {
    direction?: NeighborDirection | 'out' | 'in' | 'both' | 'outgoing' | 'incoming' | 'all' | 'union';
    nodes?: ArrayLike<number> | null;
    outNodeAttribute?: string | null;
  }

  export interface StrengthOptions extends DegreeOptions {
    edgeWeightAttribute?: string | null;
    measure?: StrengthMeasure | 'sum' | 'average' | 'avg' | 'mean' | 'maximum' | 'max' | 'minimum' | 'min';
  }

  export interface LocalClusteringOptions extends DegreeOptions {
    edgeWeightAttribute?: string | null;
    variant?: ClusteringCoefficientVariant | 'unweighted' | 'onnela' | 'newman' | 'weighted' | 'barrat' | 'binary';
  }

  export interface EigenvectorCentralityOptions extends DegreeOptions {
    edgeWeightAttribute?: string | null;
    executionMode?: MeasurementExecutionMode | 'auto' | 'single-thread' | 'single' | 'sequential' | 'parallel' | 'native';
    maxIterations?: number;
    tolerance?: number;
    initialValues?: Float32Array | Array<number> | null;
  }

  export interface BetweennessCentralityOptions {
    edgeWeightAttribute?: string | null;
    executionMode?: MeasurementExecutionMode | 'auto' | 'single-thread' | 'single' | 'sequential' | 'parallel' | 'native';
    sourceNodes?: ArrayLike<number> | null;
    normalize?: boolean;
    accumulate?: boolean;
    initialValues?: Float32Array | Array<number> | null;
    nodes?: ArrayLike<number> | null;
    outNodeAttribute?: string | null;
  }

  export interface EigenvectorCentralityResult extends NodeMetricResult {
    direction: NeighborDirection;
    eigenvalue: number;
    delta: number;
    iterations: number;
    converged: boolean;
  }

  export interface BetweennessCentralityResult extends NodeMetricResult {
    processedSources: number;
    normalize: boolean;
    accumulate: boolean;
  }

  export interface DimensionOptions {
    maxLevel?: number;
    method?: DimensionDifferenceMethod | 'forward' | 'backward' | 'central' | 'centered' | 'leastsquares' | 'fw' | 'bk' | 'ce' | 'ls';
    order?: number;
    nodes?: ArrayLike<number> | null;
  }

  export interface NodeDimensionResult {
    capacity: Uint32Array;
    dimension: Float32Array;
    maxLevel: number;
    method: number;
    order: number;
  }

  export interface DimensionResult {
    selectedCount: number;
    averageCapacity: Float32Array;
    globalDimension: Float32Array;
    averageNodeDimension: Float32Array;
    nodeDimensionStddev: Float32Array;
    maxLevel: number;
    method: number;
    order: number;
  }

  export interface DimensionProgress {
    phase: number;
    progressCurrent: number;
    progressTotal: number;
    processedNodes: number;
    nodeCount: number;
    maxLevel: number;
    method: number;
    order: number;
  }

  export interface DimensionStepOptions {
    budget?: number;
    timeoutMs?: number | null;
    chunkBudget?: number;
  }

  export interface DimensionSession {
    getProgress(): DimensionProgress;
    step(options?: DimensionStepOptions): DimensionProgress;
    run(options?: {
      stepOptions?: DimensionStepOptions;
      yield?: (progress?: DimensionProgress) => void | Promise<void>;
      yieldMs?: number;
      onProgress?: (progress: DimensionProgress) => void;
      signal?: AbortSignal;
      maxIterations?: number;
    }): Promise<DimensionProgress>;
    finalize(options?: {
      outNodeMaxDimensionAttribute?: string | null;
      outNodeDimensionLevelsAttribute?: string | null;
      dimensionLevelsEncoding?: 'vector' | 'string' | 'array' | 'numeric' | 'json' | 'csv';
      dimensionLevelsStringPrecision?: number;
    }): DimensionResult;
    isComplete(): boolean;
    isFailed(): boolean;
    isFinalized(): boolean;
    cancel(reason?: string): void;
    dispose(): void;
  }

  export interface DimensionSessionOptions extends DimensionOptions {
    captureNodeDimensionProfiles?: boolean;
    outNodeMaxDimensionAttribute?: string | null;
    outNodeDimensionLevelsAttribute?: string | null;
    dimensionLevelsEncoding?: 'vector' | 'string' | 'array' | 'numeric' | 'json' | 'csv';
    dimensionLevelsStringPrecision?: number;
  }

  export interface LeidenSession {
    getProgress(): LeidenProgress;
    isComplete(): boolean;
    isFinalized(): boolean;
    step(options?: LeidenStepOptions): LeidenProgress;
    run(options?: {
      stepOptions?: LeidenStepOptions;
      yield?: () => void | Promise<void>;
      maxIterations?: number;
    }): Promise<LeidenProgress>;
    runWorker(options?: {
      outNodeCommunityAttribute?: string;
      categoricalCommunities?: boolean;
      yieldMs?: number;
      stepOptions?: LeidenStepOptions;
      onProgress?: (progress: LeidenProgress) => void;
      signal?: AbortSignal;
    }): Promise<LeidenResult>;
    finalize(options?: {
      outNodeCommunityAttribute?: string;
      categoricalCommunities?: boolean;
    }): LeidenResult;
    dispose(): void;
  }

  export default class HeliosNetwork {
    static create(options?: HeliosNetworkOptions): Promise<HeliosNetwork>;
    static createSync(options?: HeliosNetworkOptions): HeliosNetwork;

    readonly nodeCount: number;
    readonly edgeCount: number;
    readonly nodeCapacity: number;
    readonly edgeCapacity: number;

    dispose(): void;

    addNodes(count: number): Uint32Array;
    addEdges(edges: ArrayLike<number> | Array<[number, number]> | Array<{ from: number; to: number }>): Uint32Array;
    removeNodes(nodes: Iterable<number>): void;
    removeEdges(edges: Iterable<number>): void;

    defineNodeAttribute(name: string, type: AttributeType, dimension?: number): void;
    defineEdgeAttribute(name: string, type: AttributeType, dimension?: number): void;
    defineNetworkAttribute(name: string, type: AttributeType, dimension?: number): void;

    getNodeAttributeBuffer<T extends ArrayBufferView = Float32Array>(name: string): AttributeBuffer<T>;
    getEdgeAttributeBuffer<T extends ArrayBufferView = Float32Array>(name: string): AttributeBuffer<T>;
    getNetworkAttributeBuffer<T extends ArrayBufferView = Float32Array>(name: string): AttributeBuffer<T>;

    interpolateNodeAttribute(
      name: string,
      target: Float32Array | number[],
      options?: {
        elapsedMs?: number;
        layoutElapsedMs?: number;
        smoothing?: number;
        minDisplacementRatio?: number;
        emitEvent?: boolean;
      }
    ): boolean;

    setNodeStringAttribute(name: string, index: number, value: string | null | undefined): void;
    getNodeStringAttribute(name: string, index: number): string | null;

    setEdgeStringAttribute(name: string, index: number, value: string | null | undefined): void;
    getEdgeStringAttribute(name: string, index: number): string | null;

    getOutNeighbors(node: number): NodeNeighbors;
    getInNeighbors(node: number): NodeNeighbors;

    hasNodeIndex(index: number): boolean;
    hasEdgeIndex(index: number): boolean;
    hasNodeIndices(indices: Iterable<number> | Uint32Array): boolean[];
    hasEdgeIndices(indices: Iterable<number> | Uint32Array): boolean[];
    promoteActiveNodesToRenderEnd(indices: Iterable<number> | Uint32Array): { changed: boolean; start: number; count: number; version: string | number };
    promoteActiveEdgesToRenderEnd(indices: Iterable<number> | Uint32Array): { changed: boolean; start: number; count: number; version: string | number };
    promoteActiveEdgesForNodesToRenderEnd(
      nodeIndices: Iterable<number> | Uint32Array,
      options?: { direction?: 'out' | 'in' | 'both' | number }
    ): { changed: boolean; start: number; count: number; version: string | number };
    getActiveIndexDirtyRange(scope: 'node' | 'edge'): { start: number; count: number; version: string | number } | null;

    leidenModularity(options?: LeidenOptions): LeidenResult;
    createLeidenSession(options?: LeidenOptions): LeidenSession;
    measureDegree(options?: DegreeOptions): NodeMetricResult & { direction: NeighborDirection };
    measureStrength(options?: StrengthOptions): NodeMetricResult & { direction: NeighborDirection; measure: StrengthMeasure };
    measureLocalClusteringCoefficient(options?: LocalClusteringOptions): NodeMetricResult & { direction: NeighborDirection; variant: ClusteringCoefficientVariant };
    measureEigenvectorCentrality(options?: EigenvectorCentralityOptions): EigenvectorCentralityResult;
    measureBetweennessCentrality(options?: BetweennessCentralityOptions): BetweennessCentralityResult;
    measureNodeDimension(node: number, options?: DimensionOptions): NodeDimensionResult;
    measureDimension(options?: DimensionOptions): DimensionResult;
    createDimensionSession(options?: DimensionSessionOptions): DimensionSession;

    readonly nodeIndices: Uint32Array;
    readonly edgeIndices: Uint32Array;
    readonly nodes: any;
    readonly edges: any;
    readonly edgesView: Uint32Array;
  }
}
