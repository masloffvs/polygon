import { logger } from "@/server/utils/logger";
import { clickhouse } from "@/storage/clickhouse";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

interface MassiveMarketStatusData {
	afterHours: boolean;
	earlyHours: boolean;
	market: string;
	serverTime: string;
	currencies: {
		crypto: string;
		fx: string;
	};
	exchanges: {
		nasdaq: string;
		nyse: string;
		otc: string;
	};
	indicesGroups: Record<string, string>;
}

interface MassiveMarketStatusEvent {
	type: "massive_market_status";
	data: MassiveMarketStatusData;
	fetchedAt: number;
}

export class MassiveMarketStatusStorageStage extends PipelineStage<
	MassiveMarketStatusEvent,
	{ stored: boolean }
> {
	id = "massive-market-status-storage";
	description = "Stores Massive Market Status history to ClickHouse";
	inputs = ["massive-market-status-source"];
	output = "massive-market-status-stored";

	public async process(
		event: MassiveMarketStatusEvent,
		context: ProcessingContext,
	): Promise<{ stored: boolean } | null> {
		if (context.topic !== "massive-market-status-source") return null;
		if (event.type !== "massive_market_status") return null;

		const data = event.data;
		if (!data) return null;

		try {
			const serverTimeDate = new Date(data.serverTime);

			const row = {
				timestamp: Math.floor(serverTimeDate.getTime() / 1000), // DateTime uses seconds
				market: data.market,
				crypto_status: data.currencies?.crypto || "unknown",
				fx_status: data.currencies?.fx || "unknown",
				nasdaq_status: data.exchanges?.nasdaq || "unknown",
				nyse_status: data.exchanges?.nyse || "unknown",
				otc_status: data.exchanges?.otc || "unknown",
				server_time: serverTimeDate.toISOString(), // Store original string if needed or ISO
				ingested_at: Math.floor(Date.now() / 1000),
			};

			await clickhouse.insert({
				table: "massive_market_status_events",
				values: [row],
				format: "JSONEachRow",
			});

			logger.info("Stored Massive Market Status data");

			return { stored: true };
		} catch (err) {
			logger.error({ err }, "Failed to store Massive Market Status data");
			return null;
		}
	}
}
