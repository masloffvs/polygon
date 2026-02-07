import { logger } from "../../../utils/logger";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

export interface GlobalBriefing {
	summary: string;
	highlights: string[];
	massiveEvents: any[]; // Polymarket massive events
	updatedAt: number;
}

export class GlobalMarketBriefStage extends PipelineStage<any, GlobalBriefing> {
	id = "global-market-brief";
	description = "Combines AI News Summary with Massive Polymarket Events";
	inputs = ["news-summary-updates", "polymarket-massive-source"];
	output = "global-briefing";

	private latestSummary: { summary: string; highlights: string[] } | null =
		null;
	private latestMassiveEvents: any[] = [];

	public async process(
		data: any,
		context: ProcessingContext,
	): Promise<GlobalBriefing | null> {
		const topic = context.topic;

		if (topic === "news-summary-updates") {
			this.latestSummary = {
				summary: data.summary,
				highlights: data.highlights,
			};
			logger.info(
				{ stage: this.id },
				"Updated Global Briefing with new AI Summary",
			);
		} else if (topic === "polymarket-massive-source") {
			if (
				data.type === "polymarket_massive_batch" &&
				Array.isArray(data.events)
			) {
				this.latestMassiveEvents = data.events;
				logger.info(
					{ stage: this.id, count: data.events.length },
					"Updated Global Briefing with new Massive Events",
				);
			}
		}

		// Only emit calls if we have at least a summary (events are optional/bonus)
		// Or maybe we emit always if we have parts?
		// Let's emit if we have *something*.
		if (!this.latestSummary && this.latestMassiveEvents.length === 0) {
			return null;
		}

		return {
			summary: this.latestSummary?.summary || "Waiting for news summary...",
			highlights: this.latestSummary?.highlights || [],
			massiveEvents: this.latestMassiveEvents,
			updatedAt: Date.now(),
		};
	}
}
