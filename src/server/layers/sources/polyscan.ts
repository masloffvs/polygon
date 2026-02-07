// src/server/layers/sources/polyscan.ts
import { createPollingClient } from "../../integrations/polymarket/polling-client";
import {
	type Polyscan,
	polyscan,
} from "../../integrations/polymarket/polyscan";
import type { PositionEvent } from "../../integrations/polymarket/types";
import { logger } from "../../utils/logger";
import type { AggregatorLayer } from "../aggregator";
import type { SourceConfig } from "./base";
import { BaseSource } from "./base";

interface PolyscanSourceConfig extends SourceConfig {
	users: string[];
	intervalMs?: number;
}

export class PolyscanSource extends BaseSource {
	private scanner: Polyscan;
	private users: string[];

	constructor(
		config: Omit<PolyscanSourceConfig, "id" | "name" | "description"> &
			Partial<SourceConfig>,
		aggregator: AggregatorLayer,
	) {
		super(
			{
				id: config.id || "polyscan-source",
				name: config.name || "Polyscan Source",
				description: config.description || "Monitors Polymarket positions",
				...config,
			},
			aggregator,
		);

		this.users = config.users;

		const client = createPollingClient()
			.interval(config.intervalMs || 30000)
			.addUsers(this.users);

		this.scanner = polyscan(client);
	}

	public async connect(): Promise<void> {
		logger.info({ users: this.users.length }, "Starting Polyscan Source...");

		this.scanner.onAny((event: PositionEvent) => {
			// Emit logic
			// We probably want to wrap it in a standard envelope or just emit raw
			// The aggregator expects standardized events usually, or we handle raw in pipeline
			// Let's emit raw for now, and have a specialized stage handle it
			logger.debug({ type: event.type, user: event.user }, "Polyscan Event");
			this.emit(event);
		});

		this.scanner.start();
	}

	public disconnect(): void {
		this.scanner.stop();
	}
}
