import type { AggregatorLayer } from "../layers/aggregator";
import { ObservableCard } from "./base";

interface TreasuryHolding {
	company_name: string;
	ticker: string;
	coin: string;
	holdings: number;
	latest_acquisitions: number | string;
	cost_basis: number | string;
	data_as_of: string;
}

interface TreasuriesCardState {
	holdings: TreasuryHolding[];
	totalBtcHoldings: number;
	lastUpdate: number;
}

export class CryptoTreasuriesCard extends ObservableCard<
	any,
	TreasuriesCardState
> {
	constructor(aggregator: AggregatorLayer) {
		super(
			{
				id: "crypto-treasuries-card",
				title: "Corporate Treasuries",
				description: "BTC/ETH holdings by public companies",
				type: "list",
				inputs: ["crypto-treasuries-source"],
			},
			{
				holdings: [],
				totalBtcHoldings: 0,
				lastUpdate: Date.now(),
			},
			aggregator,
		);
	}

	public process(data: any, topic: string): void {
		if (topic !== "crypto-treasuries-source") return;
		if (!Array.isArray(data)) return;

		// Filter to BTC holdings only and sort by holdings descending
		const btcHoldings = data
			.filter((item: any) => item.coin === "BTC")
			.sort((a: any, b: any) => b.holdings - a.holdings)
			.slice(0, 20)
			.map((item: any) => ({
				company_name: item.company_name,
				ticker: item.ticker,
				coin: item.coin,
				holdings: item.holdings,
				latest_acquisitions: item.latest_acquisitions,
				cost_basis: item.cost_basis,
				data_as_of: item.data_as_of,
			}));

		const totalBtc = btcHoldings.reduce(
			(sum: number, h: TreasuryHolding) => sum + h.holdings,
			0,
		);

		this.snapshot.holdings = btcHoldings;
		this.snapshot.totalBtcHoldings = totalBtc;
		this.snapshot.lastUpdate = Date.now();
	}
}
