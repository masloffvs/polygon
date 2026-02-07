import type { RealtimeEvent } from "../../../integrations/polymarket/realtime-client";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

export interface PolymarketMetric {
	tps: number; // trades per second (approx over last 5s window)
	tpm: number; // trades per minute
	vpm: number; // volume (usdc) per minute
	timestamp: number;
}

export class PolymarketMetricsStage extends PipelineStage<
	RealtimeEvent,
	PolymarketMetric
> {
	id = "polymarket-metrics";
	description = "Calculates realtime trading velocity and volume";
	inputs = ["polyscan-ws-source"];
	output = "polymarket-metrics"; // Topic to emit to

	// History buffer: [timestamp_ms, volume_usdc]
	private history: { ts: number; vol: number }[] = [];

	// Throttle emission to avoid spamming the frontend on every single trade
	private lastEmit = 0;
	private readonly THROTTLE_MS = 500; // Emit max 2 times per second

	public async process(
		data: RealtimeEvent,
		context: ProcessingContext,
	): Promise<PolymarketMetric | null> {
		if (context.topic !== "polyscan-ws-source") return null;

		// We count 'trade' and 'whale' as operations.
		// Usually 'whale' events might be duplicates of 'trade' if logic allows,
		// but in our client usage 'trade' fires, then 'whale' fires too.
		// Let's filter to just 'trade' to avoid double counting ops,
		// as whale is just a highlighted trade.
		if (data.type !== "trade") return null;

		const trade = data.trade;
		if (!trade) return null;

		const now = Date.now();
		const usdcValue = trade.size * trade.price;

		this.history.push({ ts: now, vol: usdcValue });

		// Prune history older than 60 seconds
		const cutoff = now - 60000;

		// Optimization: only slice if we have old data
		if (this.history.length > 0 && this.history[0].ts < cutoff) {
			// Find split index
			const idx = this.history.findIndex((x) => x.ts >= cutoff);
			if (idx !== -1) {
				this.history = this.history.slice(idx);
			}
		}

		// Throttle Output
		if (now - this.lastEmit < this.THROTTLE_MS) {
			return null;
		}
		this.lastEmit = now;

		// Calculate Metrics

		// 1. TPM (Trades Per Minute) = Current size of history (since it's < 60s)
		const tpm = this.history.length;

		// 2. VPM (Volume Per Minute)
		const vpm = this.history.reduce((acc, curr) => acc + curr.vol, 0);

		// 3. TPS (Trades Per Second) - 5 seconds window for smoothness
		const secCutoff = now - 5000;
		const tradesInWindow = this.history.filter((x) => x.ts >= secCutoff).length;
		const tps = tradesInWindow / 5; // Simple avg

		return {
			tps: parseFloat(tps.toFixed(2)),
			tpm: tpm,
			vpm: parseFloat(vpm.toFixed(2)),
			timestamp: now,
		};
	}
}
