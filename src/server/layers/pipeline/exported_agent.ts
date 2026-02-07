import { DataFlowNode, type ProcessingContext } from "../../dataflow/Node";
import {
	DataPacket,
	type ErrorPacket,
	type NodeManifest,
	type UUID,
} from "../../dataflow/types";
import { type AgentConfig, PipelineAgent } from "./agent";
import type { ProcessingContext as PipelineContext } from "./types";

/**
 * ExportedAgent represents an AI-driven processing step that can be used
 * in BOTH the Pipeline system AND as a DataStudio Node.
 *
 * This allows reusing agent logic across:
 * - Server-side pipeline processing (news aggregation, etc.)
 * - User-facing DataStudio visual graphs
 *
 * The agent exposes a simple API that bridges both systems.
 */
export interface ExportedAgentManifest {
	id: string;
	name: string;
	description: string;
	category: string;
	ui?: {
		color?: string;
		icon?: string;
	};
	settings?: Array<{
		name: string;
		type: "string" | "number" | "boolean" | "text" | "select";
		label: string;
		defaultValue?: any;
		options?: Array<{ label: string; value: string }>;
		required?: boolean;
	}>;
}

/**
 * Base class for agents that work in both Pipeline and DataStudio.
 *
 * Usage:
 * 1. Extend this class
 * 2. Implement `agentManifest`, `agentConfig`, and `run()`
 * 3. The agent auto-registers for both systems
 */
export abstract class ExportedAgent<Input = any, Output = any> {
	// Agent manifest for DataStudio integration
	public abstract readonly agentManifest: ExportedAgentManifest;

	// LLM configuration
	public abstract readonly agentConfig: AgentConfig;

	// Pipeline integration
	public abstract readonly pipelineInputs: string[];
	public abstract readonly pipelineOutput: string;

	/**
	 * Core processing logic - used by both Pipeline and DataStudio.
	 * @param input - Raw input data (any format)
	 * @param settings - Configuration from node settings or pipeline config
	 */
	public abstract run(
		input: Input,
		settings: Record<string, any>,
	): Promise<Output | null>;

	/**
	 * Converts the agent to a DataFlowNode for use in DataStudio.
	 */
	public toDataFlowNode(): new (
		id: UUID,
		config: Record<string, any>,
	) => DataFlowNode {
		const agent = this;

		// Generate NodeManifest from ExportedAgentManifest
		const manifest: NodeManifest = {
			id: agent.agentManifest.id,
			version: "1.0.0",
			name: agent.agentManifest.name,
			category: agent.agentManifest.category,
			description: agent.agentManifest.description,
			ui: agent.agentManifest.ui || { color: "#8b5cf6", icon: "brain" },
			ports: {
				inputs: [{ name: "data", type: "any", description: "Input data" }],
				outputs: [
					{ name: "text", type: "string", description: "Processed output" },
				],
			},
			settings: agent.agentManifest.settings || [],
		};

		return class extends DataFlowNode {
			public readonly manifest: NodeManifest = manifest;

			constructor(id: UUID, config: Record<string, any> = {}) {
				super(id, config);
			}

			public async process(
				inputs: Record<string, DataPacket>,
				context: ProcessingContext,
			): Promise<Record<string, DataPacket> | ErrorPacket> {
				const inputData = inputs.data?.value;

				if (inputData === undefined || inputData === null) {
					return { text: new DataPacket(null) };
				}

				try {
					const result = await agent.run(inputData, this.config);
					return { text: new DataPacket(result) };
				} catch (err: any) {
					context.logger.error("Agent execution failed", err);
					return {
						error: true,
						message: err.message || "Agent execution failed",
						code: "AGENT_ERROR",
					};
				}
			}
		};
	}

	/**
	 * Converts the agent to a PipelineAgent for use in Pipeline system.
	 */
	public toPipelineAgent(): PipelineAgent<Input, Output> {
		const agent = this;

		return new (class extends PipelineAgent<Input, Output> {
			id = agent.agentManifest.id;
			description = agent.agentManifest.description;
			inputs = agent.pipelineInputs;
			output = agent.pipelineOutput;
			agentConfig = agent.agentConfig;

			public async process(
				data: Input,
				_context: PipelineContext,
			): Promise<Output | null> {
				return agent.run(data, {});
			}
		})();
	}

	/**
	 * Generates a NodeManifest compatible with NodeRegistry.
	 */
	public toNodeManifest(): NodeManifest {
		return {
			id: this.agentManifest.id,
			version: "1.0.0",
			name: this.agentManifest.name,
			category: this.agentManifest.category,
			description: this.agentManifest.description,
			ui: this.agentManifest.ui || { color: "#8b5cf6", icon: "brain" },
			ports: {
				inputs: [{ name: "data", type: "any", description: "Input data" }],
				outputs: [
					{ name: "text", type: "string", description: "Processed output" },
				],
			},
			settings: this.agentManifest.settings || [],
		};
	}
}

/**
 * Registry of all exported agents.
 * Allows discovering agents that can be used in DataStudio.
 */
const exportedAgentRegistry = new Map<string, ExportedAgent>();

export function registerExportedAgent(agent: ExportedAgent): void {
	exportedAgentRegistry.set(agent.agentManifest.id, agent);
	console.log(
		`[ExportedAgent] Registered: ${agent.agentManifest.id} (${agent.agentManifest.name})`,
	);
}

export function getExportedAgent(id: string): ExportedAgent | undefined {
	return exportedAgentRegistry.get(id);
}

export function getAllExportedAgents(): ExportedAgent[] {
	return Array.from(exportedAgentRegistry.values());
}

/**
 * Register all ExportedAgents into a NodeRegistry.
 * This bridges the agent system with DataStudio nodes.
 */
export function registerAgentsToNodeRegistry(registry: {
	register: (
		manifest: NodeManifest,
		ctor: new (id: string, config: any) => DataFlowNode,
	) => void;
}): number {
	const agents = getAllExportedAgents();
	let count = 0;

	for (const agent of agents) {
		try {
			const manifest = agent.toNodeManifest();
			const NodeClass = agent.toDataFlowNode();
			registry.register(manifest, NodeClass);
			count++;
		} catch (err: any) {
			console.error(
				`[ExportedAgent] Failed to register ${agent.agentManifest.id}:`,
				err.message,
			);
		}
	}

	console.log(`[ExportedAgent] Registered ${count} agents as DataStudio nodes`);
	return count;
}
