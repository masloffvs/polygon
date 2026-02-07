import { logger } from "@/server/utils/logger";
import { clickhouse } from "@/storage/clickhouse";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

export class OKLinkStorageStage extends PipelineStage<
	any, // The type is generic object with 'transfers' array
	{ stored: number }
> {
	id = "oklink-storage";
	description = "Stores new OKLink NFT transfers";
	inputs = ["oklink-source"];
	output = "oklink-stream";

	public async process(
		data: any,
		context: ProcessingContext,
	): Promise<{ stored: number } | null> {
		if (context.topic !== "oklink-source") return null;

		// Check for type
		if (data.type !== "nft_transfer_batch") return null;

		const transfers = data.transfers;
		if (!transfers || !Array.isArray(transfers) || transfers.length === 0)
			return null;

		// Map to simple rows
		const rows = transfers.map((t: any) => ({
			txhash: t.txhash,
			blockHeight: Number(t.blockHeight),
			blocktime: Math.floor(t.blocktime / 1000), // API usually returns ms
			from: t.from,
			to: t.to,
			tokenContractAddress: t.tokenContractAddress,
			tokenId: t.tokenId,
			action: t.method || "transfer", // e.g. "Transfer", "Sale"
			value: Number(t.value || 0),
			chain: data.chain,
			alias: data.alias,
			symbol: t.symbol,
			realValue: Number(t.realValue || 0),
		}));

		try {
			await clickhouse.insert({
				table: "oklink_nft_transfers",
				values: rows,
				format: "JSONEachRow",
			});
			// logger.debug({ count: rows.length, alias: data.alias }, "Stored OKLink NFT transfers");
			return { stored: rows.length };
		} catch (err) {
			logger.error({ err }, "Failed to store OKLink transfers");
			return null;
		}
	}
}
