import {
	createPublicClient,
	type PublicClient,
	parseAbi,
	webSocket,
} from "viem";
import { mainnet } from "viem/chains";
import { logger } from "../../utils/logger";
import type { AggregatorLayer } from "../aggregator";
import type { SourceConfig } from "./base";
import { BaseSource } from "./base";

export interface TokenConfig {
	symbol: string;
	address: `0x${string}`;
	decimals: number;
}

export interface EthereumWhaleConfig extends SourceConfig {
	rpcUrl: string;
	tokens: TokenConfig[];
	minValueUsd?: number; // Filter at source level
}

export interface WhaleTransfer {
	transactionHash: string;
	blockNumber: string;
	from: string;
	to: string;
	value: number;
	symbol: string;
	tokenAddress: string;
	timestamp: number;
}

export class EthereumWhaleSource extends BaseSource {
	private client: PublicClient | null = null;
	private unwatchList: (() => void)[] = [];
	private rpcUrl: string;
	private tokens: TokenConfig[];
	private minValueUsd: number;

	constructor(
		config: Omit<EthereumWhaleConfig, "id" | "name" | "description"> &
			Partial<SourceConfig>,
		aggregator: AggregatorLayer,
	) {
		super(
			{
				id: "ethereum-whale-source",
				name: "Ethereum Whale Watch",
				description: "Monitors large ERC20 transfers on Ethereum",
				...config,
			},
			aggregator,
		);
		this.rpcUrl = config.rpcUrl || "wss://ethereum-rpc.publicnode.com";
		this.tokens = config.tokens;
		this.minValueUsd = config.minValueUsd || 50000;
	}

	public async connect(): Promise<void> {
		logger.info(
			{ source: this.id, rpc: this.rpcUrl },
			"Connecting to Ethereum...",
		);

		try {
			this.client = createPublicClient({
				chain: mainnet,
				transport: webSocket(this.rpcUrl),
			});

			for (const token of this.tokens) {
				this.watchToken(token);
			}

			logger.info({ source: this.id }, "Ethereum connection established");
		} catch (err) {
			logger.error({ source: this.id, err }, "Failed to connect to Ethereum");
			setTimeout(() => this.connect(), 5000);
		}
	}

	private watchToken(token: TokenConfig) {
		if (!this.client) return;

		logger.info({ source: this.id, token: token.symbol }, "Watching token");

		const unwatch = this.client.watchContractEvent({
			address: token.address,
			abi: parseAbi([
				"event Transfer(address indexed from, address indexed to, uint256 value)",
			]),
			eventName: "Transfer",
			onLogs: (logs) => {
				const now = Date.now();
				for (const log of logs) {
					try {
						const rawValue = log.args.value;
						if (rawValue === undefined) continue;

						const multiplier = 10 ** token.decimals;
						const value = Number(rawValue) / multiplier;

						// Source Level Filter: < 50k
						if (value < this.minValueUsd) continue;

						const transfer: WhaleTransfer = {
							transactionHash: log.transactionHash,
							blockNumber: log.blockNumber.toString(),
							from: log.args.from!,
							to: log.args.to!,
							value: value,
							symbol: token.symbol,
							tokenAddress: token.address,
							timestamp: now,
						};

						this.emit(transfer);
					} catch (err) {
						logger.error(
							{ source: this.id, err },
							"Error processing transfer log",
						);
					}
				}
			},
			onError: (err) => {
				logger.error(
					{ source: this.id, token: token.symbol, err },
					"Watch error",
				);
			},
		});

		this.unwatchList.push(unwatch);
	}

	public disconnect(): void {
		logger.info({ source: this.id }, "Disconnecting Ethereum source");
		this.unwatchList.forEach((unwatch) => unwatch());
		this.unwatchList = [];
		this.client = null;
	}
}
