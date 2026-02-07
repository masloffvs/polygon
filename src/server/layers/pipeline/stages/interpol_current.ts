import type { InterpolNotice } from "@/server/adapters/interpol";
import { logger } from "@/server/utils/logger";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

interface InterpolBatch {
	type: "interpol_batch";
	notices: InterpolNotice[];
	timestamp: number;
}

interface InterpolProcessedOutput {
	red: InterpolNotice[];
	yellow: InterpolNotice[];
	un: InterpolNotice[];
	total: number;
	timestamp: number;
}

export class InterpolCurrentStage extends PipelineStage<
	InterpolBatch,
	InterpolProcessedOutput
> {
	id = "interpol-current";
	description = "Processes and categorizes Interpol notices";
	inputs = ["interpol-source"];
	output = "interpol-active";

	public async process(
		data: InterpolBatch,
		context: ProcessingContext,
	): Promise<InterpolProcessedOutput | null> {
		if (context.topic !== "interpol-source") return null;
		if (data.type !== "interpol_batch") return null;

		const notices = data.notices || [];

		// Categorize by type
		const red = notices.filter((n) => n.type === "red");
		const yellow = notices.filter((n) => n.type === "yellow");
		const un = notices.filter((n) => n.type === "un");

		logger.info(
			{
				stage: this.id,
				red: red.length,
				yellow: yellow.length,
				un: un.length,
				total: notices.length,
			},
			"Processed Interpol notices",
		);

		return {
			red,
			yellow,
			un,
			total: notices.length,
			timestamp: data.timestamp,
		};
	}
}
