import { clickhouse } from "@/storage/clickhouse";
import type { RealtimeEvent } from "../../../integrations/polymarket/realtime-client";
import { logger } from "../../../utils/logger";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

export class PolymarketFilteredReflectorStage extends PipelineStage<
	RealtimeEvent,
	RealtimeEvent
> {
	id: string;
	description: string;
	inputs = ["polyscan-ws-source"];
	output: string;

	private threshold: number;
	private tableName: string;

	constructor(
		id: string,
		threshold: number,
		tableName: string,
		outputTopic: string,
	) {
		super();
		this.id = id;
		this.description = `Filters Polymarket activity > $${threshold} and stores to ${tableName}`;
		this.threshold = threshold;
		this.tableName = tableName;
		this.output = outputTopic;
	}

	public async process(
		data: RealtimeEvent,
		context: ProcessingContext,
	): Promise<RealtimeEvent | null> {
		// If not from the right topic, skip
		if (context.topic !== "polyscan-ws-source") return null;

		if (data.type !== "trade" && data.type !== "whale") return null;

		const trade = data.whaleTrade || data.trade;
		if (!trade) return null;

		const usdcValue = trade.size * trade.price;

		// Filter check
		if (usdcValue < this.threshold) {
			return null;
		}

		// Prepare row for ClickHouse
		const row = {
			transactionHash: trade.transactionHash,
			timestamp: trade.timestamp, // Unix timestamp in seconds
			side: trade.side,
			asset: trade.asset,
			title: trade.title,
			size: trade.size,
			price: trade.price,
			usdcValue: usdcValue,
			proxyWallet: trade.proxyWallet,
			outcome: trade.outcome,
			eventSlug: trade.eventSlug,
		};

		try {
			await clickhouse.insert({
				table: this.tableName,
				values: [row],
				format: "JSONEachRow",
			});
			// logger.debug({ tx: trade.transactionHash, table: this.tableName }, "Stored filtered Polymarket activity");

			// Return the data so it propagates to the output topic
			return data;
		} catch (err) {
			logger.error(
				{ err, table: this.tableName },
				"Failed to store filtered Polymarket activity",
			);
			return null;
		}
	}
}
