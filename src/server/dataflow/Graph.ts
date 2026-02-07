import type { SemVer, UUID } from "./types";

/**
 * Represents a specific instance of a node in a graph.
 * This is arguably the most important storage entity.
 */
export interface NodeInstance {
  id: UUID;
  typeId: string; // References NodeManifest.id (e.g., "http-request")
  version: SemVer; // Locks the specific version of the node logic

  // User-configured values for 'settings' defined in schema.json
  settings: Record<string, any>;

  // UI position for the editor
  position: { x: number; y: number };

  // Optional execution overrides for this specific instance
  executionOverrides?: {
    timeoutMs?: number;
    retry?: number;
  };

  // Optional view configuration for visualization
  view?: {
    id: string; // DataView ID (e.g., "TestView")
    args?: Record<string, any>; // Arguments to pass to the view
  };
}

/**
 * Connects an Output Port of one node to an Input Port of another.
 */
export interface EdgeInstance {
  id: UUID;
  sourceNodeId: UUID;
  sourcePortName: string;

  targetNodeId: UUID;
  targetPortName: string;

  // Smart Edge configuration
  modifiers?: {
    filterExpression?: string; // JS expression string to filter packets
    transformExpression?: string; // JS expression to map data on the fly
    bufferSize?: number; // Backpressure control
  };
}

/**
 * The Graph Artifact (Infrastructure as Code).
 * This JSON structure is what gets saved, versioned, and deployed.
 */
export interface GraphSchema {
  id: UUID;
  name: string;
  version: SemVer; // Version of THIS graph topology

  metadata: {
    author: string;
    createdAt: number;
    updatedAt: number;
    description: string;
    tags: string[];
  };

  config: {
    maxConcurrency: number;
    stateStorage: "memory" | "file" | "redis";
    checkpointIntervalMs?: number;
  };

  nodes: NodeInstance[];
  edges: EdgeInstance[];
}

/**
 * Runtime Model of a Graph.
 * Optimized for execution lookup (Adjacency List).
 */
export class GraphModel {
  public readonly id: UUID;
  public readonly nodes = new Map<UUID, NodeInstance>();
  // Adjacency list: NodeID -> Outgoing Edges
  public readonly adjacency = new Map<UUID, EdgeInstance[]>();
  // Reverse adjacency: NodeID -> Incoming Edges (for dependency resolution)
  public readonly reverseAdjacency = new Map<UUID, EdgeInstance[]>();

  constructor(schema: GraphSchema) {
    this.id = schema.id;

    // Index Nodes
    schema.nodes.forEach((node) => {
      this.nodes.set(node.id, node);
      this.adjacency.set(node.id, []);
      this.reverseAdjacency.set(node.id, []);
    });

    // Index Edges
    schema.edges.forEach((edge) => {
      // Validate node existence
      if (
        !this.nodes.has(edge.sourceNodeId) ||
        !this.nodes.has(edge.targetNodeId)
      ) {
        console.warn(
          `Graph integrity warning: Edge ${edge.id} references missing nodes.`,
        );
        return;
      }

      this.adjacency.get(edge.sourceNodeId)?.push(edge);
      this.reverseAdjacency.get(edge.targetNodeId)?.push(edge);
    });
  }

  /**
   * Find root nodes (nodes with no dependencies/inputs configured in this graph).
   * These are usually 'Trigger' or 'Listener' nodes.
   */
  public getRootNodes(): NodeInstance[] {
    const roots: NodeInstance[] = [];
    this.reverseAdjacency.forEach((edges, nodeId) => {
      if (edges.length === 0) {
        const node = this.nodes.get(nodeId);
        if (node) roots.push(node);
      }
    });
    return roots;
  }

  /**
   * Get downstream edges for a node.
   */
  public getOutgoingEdges(nodeId: UUID): EdgeInstance[] {
    return this.adjacency.get(nodeId) || [];
  }

  /**
   * Get upstream dependencies for a node.
   */
  public getIncomingEdges(nodeId: UUID): EdgeInstance[] {
    return this.reverseAdjacency.get(nodeId) || [];
  }
}
