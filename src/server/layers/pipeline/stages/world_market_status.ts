import type { WorldClockEvent } from "../../../adapters/world_clock";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

// Config for markets with local trading hours (24h format)
const MARKETS = [
	{ name: "New York", zone: "America/New_York", open: "09:30", close: "16:00" },
	{ name: "London", zone: "Europe/London", open: "08:00", close: "16:30" },
	{ name: "Frankfurt", zone: "Europe/Berlin", open: "09:00", close: "17:30" },
	{ name: "Zurich", zone: "Europe/Zurich", open: "09:00", close: "17:30" },
	{ name: "Moscow", zone: "Europe/Moscow", open: "10:00", close: "18:45" },
	{ name: "Tokyo", zone: "Asia/Tokyo", open: "09:00", close: "15:00" },
	{ name: "Hong Kong", zone: "Asia/Hong_Kong", open: "09:30", close: "16:00" },
	{ name: "Singapore", zone: "Asia/Singapore", open: "09:00", close: "17:00" },
	{ name: "Shanghai", zone: "Asia/Shanghai", open: "09:30", close: "15:00" },
	{ name: "Sydney", zone: "Australia/Sydney", open: "10:00", close: "16:00" },
	{ name: "Toronto", zone: "America/Toronto", open: "09:30", close: "16:00" },
	{ name: "Chicago", zone: "America/Chicago", open: "08:30", close: "15:00" },
	{ name: "Dubai", zone: "Asia/Dubai", open: "10:00", close: "14:00" }, // DFM
	{ name: "Mumbai", zone: "Asia/Kolkata", open: "09:15", close: "15:30" }, // NSE
	{
		name: "São Paulo",
		zone: "America/Sao_Paulo",
		open: "10:00",
		close: "17:00",
	}, // B3
];

export interface MarketStatus {
	name: string;
	time: string;
	isOpen: boolean;
	status: "OPEN" | "CLOSED" | "WEEKEND";
	zone: string;
}

export class WorldMarketStatusStage extends PipelineStage<
	WorldClockEvent,
	MarketStatus[]
> {
	id = "world-market-status";
	description = "Determines if financial markets are open based on World Clock";
	inputs = ["world-clock-source"];
	output = "market-status-updates";

	public async process(
		data: WorldClockEvent,
		context: ProcessingContext,
	): Promise<MarketStatus[] | null> {
		if (context.topic !== "world-clock-source") return null;

		const now = new Date(data.timestamp);
		const results: MarketStatus[] = [];

		for (const m of MARKETS) {
			// Get local time parts
			const parts = new Intl.DateTimeFormat("en-US", {
				timeZone: m.zone,
				hour: "2-digit",
				minute: "2-digit",
				second: "2-digit",
				hour12: false,
				weekday: "long",
			}).formatToParts(now);

			const partMap = new Map(parts.map((p) => [p.type, p.value]));
			const hour = parseInt(partMap.get("hour") || "0", 10);
			const minute = parseInt(partMap.get("minute") || "0", 10);
			const weekday = partMap.get("weekday") || "";
			const timeStr = `${partMap.get("hour")}:${partMap.get("minute")}`;

			const isWeekend = weekday === "Saturday" || weekday === "Sunday";

			// Simple HH:MM comparison
			const currentMinutes = hour * 60 + minute;

			const [openH, openM] = m.open.split(":").map(Number);
			const openMinutes = openH * 60 + openM;

			const [closeH, closeM] = m.close.split(":").map(Number);
			const closeMinutes = closeH * 60 + closeM;

			let isOpen = false;
			let status: "OPEN" | "CLOSED" | "WEEKEND" = "CLOSED";

			if (isWeekend) {
				status = "WEEKEND";
			} else {
				if (currentMinutes >= openMinutes && currentMinutes < closeMinutes) {
					isOpen = true;
					status = "OPEN";
				} else {
					status = "CLOSED";
				}
			}

			results.push({
				name: m.name,
				time: timeStr,
				isOpen,
				status,
				zone: m.zone,
			});
		}

		return results;
	}
}
