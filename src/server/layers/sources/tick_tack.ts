import { logger } from "../../utils/logger";
import type { AggregatorLayer } from "../aggregator";
import type { SourceConfig } from "./base";
import { BaseSource } from "./base";

interface TickTackSourceConfig extends SourceConfig {
	intervalMs?: number; // For demo purposes, maybe faster than 1 min? No, user asked for 1 min.
}

export class TickTackSource extends BaseSource {
	private timer: Timer | null = null;
	private tickCounter = 0;

	constructor(
		config: Omit<TickTackSourceConfig, "id" | "name" | "description"> &
			Partial<SourceConfig>,
		aggregator: AggregatorLayer,
	) {
		super(
			{
				id: "tick-tack-source",
				name: "Tick Tack Demo",
				description: "Emits a persistent tick number every minute",
				...config,
			},
			aggregator,
		);
	}

	public async connect(): Promise<void> {
		logger.info({ source: this.id }, "Starting TickTack Source...");

		// Align to the next minute start for "00 seconds" requirement
		const now = new Date();
		const msUntilNextMinute =
			(60 - now.getSeconds()) * 1000 - now.getMilliseconds();

		// First timeout to align
		this.timer = setTimeout(() => {
			this.emitTick();
			// Then interval every 60s
			this.timer = setInterval(() => {
				this.emitTick();
			}, 60000);
		}, msUntilNextMinute);
	}

	private emitTick() {
		this.tickCounter++;
		const payload = {
			tickNumber: this.tickCounter,
			timestamp: Date.now(),
			message: `Tick #${this.tickCounter}`,
		};

		this.emit(payload);
	}

	public disconnect(): void {
		if (this.timer) {
			clearInterval(this.timer); // works for both timeout and interval in JS generally, but better be safe if typed strictly
			clearTimeout(this.timer);
			this.timer = null;
		}
	}
}
