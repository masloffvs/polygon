import { create } from "zustand";

export interface PolygonEvent {
	source: string;
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
	relayer?: string;
}

interface PolygonMonitorStore {
	events: PolygonEvent[];
	addEvent: (event: PolygonEvent) => void;
}

export const usePolygonMonitorStore = create<PolygonMonitorStore>((set) => ({
	events: [],
	addEvent: (event) =>
		set((state) => {
			// Keep last 100 events
			const newEvents = [event, ...state.events].slice(0, 100);
			return { events: newEvents };
		}),
}));
