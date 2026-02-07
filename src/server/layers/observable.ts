import type { ObservableCard } from "../observableCards/base";
import { logger } from "../utils/logger";
import type { AggregatorLayer } from "./aggregator";

export class ObservableDataLayer {
	private cards = new Map<string, ObservableCard>();
	private topicSubscribers = new Map<string, ObservableCard[]>();

	constructor(private aggregator: AggregatorLayer) {}

	public register(card: ObservableCard) {
		if (this.cards.has(card.id)) {
			logger.warn(
				{ card: card.id },
				"Observable Card already registered, overwriting",
			);
		}
		this.cards.set(card.id, card);

		// Subscribe to inputs
		card.inputs.forEach((topic) => {
			if (!this.topicSubscribers.has(topic)) {
				this.topicSubscribers.set(topic, []);
			}
			this.topicSubscribers.get(topic)?.push(card);
		});

		logger.info({ card: card.id }, "Observable Card registered");
	}

	public start() {
		logger.info("Starting Observable Data Layer...");

		this.aggregator.feed$.subscribe(({ pool, event }) => {
			const subscribers = this.topicSubscribers.get(pool);
			if (!subscribers) return;

			for (const card of subscribers) {
				try {
					const payload = event.data !== undefined ? event.data : event;
					card.process(payload, pool);
				} catch (err) {
					logger.error({ card: card.id, err }, "Error processing card update");
				}
			}
		});
	}

	public getSnapshots() {
		const snap: Record<string, any> = {};
		for (const [id, card] of this.cards) {
			snap[id] = card.getSnapshot();
		}
		return snap;
	}

	public getGraphNodes() {
		return Array.from(this.cards.values()).map((card) => ({
			id: card.id,
			inputs: card.inputs,
			output: "dashboard-ui",
			description: card.description,
			type: "observable-card",
		}));
	}
}
