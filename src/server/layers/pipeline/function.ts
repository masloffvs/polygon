import type { ProcessingContext, Topic } from "./types";

export abstract class PipelineFunction<Input = any> {
	public abstract id: string;
	public abstract description: string;
	public abstract inputs: Topic[];

	/**
	 * Execute the function logic.
	 * This is a terminal action (side-effect).
	 * No return value is passed downstream.
	 */
	public abstract execute(
		data: Input,
		context: ProcessingContext,
	): Promise<void>;
}
