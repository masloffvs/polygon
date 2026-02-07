import { logger } from "@/server/utils/logger";
import { clickhouse } from "@/storage/clickhouse";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

interface SolanaPayload {
	source: string;
	timestamp: number;
	address: string;
	slot: number;
	lamports: number;
	owner: string;
	executable: boolean;
	rentEpoch: number;
	data_base64: string;
}

export class SolanaStorageStage extends PipelineStage<
	SolanaPayload,
	SolanaPayload
> {
	id = "solana-storage";
	description = "Stores Solana account updates to ClickHouse";
	inputs: string[] = [];
	output = "solana-stored";

	constructor(sourceIds: string[]) {
		super();
		this.inputs = sourceIds;
	}

	public async process(
		data: SolanaPayload,
		_context: ProcessingContext,
	): Promise<SolanaPayload | null> {
		try {
			await clickhouse.insert({
				table: "solana_account_updates",
				values: [data],
				format: "JSONEachRow",
			});
			return data;
		} catch (err) {
			logger.error({ err, stage: this.id }, "Failed to insert into ClickHouse");
			return null;
		}
	}
}
