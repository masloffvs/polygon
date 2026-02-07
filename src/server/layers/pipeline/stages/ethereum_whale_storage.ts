import { logger } from "@/server/utils/logger";
import { clickhouse } from "@/storage/clickhouse";
import type { WhaleTransfer } from "../../sources/ethereum_whale";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

export class EthereumWhaleStorageStage extends PipelineStage<
	WhaleTransfer,
	{ stored: boolean }
> {
	id = "ethereum-whale-storage";
	description = "Stores Ethereum Whale transfers > $500k to ClickHouse";
	inputs: string[] = ["ethereum-whale-source"];
	output = "ethereum-whale-stored";

	private readonly minStorageValue = 500000;

	constructor(inputTopics?: string[]) {
		super();
		if (inputTopics) {
			this.inputs = inputTopics;
		}
	}

	public async process(
		data: WhaleTransfer,
		context: ProcessingContext,
	): Promise<{ stored: boolean } | null> {
		if (!this.inputs.includes(context.topic)) return null;

		// Filter 2: Only store > 500,000
		if (data.value < this.minStorageValue) {
			return null;
		}

		try {
			await clickhouse.insert({
				table: "ethereum_whales",
				values: [
					{
						transactionHash: data.transactionHash,
						blockNumber: Number(data.blockNumber),
						timestamp: Math.floor(data.timestamp / 1000), // Seconds for DateTime
						from: data.from,
						to: data.to,
						value: data.value,
						symbol: data.symbol,
						tokenAddress: data.tokenAddress,
					},
				],
				format: "JSONEachRow",
			});

			logger.info(
				{ symbol: data.symbol, value: data.value, hash: data.transactionHash },
				"Stored Whale Transfer",
			);

			return { stored: true };
		} catch (err) {
			logger.error({ err }, "Failed to store Ethereum Whale transfer");
			return null;
		}
	}
}
