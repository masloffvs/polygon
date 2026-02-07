import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../utils/logger";
import type { EdgeInstance, GraphSchema, NodeInstance } from "./Graph";
import type { DataFlowNode, ProcessingContext } from "./Node";
import { NodeRegistry } from "./registry";
import type { DataPacket, ErrorPacket, UUID } from "./types";

/**
 * Events emitted by the runtime.
 */
export enum RuntimeEvent {
  GRAPH_START = "graph:start",
  GRAPH_STOP = "graph:stop",
  NODE_START = "node:start",
  NODE_COMPLETED = "node:completed",
  NODE_ERROR = "node:error",
  EDGE_TRAVERSAL = "edge:traversal",
}

/**
 * Wrapper for a running node instance.
 * Manages input buffers and execution state.
 */
class RuntimeNodeWrapper {
  public readonly instanceId: UUID;
  public readonly definition: NodeInstance;
  public readonly nodeImpl: DataFlowNode;

  // Input Buffer: inputs received so far for the next execution
  // Map<InputPortName, DataPacket>
  private inputBuffer: Map<string, DataPacket> = new Map();

  constructor(definition: NodeInstance, impl: DataFlowNode) {
    this.instanceId = definition.id;
    this.definition = definition;
    this.nodeImpl = impl;
  }

  /**
   * Accepts a packet into an input port.
   * Return true if the node is ready to execute (all required inputs present).
   */
  public acceptInput(portName: string, packet: DataPacket): boolean {
    this.inputBuffer.set(portName, packet);

    // TODO: Verify if all REQUIRED inputs are present.
    // For now, checks if we have at least one input if nature allows,
    // or strictly check against manifest inputs.

    const inputPorts = this.nodeImpl.manifest.ports.inputs || [];
    const requiredPortNames = inputPorts
      .filter((p) => p.required !== false)
      .map((p) => p.name);

    // Simple check: do we have all ports defined in manifest?
    // In a real system, some inputs might be optional.
    return requiredPortNames.every((port) => this.inputBuffer.has(port));
  }

  public getInputs(): Record<string, DataPacket> {
    return Object.fromEntries(this.inputBuffer);
  }

  public clearInputs() {
    this.inputBuffer.clear();
  }
}

interface ExecutionOptions {
  traceId?: string;
  initialData?: Record<string, any>;
}

export class GraphRuntime extends EventEmitter {
  private schema: GraphSchema | null = null;
  private nodes: Map<UUID, RuntimeNodeWrapper> = new Map();
  // Adjacency list: SourceNodeID -> EdgeInstance[]
  private edges: Map<UUID, EdgeInstance[]> = new Map();

  private isRunning: boolean = false;
  private traceId: string = uuidv4();
  private readonly persistencePath: string;
  private readonly autoStart: boolean;

  constructor(persistencePath?: string, autoStart: boolean = false) {
    super();
    this.persistencePath =
      persistencePath || path.join(process.cwd(), "user_files", "graph.json");
    this.autoStart = autoStart;
    // Note: restore() is now called via init() after node registry is populated
  }

  /**
   * Initialize runtime - call this AFTER NodeRegistry is populated
   */
  public async init(): Promise<void> {
    await this.restore(this.autoStart);
  }

  public getGraph(): GraphSchema | null {
    return this.schema;
  }

  public get isActive() {
    return this.isRunning;
  }

  private get statePath() {
    return this.persistencePath.replace(".json", ".state.json");
  }

  private async saveState(running: boolean) {
    try {
      await fs.writeFile(this.statePath, JSON.stringify({ running }));
    } catch {
      /* ignore */
    }
  }

  /**
   * Attempts to restore graph from disk
   */
  private async restore(autoStart: boolean) {
    try {
      const data = await fs.readFile(this.persistencePath, "utf-8");
      const schema = JSON.parse(data);
      logger.info({ path: this.persistencePath }, "Restoring Graph from disk");
      await this.load(schema, false); // false = don't save again

      // Check persisted state
      let shouldStart = autoStart;
      try {
        const stateRaw = await fs.readFile(this.statePath, "utf-8");
        const state = JSON.parse(stateRaw);
        if (typeof state.running === "boolean") {
          shouldStart = state.running;
        }
      } catch {
        // No state file, adhere to autoStart argument
      }

      if (shouldStart) {
        logger.info("Auto-starting Graph Runtime");
        await this.run();
      }
    } catch (err) {
      logger.warn(
        { err, path: this.persistencePath },
        "No saved graph found or invalid",
      );
    }
  }

