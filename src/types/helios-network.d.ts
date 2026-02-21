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

    leidenModularity(options?: LeidenOptions): LeidenResult;
    createLeidenSession(options?: LeidenOptions): LeidenSession;

    readonly nodeIndices: Uint32Array;
    readonly edgeIndices: Uint32Array;
    readonly nodes: any;
    readonly edges: any;
    readonly edgesView: Uint32Array;
  }
}
