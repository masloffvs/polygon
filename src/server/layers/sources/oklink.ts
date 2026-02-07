// src/server/layers/sources/oklink.ts
import { OKLinkClient } from "../../integrations/oklink/client";
import { configManager } from "../../services/config_manager";
import { logger } from "../../utils/logger";
import { BaseSource } from "./base";

export class OKLinkSource extends BaseSource {
	private client: OKLinkClient | null = null;
	private intervalId: ReturnType<typeof setInterval> | null = null;

	public async connect(): Promise<void> {
		const sysConfig = configManager.getConfig();
		const okConfig = sysConfig.oklink;

		if (!okConfig.enabled) {
			logger.info({ source: this.id }, "OKLink Source disabled in config");
			return;
		}

		this.client = new OKLinkClient(okConfig.api_key);
		logger.info({ source: this.id }, "OKLink Source initialized");

		this.startPolling(okConfig.interval_ms);
	}

	public async disconnect(): Promise<void> {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}

	private startPolling(intervalMs: number) {
		// Run immediately
		this.poll();

		this.intervalId = setInterval(() => {
			this.poll();
		}, intervalMs);
	}

	private async poll() {
		const sysConfig = await configManager.load(); // Refresh config
		const addresses = sysConfig.oklink.addresses;

		if (addresses.length === 0) return;

		// Process sequentially to be nice to the API (or parallel if needed)
		for (const addr of addresses) {
			try {
				const response = await this.client?.fetchNFTTransfers(
					addr.chain,
					addr.address,
					{ limit: 20 }, // Fetch recent 20
				);

				if (response.code !== 0) {
					logger.warn(
						{
							msg: response.msg,
							detail: response.detailMsg,
							alias: addr.alias,
						},
						"OKLink API returned error",
					);
					continue;
				}

				const transfers = response.data.hits || [];

				// Emit Data
				// We emit a list of transfers. The pipeline loop should handle deduplication.
				if (transfers.length > 0) {
					const emitter = this.aggregator.getEmitter(this.id);
					if (emitter) {
						emitter.emit("nft_transfer_batch", {
							type: "nft_transfer_batch",
							chain: addr.chain,
							alias: addr.alias,
							address: addr.address,
							transfers,
							timestamp: Date.now(),
						});
					}

					logger.info(
						{ alias: addr.alias, count: transfers.length },
						"Fetched NFT transfers",
					);
				}
			} catch (err) {
				logger.error(
					{ err, alias: addr.alias },
					"Failed to poll OKLink address",
				);
			}
		}
	}
}
