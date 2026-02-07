import type { AggregatorLayer } from "../layers/aggregator";
import { ObservableCard } from "./base";

interface WhaleTransaction {
	transactionHash: string;
	value: number;
	symbol: string;
	timestamp: number;
	from: string;
	to: string;
}

interface WhaleCardState {
	recentTransactions: WhaleTransaction[];
	lastUpdate: number;
}

export class WhaleMonitorCard extends ObservableCard<
	WhaleTransaction,
	WhaleCardState
> {
	constructor(aggregator: AggregatorLayer, tokens: string[]) {
		// Generate inputs based on tokens [USDT, WETH...] -> [whale-usdt-source, ...]
		const inputs = tokens.map((t) => `whale-${t.toLowerCase()}-source`);

		super(
			{
				id: "whale-monitor-card",
				title: "Live Whale Watch",
				description: "Recent large transactions across ETH tokens",
				type: "list",
				inputs: inputs,
			},
			{
				recentTransactions: [],
				lastUpdate: Date.now(),
			},
			aggregator,
		);
	}

	public process(data: WhaleTransaction, _topic: string): void {
		// Basic validation
		if (!data || !data.transactionHash) return;

		this.snapshot.recentTransactions.unshift(data);

		// Keep last 30
		if (this.snapshot.recentTransactions.length > 30) {
			this.snapshot.recentTransactions.pop();
		}

		this.snapshot.lastUpdate = Date.now();
	}
}
