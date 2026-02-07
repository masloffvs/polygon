// src/server/layers/sources/polyscan_ws.ts
import type { RealtimeEvent } from "../../integrations/polymarket/realtime-client";
import {
	createRealtimeClient,
	type PolymarketRealtimeClient,
} from "../../integrations/polymarket/realtime-client";
import { logger } from "../../utils/logger";
import type { AggregatorLayer } from "../aggregator";
import type { SourceConfig } from "./base";
import { BaseSource } from "./base";

interface PolyscanWsSourceConfig extends SourceConfig {
	watchedAddresses?: string[];
	whaleThreshold?: number;
	whaleUsdcThreshold?: number;
}

export class PolyscanWsSource extends BaseSource {
	private client: PolymarketRealtimeClient;

	constructor(
		config: Omit<PolyscanWsSourceConfig, "id" | "name" | "description"> &
			Partial<SourceConfig>,
		aggregator: AggregatorLayer,
	) {
		super(
			{
				id: config.id || "polyscan-ws-source",
				name: config.name || "Polyscan Realtime Source",
				description: config.description || "Reflects Polymarket WebSocket feed",
				...config,
			},
			aggregator,
		);

		const builder = createRealtimeClient()
			.autoReconnect(true)
			.whaleThreshold(config.whaleThreshold || 1000)
			.whaleUsdcThreshold(config.whaleUsdcThreshold || 500);

		if (config.watchedAddresses && config.watchedAddresses.length > 0) {
			config.watchedAddresses.forEach((addr) => builder.watch(addr));
		} else {
			builder.watchAll();
		}

		this.client = builder.build();
	}

	public async connect(): Promise<void> {
		logger.info("Starting Polyscan WebSocket Source...");

		this.client.onAny((event: RealtimeEvent) => {
			// Emit raw envelope to aggregator
			// We filter what we need in the pipeline stage
			this.emit(event);
		});

		this.client.start();
	}

	public disconnect(): void {
		this.client.stop();
	}
}
