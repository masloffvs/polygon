import { logger } from "../../../utils/logger";
import { PipelineFunction } from "../function";
import type { ProcessingContext } from "../types";

export class TickTackRegistratorFunction extends PipelineFunction<any> {
	id = "tick-tack-registrator";
	description = "Registers allowed ticks (Terminal Function)";
	inputs = ["tick-tack-accepted"];

	public async execute(data: any, _context: ProcessingContext): Promise<void> {
		logger.info(
			{
				source: this.id, // Added source for UI filtering
				tick: data.tickNumber,
				ts: new Date(data.timestamp).toISOString(),
				msg: "✅ TICK ACCEPTED & REGISTERED",
			},
			"TickTack Function Execution",
		);
	}
}
