import type { DataFlowNode } from "./Node";
import type { NodeManifest } from "./types";

/**
 * Singleton Registry for all available Data Flow Nodes.
 */
export class NodeRegistry {
	private static instance: NodeRegistry;

	// Maps Node Type ID -> { manifest, constructor }
	private nodes = new Map<
		string,
		{
			manifest: NodeManifest;
			ctor: new (id: string, config: any, ...args: any[]) => DataFlowNode;
		}
	>();

	private constructor() {}

	public static getInstance(): NodeRegistry {
		if (!NodeRegistry.instance) {
			NodeRegistry.instance = new NodeRegistry();
		}
		return NodeRegistry.instance;
	}

	/**
	 * Register a new node type.
	 */
	public register(
		manifest: NodeManifest,
		ctor: new (id: string, config: any, ...args: any[]) => DataFlowNode,
	) {
		if (this.nodes.has(manifest.id)) {
			console.warn(`[NodeRegistry] Overwriting node type: ${manifest.id}`);
		}

		// Basic validation
		if (!manifest.id || !manifest.version) {
			throw new Error(
				`Invalid manifest for node: ${manifest.name}. Missing ID or Version.`,
			);
		}

		this.nodes.set(manifest.id, { manifest, ctor });
		console.log(
			`[NodeRegistry] Registered: ${manifest.id} (v${manifest.version})`,
		);
	}

	/**
	 * Get metadata for all registered nodes (for UI).
	 */
	public getManifests(): NodeManifest[] {
		return Array.from(this.nodes.values()).map((n) => n.manifest);
	}

	/**
	 * Create a runtime instance of a node.
	 */
	public createInstance(
		typeId: string,
		instanceId: string,
		config: Record<string, any>,
		...extraArgs: any[]
	): DataFlowNode {
		const entry = this.nodes.get(typeId);
		if (!entry) {
			throw new Error(`[NodeRegistry] Unknown node type: ${typeId}`);
		}

		// Instantiate with default config merging if needed
		// (Here we assume config is already merged with defaults by the UI or Loader)
		return new entry.ctor(instanceId, config, ...extraArgs);
	}

	/**
	 * Get specific manifest by ID.
	 */
	public getManifest(typeId: string): NodeManifest | undefined {
		return this.nodes.get(typeId)?.manifest;
	}
}
