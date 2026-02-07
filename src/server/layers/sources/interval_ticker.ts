import { logger } from "../../utils/logger";
import type { AggregatorLayer } from "../aggregator";
import type { SourceConfig } from "./base";
import { BaseSource } from "./base";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface PhasedTickEvent {
	type: "phased-tick";
	windowStart: number; // 15-min window start timestamp
	phase: 1 | 2 | 3; // Which 5-min phase within the window
	phaseStart: number; // This phase's start timestamp
	isWindowOpen: boolean; // true only for phase 1 (capture open price)
	isDeadline: boolean; // true only for phase 3 (must predict)
}

// ═══════════════════════════════════════════════════════════════════════════
// SOURCE
// ═══════════════════════════════════════════════════════════════════════════

export class IntervalTickerSource extends BaseSource {
	private timer: Timer | null = null;
	private readonly PHASE_MS = 5 * 60 * 1000; // 5 minutes per phase
	private readonly WINDOW_MS = 15 * 60 * 1000; // 15 minutes per window

	constructor(
		config: Omit<SourceConfig, "id" | "name" | "description"> &
			Partial<SourceConfig>,
		aggregator: AggregatorLayer,
	) {
		super(
			{
				id: "interval-ticker-source",
				name: "Phased Interval Ticker",
				description:
					"Emits phased signals every 5 minutes within 15-min windows",
				...config,
			},
			aggregator,
		);
	}

	public async connect(): Promise<void> {
		logger.info({ source: this.id }, "Starting Phased Interval Ticker...");
		this.scheduleNextTick();
	}

	private scheduleNextTick() {
		const now = new Date();
		const minutes = now.getMinutes();
		const seconds = now.getSeconds();
		const ms = now.getMilliseconds();

		// Calculate next 5 min mark (0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55)
		const nextSlotIdx = Math.floor(minutes / 5) + 1;
		const nextMinutes = nextSlotIdx * 5;

		// Calculate delay
		const targetMsOfHour = nextMinutes * 60 * 1000;
		const currentMsOfHour = minutes * 60 * 1000 + seconds * 1000 + ms;

		let delayMs = targetMsOfHour - currentMsOfHour;
		if (delayMs <= 0) delayMs += 5 * 60 * 1000;

		logger.debug(
			{ source: this.id, delaySeconds: Math.floor(delayMs / 1000) },
			"Next 5m tick scheduled",
		);

		this.timer = setTimeout(() => {
			this.emitTick();
			this.scheduleNextTick();
		}, delayMs);
	}

	private emitTick() {
		const now = Date.now();

		// Calculate which 15-min window we're in
		const windowStart = Math.floor(now / this.WINDOW_MS) * this.WINDOW_MS;

		// Calculate which phase within the window (1, 2, or 3)
		const elapsedInWindow = now - windowStart;
		const phase = (Math.floor(elapsedInWindow / this.PHASE_MS) + 1) as
			| 1
			| 2
			| 3;

		// Phase start timestamp
		const phaseStart = windowStart + (phase - 1) * this.PHASE_MS;

		const event: PhasedTickEvent = {
			type: "phased-tick",
			windowStart,
			phase,
			phaseStart,
			isWindowOpen: phase === 1,
			isDeadline: phase === 3,
		};

		logger.info(
			{
				source: this.id,
				phase,
				windowStart: new Date(windowStart).toISOString(),
				isDeadline: event.isDeadline,
			},
			`Phased tick: Phase ${phase}/3`,
		);

		this.emit(event);
	}

	public disconnect(): void {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
	}
}
