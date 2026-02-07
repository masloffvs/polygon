import type { DataPacket, ErrorPacket, NodeManifest, UUID } from "./types";

/**
 * Interface for State Persistence.
 * Allows switching between Memory, File, or Redis storage.
 */
export interface StateAdapter {
	get(key: string): Promise<any>;
	set(key: string, value: any): Promise<void>;
	delete(key: string): Promise<void>;
	clear(): Promise<void>;
}

export class InMemoryStateAdapter implements StateAdapter {
	private store = new Map<string, any>();

	async get(key: string) {
		return this.store.get(key);
	}
	async set(key: string, value: any) {
		this.store.set(key, value);
	}
	async delete(key: string) {
		this.store.delete(key);
	}
	async clear() {
		this.store.clear();
	}
}

/**
 * Context passed to the node execution.
 * Allows nodes to log progress, access global config, or report non-fatal errors.
 */
export interface ProcessingContext {
	traceId: string;
	logger: {
		info: (msg: string, data?: any) => void;
		warn: (msg: string, data?: any) => void;
		error: (msg: string, err?: any) => void;
	};
	attempt: number; // Current retry attempt
}

/**
 * Abstract Base Class for all Data Flow Nodes.
 */
export abstract class DataFlowNode {
	public abstract readonly manifest: NodeManifest;

	// Instance configuration (values for 'settings' from schema.json)
	protected config: Record<string, any>;

	// Runtime ID (instance ID in the graph)
	public readonly id: UUID;

	// Callback for spontaneous emission (e.g. streaming/events)
	public onEmit?: (output: Record<string, DataPacket>) => void;

	constructor(id: UUID, config: Record<string, any> = {}) {
		this.id = id;
		this.config = config;
	}

	// Helper to emit data spontaneously
	protected emit(output: Record<string, DataPacket>) {
		if (this.onEmit) {
			this.onEmit(output);
		}
	}

	/**
	 * The core logic function.
	 * @param inputs Map of InputPortName -> DataPacket
	 */
	public abstract process(
		inputs: Record<string, DataPacket>,
		context: ProcessingContext,
	): Promise<Record<string, DataPacket> | ErrorPacket>;

	/**
	 * Called when the graph is stopped or the node is destroyed.
	 */
	public async dispose(): Promise<void> {}

	/**
	 * Validate config against manifest settings before running.
	 */
	public validateConfig(): boolean {
		// Basic validation based on manifest.settings
		// In a real implementation this would check types and required fields
		return true;
	}
}

/**
 * Pure Nodes are deterministic and stateless.
 * Input -> Logic -> Output.
 * No side effects allowed.
 */
export abstract class PureNode extends DataFlowNode {
	// Pure nodes don't need special setup
}

/**
 * Stateful Nodes maintain state across executions.
 * (e.g. Sliding Windows, Aggregators, ML Buffers)
 */
export abstract class StatefulNode extends DataFlowNode {
	protected state: StateAdapter;

	constructor(
		id: UUID,
		config: Record<string, any>,
		stateAdapter?: StateAdapter,
	) {
		super(id, config);
		this.state = stateAdapter || new InMemoryStateAdapter();
	}

	// Helper to scope keys to this node instance
	protected async getState(key: string): Promise<any> {
		return this.state.get(`${this.id}:${key}`);
	}

	protected async setState(key: string, value: any): Promise<void> {
		return this.state.set(`${this.id}:${key}`, value);
	}
}

/**
 * IO Nodes perform side effects (Network, Disk, DB).
 * These are usually non-deterministic and can fail due to external factors.
 */
export abstract class IONode extends DataFlowNode {
	// IO Nodes might need access to global secrets or connection pools
}
