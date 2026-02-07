import { EventEmitter } from "node:events";
import { logger } from "../../utils/logger";
import type { Position, PositionEvent } from "./types";

export class PolymarketPollingClient {
	private users: Set<string> = new Set();
	private intervalMs: number = 10000;
	private timer: Timer | null = null;
	private eventEmitter = new EventEmitter();

	// State tracking for diffing
	private userState: Map<string, { positions: Position[] }> = new Map();

	constructor(config?: { interval?: number; users?: string[] }) {
		if (config?.interval) this.intervalMs = config.interval;
		if (config?.users) config.users.forEach((u) => this.users.add(u));
	}

	public addUsers(users: string[]): this {
		users.forEach((u) => this.users.add(u));
		return this;
	}

	public interval(ms: number): this {
		this.intervalMs = ms;
		return this;
	}

	public build(): this {
		return this;
	}

	public on(callback: (event: PositionEvent) => void): () => void {
		this.eventEmitter.on("event", callback);
		return () => this.eventEmitter.off("event", callback);
	}

	public getUsers(): string[] {
		return Array.from(this.users);
	}

	public start() {
		if (this.timer) return;
		logger.info(
			{ users: this.users.size, interval: this.intervalMs },
			"Starting Polymarket Poller",
		);
		this.poll();
		this.timer = setInterval(() => this.poll(), this.intervalMs);
	}

	public stop() {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}

	private async poll() {
		for (const user of this.users) {
			try {
				await this.checkUser(user);
			} catch (err) {
				this.eventEmitter.emit("event", {
					type: "error",
					user,
					userInfo: { address: user }, // Fallback
					error: err instanceof Error ? err : new Error(String(err)),
					timestamp: new Date(),
				});
			}
		}
	}

	private async checkUser(userAddress: string) {
		// TODO: Replace with real API call
		// const positions = await fetchPositions(userAddress);
		// For now, simulating empty or static to avoid crash
		const positions: Position[] = [];
		// const userInfo = await fetchUserInfo(userAddress);
		const userInfo = { address: userAddress };

		const prevState = this.userState.get(userAddress);

		if (!prevState) {
			// First run, just set state, maybe emit 'update' with initial state?
			// Or 'new' for all? Let's say 'update' is the snapshot.
			this.userState.set(userAddress, { positions });
			this.eventEmitter.emit("event", {
				type: "update",
				user: userAddress,
				userInfo,
				positions,
				timestamp: new Date(),
			});
			return;
		}

		// Diff logic would go here
		// Simple equality check for now
		const prevJson = JSON.stringify(prevState.positions);
		const currJson = JSON.stringify(positions);

		if (prevJson !== currJson) {
			// Naive diff
			// In real impl, calculate added/removed
			this.userState.set(userAddress, { positions });
			this.eventEmitter.emit("event", {
				type: "update",
				user: userAddress,
				userInfo,
				positions,
				timestamp: new Date(),
			});
		}
	}
}

export function createPollingClient() {
	return new PolymarketPollingClient();
}
