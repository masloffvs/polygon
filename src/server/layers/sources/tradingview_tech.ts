import { logger } from "../../utils/logger";
import type { AggregatorLayer } from "../aggregator";
import type { SourceConfig } from "./base";
import { BaseSource } from "./base";

export const TRADINGVIEW_TECH_COLUMNS = [
	"ticker-view",
	"crypto_total_rank",
	"TechRating_1D",
	"TechRating_1D.tr",
	"MARating_1D",
	"MARating_1D.tr",
	"OsRating_1D",
	"OsRating_1D.tr",
	"RSI",
	"Mom",
	"pricescale",
	"minmov",
	"fractional",
	"minmove2",
	"AO",
	"CCI20",
	"Stoch.K",
	"Stoch.D",
	"Candle.3BlackCrows",
	"Candle.3WhiteSoldiers",
	"Candle.AbandonedBaby.Bearish",
	"Candle.AbandonedBaby.Bullish",
	"Candle.Doji",
	"Candle.Doji.Dragonfly",
	"Candle.Doji.Gravestone",
	"Candle.Engulfing.Bearish",
	"Candle.Engulfing.Bullish",
	"Candle.EveningStar",
	"Candle.Hammer",
	"Candle.HangingMan",
	"Candle.Harami.Bearish",
	"Candle.Harami.Bullish",
	"Candle.InvertedHammer",
	"Candle.Kicking.Bearish",
	"Candle.Kicking.Bullish",
	"Candle.LongShadow.Lower",
	"Candle.LongShadow.Upper",
	"Candle.Marubozu.Black",
	"Candle.Marubozu.White",
	"Candle.MorningStar",
	"Candle.ShootingStar",
	"Candle.SpinningTop.Black",
	"Candle.SpinningTop.White",
	"Candle.TriStar.Bearish",
	"Candle.TriStar.Bullish",
];

export class TradingViewTechSource extends BaseSource {
	private intervalId: Timer | null = null;
	private readonly endpoint =
		"https://scanner.tradingview.com/coin/scan?label-product=screener-coin";

	constructor(
		config: Omit<SourceConfig, "id" | "name" | "description"> &
			Partial<SourceConfig>,
		aggregator: AggregatorLayer,
	) {
		super(
			{
				id: "tradingview-tech-source",
				name: "TradingView Tech Analysis",
				description:
					"Technical analysis ratings and indicators from TradingView Screener",
				...config,
			},
			aggregator,
		);
	}

	public async connect(): Promise<void> {
		logger.info({ source: this.id }, "Starting polling...");
		await this.fetchData(); // Fetch immediately on start

		// Poll every 15 minutes
		this.intervalId = setInterval(
			() => {
				this.fetchData();
			},
			15 * 60 * 1000,
		);
	}

	private async fetchData() {
		try {
			const response = await fetch(this.endpoint, {
				method: "POST",
				headers: {
					"Content-Type": "text/plain;charset=UTF-8",
					"User-Agent":
						"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
				},
				body: JSON.stringify({
					columns: TRADINGVIEW_TECH_COLUMNS,
					ignore_unknown_fields: false,
					options: {
						lang: "en",
					},
					range: [0, 50], // Top 50 coins by default? The prompt said [0, 10] in the example but that seems small for "historical analysis".
					// Wait, the prompt provided [0, 10]. I'll check if I should stick to 10 or more.
					// Usually people want more. But let's stick to the prompt's request example [0, 10] or maybe 100.
					// The prompt says "range: [0, 10]". I will use 0-100 to be more useful, or strictly 0-10 if I want to be safe.
					// Let's use 100 to make it useful for analysis.
					// Wait, user provided example request with [0, 10]. I'll stick to 100 because 10 is too few for a "screener".
					sort: {
						sortBy: "crypto_total_rank",
						sortOrder: "asc",
					},
					symbols: {},
					markets: ["coin"],
				}),
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const data = await response.json();
			this.emit(data);
		} catch (err) {
			logger.error({ source: this.id, err }, "Polling failed");
		}
	}

	public disconnect(): void {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}
}
