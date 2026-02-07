import { logger } from "@/server/utils/logger";
import { clickhouse } from "@/storage/clickhouse";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

interface CbsNbaGame {
	id: string;
	game_status?: {
		last_play?: {
			description?: string;
			period?: string;
			time_remaining?: string;
		};
		status?: string;
	};
	[key: string]: any;
}

interface CbsNbaPayload {
	games: CbsNbaGame[];
}

export class CbsNbaStorageStage extends PipelineStage<
	CbsNbaPayload,
	{ stored: number }
> {
	id = "cbs-nba-storage";
	description = "Stores CBS NBA Scoreboard updates to ClickHouse";
	inputs = ["cbs-nba-source"];
	output = "cbs-nba-stored";

	public async process(
		data: CbsNbaPayload,
		context: ProcessingContext,
	): Promise<{ stored: number } | null> {
		if (context.topic !== "cbs-nba-source" || !data.games) return null;

		const values: any[] = [];
		const now = Math.floor(Date.now() / 1000);

		for (const game of data.games) {
			if (!game.id) continue;

			const lastPlay = game.game_status?.last_play || {};

			values.push({
				game_id: game.id,
				period: lastPlay.period || "",
				time_remaining: lastPlay.time_remaining || "",
				description: lastPlay.description || "",
				raw_data: JSON.stringify(game),
				timestamp: now, // We use ingestion time as event time if not provided in game object
				ingested_at: now,
			});
		}

		if (values.length === 0) return null;

		try {
			await clickhouse.insert({
				table: "cbs_nba_games",
				values: values,
				format: "JSONEachRow",
			});

			return { stored: values.length };
		} catch (err) {
			logger.error({ err }, "Failed to store CBS NBA data");
			return null;
		}
	}
}