  /**
   * Loads a graph schema and instantiates the nodes.
   */
  public async load(schema: GraphSchema, persist = true): Promise<void> {
    this.schema = schema;
    if (persist) {
      try {
        await fs.mkdir(path.dirname(this.persistencePath), { recursive: true });
        await fs.writeFile(
          this.persistencePath,
          JSON.stringify(schema, null, 2),
        );
        logger.info("Graph saved to disk");
      } catch (err) {
        logger.error({ err }, "Failed to persist graph");
      }
    }
    this.nodes.clear();
    this.edges.clear();

    const registry = NodeRegistry.getInstance();

    // 1. Instantiate Nodes
    for (const nodeDef of schema.nodes) {
      try {
        // Initialize node with saved config
        const nodeImpl = registry.createInstance(
          nodeDef.typeId,
          nodeDef.id,
          nodeDef.settings,
        );

        // Bind emission
        nodeImpl.onEmit = (output) => {
          this.handleNodeEmission(nodeDef.id, output);
        };

        const wrapper = new RuntimeNodeWrapper(nodeDef, nodeImpl);
        this.nodes.set(nodeDef.id, wrapper);
      } catch (err) {
        logger.error(
          { nodeId: nodeDef.id, type: nodeDef.typeId, err },
          "Failed to instantiate node",
        );
        throw err;
      }
    }

    // 2. Map Edges
    for (const edge of schema.edges) {
      if (!this.edges.has(edge.sourceNodeId)) {
        this.edges.set(edge.sourceNodeId, []);
      }
      this.edges.get(edge.sourceNodeId)?.push(edge);
    }

    // 3. Initialize all nodes (for trigger nodes that need to subscribe early)
    logger.info({ nodeCount: this.nodes.size }, "Initializing nodes...");
    for (const node of this.nodes.values()) {
      if (typeof node.nodeImpl.initialize === "function") {
        try {
          logger.info(
            { nodeId: node.instanceId, type: node.definition.typeId },
            "Initializing node...",
          );
          await node.nodeImpl.initialize();
          logger.info(
            { nodeId: node.instanceId },
            "Node initialized successfully",
          );
        } catch (err) {
          logger.error(
            { nodeId: node.instanceId, err },
            "Node initialization failed",
          );
        }
      }
    }
    logger.info("All nodes initialized");

    logger.info({ graphId: schema.id, nodes: this.nodes.size }, "Graph loaded");
  }

  /**
   * Updates settings for a specific node and persists the change.
   */
  public async updateNodeSettings(
    nodeId: UUID,
    newSettings: Record<string, unknown>,
  ): Promise<void> {
    if (!this.schema) {
      logger.warn({ nodeId }, "Cannot update node settings: no graph loaded");
      return;
    }

    // Find node in schema
    const nodeDef = this.schema.nodes.find((n) => n.id === nodeId);
    if (!nodeDef) {
      logger.warn({ nodeId }, "Node not found in schema");
      return;
    }

    // Merge settings
    nodeDef.settings = { ...nodeDef.settings, ...newSettings };

    // Update runtime node config if exists
    const wrapper = this.nodes.get(nodeId);
    if (wrapper?.nodeImpl) {
      wrapper.nodeImpl.config = { ...wrapper.nodeImpl.config, ...newSettings };
    }

    // Persist to disk
    try {
      await fs.writeFile(
        this.persistencePath,
        JSON.stringify(this.schema, null, 2),
      );
      logger.info({ nodeId, settings: newSettings }, "Node settings updated");
    } catch (err) {
      logger.error({ err, nodeId }, "Failed to persist node settings");
    }
  }

  /**
   * Starts the graph execution.
   * If there are "Trigger" nodes, they should be kicked off here.
   * For Phase 3, we might manually trigger a node or look for nodes with no inputs.
   */
  public async run(options: ExecutionOptions = {}): Promise<void> {
    if (!this.schema) throw new Error("Graph not loaded");
    this.isRunning = true;
    await this.saveState(true);
    this.traceId = options.traceId || uuidv4();

    logger.info({ traceId: this.traceId }, "Starting Graph Execution");
    this.emit(RuntimeEvent.GRAPH_START, {
      traceId: this.traceId,
      timestamp: Date.now(),
    });

    // Note: Nodes are already initialized in load()

    // Find entry nodes (nodes with 0 input ports required OR nodes that are dedicated Triggers)
    // For now, let's just find nodes that have 0 incoming edges in the schema topology
    const allTargetNodeIds = new Set(
      this.schema.edges.map((e) => e.targetNodeId),
    );
    const entryNodes = Array.from(this.nodes.values()).filter(
      (node) => !allTargetNodeIds.has(node.instanceId),
    );

    if (entryNodes.length === 0 && this.nodes.size > 0) {
      logger.warn("No entry nodes found (circular dependency or empty graph?)");
    }

    // Execute entry nodes
    for (const node of entryNodes) {
      this.executeNode(node, {});
    }
  }

  /**
   * Handle spontaneous emissions from nodes (e.g. Clock, WebSocket)
   */
  public async handleNodeEmission(
    nodeId: UUID,
    result: Record<string, DataPacket>,
  ) {
    if (!this.isRunning) return;

    this.emit(RuntimeEvent.NODE_COMPLETED, {
      nodeId,
      result,
      timestamp: Date.now(),
    });

    const wrapper = this.nodes.get(nodeId);
    if (!wrapper) return;

    await this.propagateOutputs(wrapper, result);
  }

