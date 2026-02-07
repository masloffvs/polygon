import { PipelineStage } from "./stage";

export interface AgentConfig {
	provider: "openai" | "anthropic" | "local" | "openrouter" | string;
	model: string;
	temperature?: number;
	systemPrompt?: string;
	inputSchema?: string; // Description of input data
	outputSchema?: string; // Description of output data
}

/**
 * PipelineAgent represents an AI-driven processing step.
 * It is functionality similar to a Stage (Input -> Output),
 * but implies the use of an LLM or Agentic behavior.
 */
export abstract class PipelineAgent<
	Input = any,
	Output = any,
> extends PipelineStage<Input, Output> {
	// Agent-specific metadata
	public abstract agentConfig: AgentConfig;

	// We can add specific methods for agent interaction here if needed
	// e.g., callLLM(prompt) helper
}
