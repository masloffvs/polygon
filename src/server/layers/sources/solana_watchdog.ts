import { Connection, PublicKey } from "@solana/web3.js";
import { logger } from "../../utils/logger";
import type { AggregatorLayer } from "../aggregator";
import type { SourceConfig } from "./base";
import { BaseSource } from "./base";

export interface SolanaWatchdogConfig extends SourceConfig {
	address: string;
	rpcUrl: string;
	commitment: "processed" | "confirmed" | "finalized";
}

export class SolanaWatchdogSource extends BaseSource {
	private static connections: Map<string, Connection> = new Map();
	private connection: Connection | null = null;
	private subscriptionId: number | null = null;

	constructor(
		config: Omit<SolanaWatchdogConfig, "id" | "description"> &
			Partial<SourceConfig>,
		aggregator: AggregatorLayer,
	) {
		// Generate an ID if not provided, though typically we construct it in application.ts
		const sanitizedName = (config.name || "unknown")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "");
		const id = config.id || `solana-watchdog-${sanitizedName}`;
		super(
			{
				id,
				description: `Monitors Solana address ${config.address}`,
				...config,
			},
			aggregator,
		);
	}

	public get solanaConfig(): SolanaWatchdogConfig {
		return this.config as SolanaWatchdogConfig;
	}

	public async connect(): Promise<void> {
		const { rpcUrl, commitment, address } = this.solanaConfig;
		const connectionKey = `${rpcUrl}|${commitment}`;

		logger.info(
			{ source: this.id, address },
			"Connecting to Solana Watchdog...",
		);

		try {
			if (!SolanaWatchdogSource.connections.has(connectionKey)) {
				logger.info(
					{ key: connectionKey },
					"Initializing new Shared Solana Connection",
				);
				SolanaWatchdogSource.connections.set(
					connectionKey,
					new Connection(rpcUrl, commitment),
				);
			}
			this.connection = SolanaWatchdogSource.connections.get(connectionKey)!;

			const publicKey = new PublicKey(address);

			this.subscriptionId = this.connection.onAccountChange(
				publicKey,
				(accountInfo, context) => {
					const payload = {
						source: this.id,
						timestamp: Date.now(),
						address: address,
						slot: context.slot,
						lamports: accountInfo.lamports,
						owner: accountInfo.owner.toBase58(),
						executable: accountInfo.executable,
						rentEpoch: accountInfo.rentEpoch,
						data_base64: accountInfo.data.toString("base64"),
					};
					this.emit(payload);
				},
				{ commitment },
			);

			logger.info({ source: this.id }, "Solana Watchdog connected");
		} catch (err) {
			logger.error(
				{ source: this.id, err },
				"Failed to connect Solana Watchdog",
			);
			// Basic retry
			setTimeout(() => this.connect(), 10000);
		}
	}

	public disconnect(): void {
		if (this.connection && this.subscriptionId !== null) {
			this.connection
				.removeAccountChangeListener(this.subscriptionId)
				.catch((err) => {
					logger.warn({ source: this.id, err }, "Error removing listener");
				});
			this.subscriptionId = null;
			this.connection = null;
		}
	}
}