  /**
   * Execute a single node logic.
   */
  private async executeNode(
    wrapper: RuntimeNodeWrapper,
    inputs: Record<string, DataPacket>,
  ) {
    if (!this.isRunning) return;

    const nodeId = wrapper.instanceId;
    const context: ProcessingContext = {
      traceId: this.traceId,
      logger: {
        info: (msg, data) =>
          logger.info({ nodeId, traceId: this.traceId, ...data }, msg),
        warn: (msg, data) =>
          logger.warn({ nodeId, traceId: this.traceId, ...data }, msg),
        error: (msg, err) =>
          logger.error({ nodeId, traceId: this.traceId, err }, msg),
      },
      attempt: 1,
    };

    try {
      this.emit(RuntimeEvent.NODE_START, { nodeId, timestamp: Date.now() });

      const result = await wrapper.nodeImpl.process(inputs, context);

      // Handle Errors returned as values (Contract of ErrorPacket)
      if (this.isErrorPacket(result)) {
        this.handleNodeError(wrapper, result);
        return;
      }

      this.emit(RuntimeEvent.NODE_COMPLETED, {
        nodeId,
        result,
        timestamp: Date.now(),
      });

      // Propagate outputs
      await this.propagateOutputs(
        wrapper,
        result as Record<string, DataPacket>,
      );
    } catch (err: any) {
      // Handle unhandled exceptions during process()
      const errorPacket: ErrorPacket = {
        code: "UNHANDLED_EXCEPTION",
        message: err.message || "Unknown error",
        nodeId: wrapper.instanceId,
        traceId: this.traceId,
        timestamp: Date.now(),
        recoverable: false,
        details: err,
      };
      this.handleNodeError(wrapper, errorPacket);
    }
  }

  private isErrorPacket(obj: any): obj is ErrorPacket {
    return (
      obj &&
      typeof obj.code === "string" &&
      typeof obj.traceId === "string" &&
      obj.nodeId
    );
  }

  private handleNodeError(_wrapper: RuntimeNodeWrapper, error: ErrorPacket) {
    logger.error({ error }, "Node execution failed");
    this.emit(RuntimeEvent.NODE_ERROR, error);
    // Stop graph? Route to error handler?
    // For now, we just log and emit.
  }

  /**
   * Push outputs to downstream nodes
   */
  private async propagateOutputs(
    sourceWrapper: RuntimeNodeWrapper,
    outputs: Record<string, DataPacket>,
  ) {
    const edges = this.edges.get(sourceWrapper.instanceId) || [];

    for (const edge of edges) {
      const outputPacket = outputs[edge.sourcePortName];
      if (!outputPacket) continue; // Node didn't produce output for this port

      // TODO: Apply Edge Modifiers (Filter/Transform) here
      // const processedPacket = this.applyEdgeModifiers(edge, outputPacket);
      const processedPacket = outputPacket; // Pass-through for now

      if (!processedPacket) continue; // Filtered out

      const targetWrapper = this.nodes.get(edge.targetNodeId);
      if (targetWrapper) {
        this.emit(RuntimeEvent.EDGE_TRAVERSAL, {
          edgeId: edge.id,
          source: edge.sourceNodeId,
          target: edge.targetNodeId,
          packetId: processedPacket.id,
        });

        const ready = targetWrapper.acceptInput(
          edge.targetPortName,
          processedPacket,
        );

        if (ready) {
          // If the node is ready (has all inputs), execute it.
          // Using setImmediate to break the stack and allow async flow
          setImmediate(() => {
            this.executeNode(targetWrapper, targetWrapper.getInputs());
            targetWrapper.clearInputs(); // Consume inputs
          });
        }
      }
    }
  }

  public async stop() {
    this.isRunning = false;
    await this.saveState(false);

    // Dispose all nodes
    for (const wrapper of this.nodes.values()) {
      try {
        await wrapper.nodeImpl.dispose();
      } catch (err) {
        logger.warn(
          { nodeId: wrapper.instanceId, err },
          "Error disposing node",
        );
      }
    }

    this.emit(RuntimeEvent.GRAPH_STOP, {
      traceId: this.traceId,
      timestamp: Date.now(),
    });
  }

  /**
   * Get a node instance by ID
   */
  public getNodeById(nodeId: UUID): DataFlowNode | undefined {
    const wrapper = this.nodes.get(nodeId);
    return wrapper?.nodeImpl;
  }

  /**
   * Get node settings by ID (from schema definition)
   */
  public getNodeSettings(nodeId: UUID): Record<string, unknown> | undefined {
    const wrapper = this.nodes.get(nodeId);
    return wrapper?.definition.settings;
  }

  /**
   * Get all node instances of a specific type
   */
  public getNodesByType(typeId: string): DataFlowNode[] {
    const result: DataFlowNode[] = [];
    for (const wrapper of this.nodes.values()) {
      if (wrapper.definition.typeId === typeId) {
        result.push(wrapper.nodeImpl);
      }
    }
    return result;
  }

  /**
   * Get all running node IDs
   */
  public getRunningNodeIds(): UUID[] {
    return Array.from(this.nodes.keys());
  }
}
