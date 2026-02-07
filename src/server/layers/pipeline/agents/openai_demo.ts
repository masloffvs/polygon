import { type AgentConfig, PipelineAgent } from "../agent";
import type { ProcessingContext } from "../types";

interface ReviewInput {
	tickNumber: number;
	message: string;
}

interface ReviewOutput {
	sentiment: "positive" | "negative" | "neutral";
	summary: string;
}

export class OpenAIDemoAgent extends PipelineAgent<ReviewInput, ReviewOutput> {
	id = "openai-demo-agent";
	description = "Analyzes incoming ticks using OpenAI (Simulation)";
	inputs = ["tick-tack-accepted"];
	output = "review-analysis";

	agentConfig: AgentConfig = {
		provider: "openai",
		model: "gpt-4o",
		systemPrompt: "Analyze the incoming tick message and determine sentiment.",
		inputSchema: "{ tickNumber: number, message: string }",
		outputSchema: "{ sentiment: 'positive'|'negative', summary: string }",
	};

	public async process(
		data: ReviewInput,
		_context: ProcessingContext,
	): Promise<ReviewOutput | null> {
		// Simulate LLM latency
		await new Promise((resolve) => setTimeout(resolve, 1500));

		// Simulate LLM response
		return {
			sentiment: "positive",
			summary: `Analyzed tick #${data.tickNumber}: "${data.message}". System seems operational.`,
		};
	}
}
