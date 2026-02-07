import type { ProcessingContext, Topic } from "./types";

export abstract class PipelineStage<Input = any, Output = any> {
	public abstract id: string;
	public abstract description: string;
	public abstract inputs: Topic[];
	public abstract output: Topic;

	/**
	 * Process the incoming data.
	 * Return null to drop the data (stops the pipeline for this packet).
	 * Return data to emit it to the output topic.
	 */
	public abstract process(
		data: Input,
		context: ProcessingContext,
	): Promise<Output | null>;
}
