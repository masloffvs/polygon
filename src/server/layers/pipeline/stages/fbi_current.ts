import type { FBINotice } from "@/server/adapters/fbi";
import { logger } from "@/server/utils/logger";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

interface FBIBatch {
	type: "fbi_batch";
	notices: FBINotice[];
	timestamp: number;
}

interface FBIOutput {
	fbi: FBINotice[];
	timestamp: number;
}

/**
 * Processes FBI Wanted notices
 */
export class FBICurrentStage extends PipelineStage<FBIBatch, FBIOutput> {
	id = "fbi-current";
	description = "Processes FBI Wanted notices";
	inputs = ["fbi-source"];
	output = "fbi-active";

	public async process(
		data: FBIBatch,
		context: ProcessingContext,
	): Promise<FBIOutput | null> {
		if (context.topic !== "fbi-source" || data.type !== "fbi_batch") {
			return null;
		}

		logger.info(
			{ stage: this.id, count: data.notices.length },
			"Processed FBI notices",
		);

		return {
			fbi: data.notices,
			timestamp: data.timestamp,
		};
	}
}
