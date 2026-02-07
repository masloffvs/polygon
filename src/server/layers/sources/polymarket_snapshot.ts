// src/server/layers/sources/polymarket_snapshot.ts
import { clickhouse } from "@/storage/clickhouse";
import { logger } from "../../utils/logger";
import type { AggregatorLayer } from "../aggregator";
import type { SourceConfig } from "./base";
import { BaseSource } from "./base";

export interface ActivityItem {
	transactionHash: string;
	timestamp: string;
	side: "BUY" | "SELL";
	asset: string;
	title: string;
	size: number;
	price: number;
	usdcValue: number;
	proxyWallet: string;
	outcome: string;
	eventSlug: string;
}

interface PolymarketSnapshotConfig extends SourceConfig {
	intervalMs?: number;
	limit?: number;
}

export class PolymarketSnapshotSource extends BaseSource {
	private intervalId: Timer | null = null;
	private readonly intervalMs: number;
	private readonly limit: number;

	constructor(
		config: Omit<PolymarketSnapshotConfig, "id" | "name" | "description"> &
			Partial<SourceConfig>,
		aggregator: AggregatorLayer,
	) {
		super(
			{
				id: "polymarket-snapshot-source",
				name: "Polymarket Snapshot",
				description:
					"Periodically queries ClickHouse for recent Polymarket activity",
				...config,
			},
			aggregator,
		);

		this.intervalMs = config.intervalMs ?? 500; // Default: 2 updates per second
		this.limit = config.limit ?? 300;
	}

	public async connect(): Promise<void> {
		logger.info(
			{ source: this.id, intervalMs: this.intervalMs, limit: this.limit },
			"Starting Polymarket Snapshot Source",
		);

		// Initial fetch
		await this.fetchAndEmit();

		// Periodic polling
		this.intervalId = setInterval(async () => {
			await this.fetchAndEmit();
		}, this.intervalMs);
	}

	private async fetchAndEmit(): Promise<void> {
		try {
			const result = await clickhouse.query({
				query: `
          SELECT 
            transactionHash,
            formatDateTime(timestamp, '%Y-%m-%dT%H:%M:%S', 'UTC') as timestamp,
            side,
            asset,
            title,
            size,
            price,
            usdcValue,
            proxyWallet,
            outcome,
            eventSlug
          FROM polymarket_activity
          ORDER BY timestamp DESC
          LIMIT {limit:Int32}
        `,
				query_params: { limit: this.limit },
				format: "JSONEachRow",
			});

			const data = (await result.json()) as ActivityItem[];

			// Emit the snapshot
			this.emit(data);
		} catch (err) {
			logger.error(
				{ source: this.id, err },
				"Failed to fetch snapshot from ClickHouse",
			);
		}
	}

	public disconnect(): void {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
		logger.info({ source: this.id }, "Polymarket Snapshot Source stopped");
	}
}
