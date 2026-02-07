import { logger } from "@/server/utils/logger";
import { clickhouse } from "@/storage/clickhouse";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

interface UsInflationEntry {
	date: string;
	cpi?: number;
	cpi_core?: number;
	cpi_year_over_year?: number;
	pce?: number;
	pce_core?: number;
	pce_spending?: number;
}

interface UsInflationBatch {
	type: "us_inflation_batch";
	dataList: UsInflationEntry[];
	fetchedAt: number;
}

export class UsInflationStorageStage extends PipelineStage<
	UsInflationBatch,
	{ stored: number }
> {
	id = "us-inflation-storage";
	description = "Stores US Inflation data history to ClickHouse";
	inputs = ["us-inflation-source"];
	output = "us-inflation-stored";

	public async process(
		data: UsInflationBatch,
		context: ProcessingContext,
	): Promise<{ stored: number } | null> {
		if (context.topic !== "us-inflation-source") return null;
		if (data.type !== "us_inflation_batch") return null;

		const dataList = data.dataList;
		if (!dataList || !Array.isArray(dataList) || dataList.length === 0) {
			return null;
		}

		try {
			const rows = dataList.map((entry) => ({
				date: entry.date,
				cpi: entry.cpi || null,
				cpi_core: entry.cpi_core || null,
				cpi_yoy: entry.cpi_year_over_year || null,
				pce: entry.pce || null,
				pce_core: entry.pce_core || null,
				pce_spending: entry.pce_spending || null,
				ingested_at: Math.floor(Date.now() / 1000), // DateTime expects seconds or string
			}));

			await clickhouse.insert({
				table: "us_inflation_events",
				values: rows,
				format: "JSONEachRow",
			});

			logger.info({ count: rows.length }, "Stored US Inflation data");

			return { stored: rows.length };
		} catch (err) {
			logger.error({ err }, "Failed to store US Inflation data");
			return null;
		}
	}
}
