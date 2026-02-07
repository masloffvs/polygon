import { logger } from "../../utils/logger";
import type { AggregatorLayer } from "../aggregator";
import type { SourceConfig } from "./base";
import { BaseSource } from "./base";

interface WorldClockConfig extends SourceConfig {
	interval?: number;
}

const CITIES = [
	{ name: "New York", zone: "America/New_York" },
	{ name: "London", zone: "Europe/London" },
	{ name: "Frankfurt", zone: "Europe/Berlin" },
	{ name: "Zurich", zone: "Europe/Zurich" },
	{ name: "Moscow", zone: "Europe/Moscow" },
	{ name: "Dubai", zone: "Asia/Dubai" },
	{ name: "Mumbai", zone: "Asia/Kolkata" },
	{ name: "Hong Kong", zone: "Asia/Hong_Kong" },
	{ name: "Shanghai", zone: "Asia/Shanghai" },
	{ name: "Tokyo", zone: "Asia/Tokyo" },
	{ name: "Singapore", zone: "Asia/Singapore" },
	{ name: "Sydney", zone: "Australia/Sydney" },
	{ name: "São Paulo", zone: "America/Sao_Paulo" },
	{ name: "Toronto", zone: "America/Toronto" },
	{ name: "Chicago", zone: "America/Chicago" },
	{ name: "Los Angeles", zone: "America/Los_Angeles" },
	{ name: "UTC", zone: "UTC" },
];

export class WorldClockSource extends BaseSource {
	private timer: Timer | null = null;
	private interval: number;

	constructor(
		config: Omit<WorldClockConfig, "id" | "name" | "description"> &
			Partial<SourceConfig>,
		aggregator: AggregatorLayer,
	) {
		super(
			{
				id: "world-clock-source",
				name: "World Clock",
				description: "Emits current time for major global financial centers",
				...config,
			},
			aggregator,
		);
		this.interval = config.interval || 1000;
	}

	public async connect(): Promise<void> {
		logger.info({ source: this.id }, "Starting World Clock...");

		this.timer = setInterval(() => {
			this.tick();
		}, this.interval);
	}

	private tick() {
		const now = new Date();
		const citiesData: Record<string, string> = {};

		CITIES.forEach((city) => {
			// Format: HH:mm:ss
			const timeStr = new Intl.DateTimeFormat("en-US", {
				timeZone: city.zone,
				hour: "2-digit",
				minute: "2-digit",
				second: "2-digit",
				hour12: false,
			}).format(now);

			citiesData[city.name] = timeStr;
		});

		this.emit({
			timestamp: now.getTime(),
			cities: citiesData,
		});
	}

	public disconnect(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}
}
