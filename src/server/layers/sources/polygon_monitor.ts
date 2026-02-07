import {
	createPublicClient,
	formatUnits,
	type Log,
	type PublicClient,
	parseAbi,
	webSocket,
} from "viem";
import { polygon } from "viem/chains";
import { logger } from "../../utils/logger";
import type { AggregatorLayer } from "../aggregator";
import type { SourceConfig } from "./base";
import { BaseSource } from "./base";

export interface MonitoredAddress {
	address: `0x${string}`;
	label: string;
	type: "whale" | "contract" | "relayer";
}

export interface PolygonMonitorConfig extends SourceConfig {
	rpcUrl?: string;
	addresses: MonitoredAddress[];
	tokens?: { symbol: string; address: `0x${string}`; decimals: number }[];
}

export interface PolygonTransferEvent {
	source: string; // "polygon-monitor-source"
	type: "transfer";
	hash: string;
	from: string;
	to: string;
	value: number;
	symbol: string;
	timestamp: number;
	labels: {
		from?: string;
		to?: string;
	};
	relayer?: string; // Address/Label of the tx sender if it matches a monitored relayer
}

const DEFAULT_TOKENS = [
	{
		symbol: "USDC.e",
		address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" as `0x${string}`,
		decimals: 6,
	},
	{
		symbol: "USDC", // Native
		address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as `0x${string}`,
		decimals: 6,
	},
	{
		symbol: "WETH",
		address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619" as `0x${string}`,
		decimals: 18,
	},
];

export class PolygonMonitorSource extends BaseSource {
	private client: PublicClient | null = null;
	private rpcUrl: string;
	private watchedAddresses: MonitoredAddress[];
	private watchedTokens: {
		symbol: string;
		address: `0x${string}`;
		decimals: number;
	}[];
	private unwatchList: (() => void)[] = [];

	constructor(
		config: Omit<PolygonMonitorConfig, "id" | "name" | "description"> &
			Partial<SourceConfig>,
		aggregator: AggregatorLayer,
	) {
		super(
			{
				id: "polygon-monitor-source",
				name: "Polygon Topology Monitor",
				description: "Monitors flows between specific Polygon addresses",
				...config,
			},
			aggregator,
		);
		this.rpcUrl = config.rpcUrl || "wss://polygon.drpc.org";
		this.watchedAddresses = config.addresses;
		this.watchedTokens = config.tokens || DEFAULT_TOKENS;
	}

	public async addMonitoredAddress(addr: MonitoredAddress) {
		if (
			this.watchedAddresses.find(
				(a) => a.address.toLowerCase() === addr.address.toLowerCase(),
			)
		) {
			return; // Already watching
		}

		this.watchedAddresses.push(addr);

		if (this.client) {
			// Dynamic registration
			const transferEvent = parseAbi([
				"event Transfer(address indexed from, address indexed to, uint256 value)",
			]);

			for (const token of this.watchedTokens) {
				// Watch INCOMING
				this.unwatchList.push(
					this.client.watchContractEvent({
						address: token.address,
						abi: transferEvent,
						eventName: "Transfer",
						args: { to: addr.address },
						onLogs: (logs) => this.handleLogs(logs, token),
					}),
				);
				// Watch OUTGOING
				this.unwatchList.push(
					this.client.watchContractEvent({
						address: token.address,
						abi: transferEvent,
						eventName: "Transfer",
						args: { from: addr.address },
						onLogs: (logs) => this.handleLogs(logs, token),
					}),
				);
			}
			logger.info(
				{ source: this.id, address: addr.address },
				"Dynamically added new monitored address",
			);
		}
	}

