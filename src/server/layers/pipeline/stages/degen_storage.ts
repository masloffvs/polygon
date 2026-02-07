import { logger } from "@/server/utils/logger";
import { clickhouse } from "@/storage/clickhouse";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";
import type { DegenEvent } from "./degen_analysis";

export class DegenStorageStage extends PipelineStage<
	DegenEvent,
	{ stored: boolean }
> {
	id = "degen-storage";
	description = "Stores significant degen trades to ClickHouse";
	inputs = ["degen-analysis"];
	output = "degen-processed";

	public async process(
		event: DegenEvent,
		context: ProcessingContext,
	): Promise<{ stored: boolean } | null> {
		if (context.topic !== "degen-analysis") return null;

		const trade = event.whaleTrade || event.trade;
		if (!trade) return null;

		try {
			const row = {
				tx_hash: trade.transactionHash,
				timestamp: Math.floor(trade.timestamp / 1000), // Ensure seconds
				asset_id: trade.asset,
				title: trade.title,
				outcome: trade.outcome,
				side: trade.side,
				price: trade.price,
				size: trade.size,
				value_usd: trade.size * trade.price,
				wallet: trade.proxyWallet,
				degen_type: event.degenType,
				rule_triggered:
					event.degenType === "micro"
						? "price<=0.01,val>=15"
						: "price<=0.1,val>=50",
				ingested_at: Math.floor(Date.now() / 1000),
			};

			await clickhouse.insert({
				table: "degen_trades",
				values: [row],
				format: "JSONEachRow",
			});

			logger.info(
				{
					type: event.degenType,
					value: row.value_usd,
					price: row.price,
				},
				"Stored Degen Trade",
			);

			return { stored: true };
		} catch (err) {
			logger.error({ err }, "Failed to store Degen trade");
			return null;
		}
	}
}
