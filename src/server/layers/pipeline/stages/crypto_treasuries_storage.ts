import { clickhouse } from "../../../../storage/clickhouse";
import { logger } from "../../../utils/logger";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

interface TreasuryRecord {
	company_name: string;
	ticker: string;
	coin: string;
	holdings: number;
	latest_acquisitions: number | string;
	cost_basis: number | string;
	data_as_of: string;
}

export class CryptoTreasuriesStorageStage extends PipelineStage<
	TreasuryRecord[],
	TreasuryRecord[]
> {
	id = "crypto-treasuries-storage";
	description = "Stores crypto treasury holdings to ClickHouse on changes";
	inputs = ["crypto-treasuries-source"];
	output = "crypto-treasuries-stored";

	// Track last known holdings to detect changes
	private lastHoldings = new Map<string, number>();

	public async process(
		data: TreasuryRecord[],
		context: ProcessingContext,
	): Promise<TreasuryRecord[] | null> {
		if (context.topic !== "crypto-treasuries-source") return null;
		if (!Array.isArray(data)) return null;

		const changedRecords: any[] = [];

		for (const record of data) {
			const key = `${record.ticker}-${record.coin}`;
			const currentHoldings = record.holdings;
			const previousHoldings = this.lastHoldings.get(key);

			// Detect change
			if (
				previousHoldings === undefined ||
				previousHoldings !== currentHoldings
			) {
				const change =
					previousHoldings !== undefined
						? currentHoldings - previousHoldings
						: 0;

				changedRecords.push({
					company_name: record.company_name,
					ticker: record.ticker,
					coin: record.coin,
					holdings: currentHoldings,
					holdings_change: change,
					latest_acquisitions:
						typeof record.latest_acquisitions === "number"
							? record.latest_acquisitions
							: 0,
					cost_basis:
						typeof record.cost_basis === "number" ? record.cost_basis : 0,
					data_as_of: record.data_as_of !== "--" ? record.data_as_of : null,
					timestamp: Math.floor(Date.now() / 1000),
				});

				// Update cache
				this.lastHoldings.set(key, currentHoldings);
			}
		}

		if (changedRecords.length > 0) {
			try {
				await clickhouse.insert({
					table: "crypto_treasuries",
					values: changedRecords,
					format: "JSONEachRow",
				});
				logger.info(
					{ count: changedRecords.length },
					"Stored crypto treasury changes",
				);
			} catch (err) {
				logger.error({ err }, "Failed to store crypto treasuries");
			}
		}

		return data;
	}
}