	public async connect(): Promise<void> {
		logger.info(
			{ source: this.id, rpc: this.rpcUrl },
			"Connecting to Polygon...",
		);

		try {
			this.client = createPublicClient({
				chain: polygon,
				transport: webSocket(this.rpcUrl),
			});

			// Start watching
			this.setupWatchers();

			logger.info({ source: this.id }, "Polygon connection established");
		} catch (err) {
			logger.error({ source: this.id, err }, "Failed to connect to Polygon");
			setTimeout(() => this.connect(), 5000);
		}
	}

	private setupWatchers() {
		if (!this.client) return;

		// We want to watch Transfers of specific tokens WHERE from OR to is in our watchedAddresses list
		// viem's watchContractEvent allows filtering by args, but OR logic across args usually requires multiple watchers or a broad watcher + filtering.
		// Efficient way: Watch the TOKEN contract events globally (or filtered by one side if possible) and filter in callback?
		// Or setup 2 watchers per token per address (From X, To X).

		// Given the small number of addresses (3) and tokens (3), 3*3*2 = 18 watchers is fine.
		// Or better: watch the Token Contract for ALL transfers, and filter in memory?
		// USDC on Polygon has massive volume, so we should rely on RPC filtering.

		const transferEvent = parseAbi([
			"event Transfer(address indexed from, address indexed to, uint256 value)",
		]);

		for (const token of this.watchedTokens) {
			for (const target of this.watchedAddresses) {
				// Watch INCOMING (To)
				this.unwatchList.push(
					this.client.watchContractEvent({
						address: token.address,
						abi: transferEvent,
						eventName: "Transfer",
						args: {
							to: target.address,
						},
						onLogs: (logs) => this.handleLogs(logs, token),
					}),
				);

				// Watch OUTGOING (From)
				this.unwatchList.push(
					this.client.watchContractEvent({
						address: token.address,
						abi: transferEvent,
						eventName: "Transfer",
						args: {
							from: target.address,
						},
						onLogs: (logs) => this.handleLogs(logs, token),
					}),
				);
			}
		}

		logger.info(
			{ source: this.id, count: this.unwatchList.length },
			"Event watchers registered",
		);
	}

	private async handleLogs(
		logs: Log[],
		token: { symbol: string; decimals: number },
	) {
		for (const log of logs) {
			try {
				const { from, to, value } = (log as any).args;
				if (!from || !to || !value) continue;

				// Identify labels
				const fromLabel = this.watchedAddresses.find(
					(a) => a.address.toLowerCase() === from.toLowerCase(),
				)?.label;
				const toLabel = this.watchedAddresses.find(
					(a) => a.address.toLowerCase() === to.toLowerCase(),
				)?.label;

				let relayerLabel: string | undefined;

				// 1. Fetch Transaction to identify Relayer/Sender
				try {
					// Note: fetching full tx for every event might be heavy if volume is huge.
					// But since we only watch filtered events involving our targets, it should be fine.
					const tx = await this.client?.getTransaction({
						hash: log.transactionHash!,
					});

					if (tx) {
						// Check if tx.from matches any watched address that is of type 'relayer'
						const relayerNode = this.watchedAddresses.find(
							(a) =>
								a.type === "relayer" &&
								a.address.toLowerCase() === tx.from.toLowerCase(),
						);
						if (relayerNode) {
							relayerLabel = relayerNode.label;
						}
					}
				} catch (_e) {
					// ignore error fetching tx
				}

				// Add to our stream
				const event: PolygonTransferEvent = {
					source: this.id,
					type: "transfer",
					hash: log.transactionHash!,
					from,
					to,
					value: parseFloat(formatUnits(value, token.decimals)),
					symbol: token.symbol,
					timestamp: Date.now(),
					labels: {
						from: fromLabel,
						to: toLabel,
					},
					relayer: relayerLabel,
				};

				this.emit(event);
			} catch (err) {
				logger.error({ source: this.id, err }, "Error processing log");
			}
		}
	}

	public disconnect(): void {
		this.unwatchList.forEach((unwatch) => unwatch());
		this.unwatchList = [];
		this.client = null;
	}
}
