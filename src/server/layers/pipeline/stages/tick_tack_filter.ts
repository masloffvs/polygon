import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

interface TickPayload {
	tickNumber: number;
	timestamp: number;
	message: string;
}

export class TickTackFilterStage extends PipelineStage<
	TickPayload,
	TickPayload
> {
	id = "tick-tack-filter";
	description = "Allows only the first 3 ticks of the current run";
	inputs = ["tick-tack-source"];
	output = "tick-tack-accepted";

	private count = 0;
	private readonly MAX_TICKS = 3;

	public async process(
		data: TickPayload,
		_context: ProcessingContext,
	): Promise<TickPayload | null> {
		if (this.count < this.MAX_TICKS) {
			this.count++;
			return data;
		}

		// After 3 ticks, drop (return null)
		return null;
	}
}
