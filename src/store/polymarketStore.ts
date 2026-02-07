import { create } from "zustand";

export const ensureUniqueId = (item: ActivityItem): ActivityItem => {
	if (item.id) return item;
	// Deterministic ID based on content to prevent duplicates and render churn
	const idStr = `${item.transactionHash}-${item.side}-${item.asset}-${item.outcome}-${item.size}-${item.price}`;
	return {
		...item,
		id: idStr.replace(/[^a-zA-Z0-9-]/g, ""), // simpler string
	};
};

export interface ActivityItem {
	id?: string;
	transactionHash: string;
	timestamp: string; // ClickHouse DateTime comes as string usually or we parse it
	side: "BUY" | "SELL";
	asset: string;
	title: string;
	size: number;
	price: number;
	usdcValue: number;
	proxyWallet: string;
	outcome: string;
	eventSlug: string;
}

export interface PolymarketMetrics {
	tps: number;
	tpm: number;
	vpm: number;
	timestamp: number;
}

interface PolymarketStore {
	activities: ActivityItem[];
	metrics: PolymarketMetrics;
	isLoading: boolean;
	setActivities: (items: ActivityItem[]) => void;
	addActivity: (item: ActivityItem) => void;
	addActivitiesBatch: (items: ActivityItem[]) => void;
	updateMetrics: (m: PolymarketMetrics) => void;
	fetchInitial: () => Promise<void>;
}

// Batching mechanism for high-frequency updates
let pendingItems: ActivityItem[] = [];
let batchTimeout: ReturnType<typeof setTimeout> | null = null;
const BATCH_DELAY_MS = 100; // Batch updates every 100ms

export const usePolymarketStore = create<PolymarketStore>((set, get) => ({
	activities: [],
	metrics: { tps: 0, tpm: 0, vpm: 0, timestamp: 0 },
	isLoading: false,

	setActivities: (items) => {
		const uniqueItems: ActivityItem[] = [];
		const seenIds = new Set<string>();
		for (const item of items) {
			const ensured = ensureUniqueId(item);
			if (ensured.id && !seenIds.has(ensured.id)) {
				seenIds.add(ensured.id);
				uniqueItems.push(ensured);
			}
		}
		// Strict sort by time descending (newest first)
		uniqueItems.sort(
			(a, b) =>
				new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
		);
		set({ activities: uniqueItems });
	},
	updateMetrics: (m) => set({ metrics: m }),

	addActivitiesBatch: (items) =>
		set((state) => {
			// Ensure IDs on incoming items
			const itemsWithIds = items.map(ensureUniqueId);

			// Ensure IDs on state (maintenance)
			const stateActivities = state.activities.map(ensureUniqueId);

			const existingIds = new Set(stateActivities.map((a) => a.id));

			const newItems = itemsWithIds.filter(
				(item) => item.id && !existingIds.has(item.id),
			);

			if (newItems.length === 0) return { activities: stateActivities };

			// Re-sort everything to ensure strict time order (prevents pinning/out-of-order)
			const allActivities = [...newItems, ...stateActivities];
			allActivities.sort(
				(a, b) =>
					new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
			);

			// Ensure we don't exceed max limit to prevent memory bloating
			const newActivities = allActivities.slice(0, 5000);
			return { activities: newActivities };
		}),

	addActivity: (item) => {
		// Add to pending batch
		pendingItems.push(item);

		// Schedule batch flush if not already scheduled
		if (!batchTimeout) {
			batchTimeout = setTimeout(() => {
				const itemsToAdd = [...pendingItems];
				pendingItems = [];
				batchTimeout = null;

				if (itemsToAdd.length > 0) {
					get().addActivitiesBatch(itemsToAdd);
				}
			}, BATCH_DELAY_MS);
		}
	},

	fetchInitial: async () => {
		// Basic debounce/check if data is already there or loading
		// Since fetchInitial is called from components that mount/unmount often
		const state = get();
		if (state.isLoading || state.activities.length > 0) return;

		set({ isLoading: true });
		try {
			const res = await fetch("/api/polymarket/activity?limit=1000");
			if (res.ok) {
				const data = await res.json();
				get().setActivities(data);
			}
		} catch (err) {
			console.error("Failed to fetch initial polymarket activity", err);
		} finally {
			set({ isLoading: false });
		}
	},
}));
