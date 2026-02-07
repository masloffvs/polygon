import {
	WsdotResponseSchema,
	type WsdotTrafficEvent,
} from "../../adapters/wsdot";
import { logger } from "../../utils/logger";
import type { AggregatorLayer } from "../aggregator";
import type { SourceConfig } from "./base";
import { BaseSource } from "./base";

interface WsdotSourceConfig extends SourceConfig {
	intervalMs?: number;
}

const API_URL =
	"https://data.wsdot.wa.gov/travelcenter/CurrentRoadAlertPoint.json";

// Convert Web Mercator (EPSG:3857) to WGS84 (EPSG:4326)
function webMercatorToWgs84(x: number, y: number): [number, number] {
	const lng = (x / 20037508.34) * 180;
	let lat = (y / 20037508.34) * 180;
	lat =
		(180 / Math.PI) *
		(2 * Math.atan(Math.exp((lat * Math.PI) / 180)) - Math.PI / 2);
	return [lng, lat];
}

export class WsdotSource extends BaseSource {
	private intervalId: Timer | null = null;
	private intervalMs: number;

	constructor(
		config: Omit<WsdotSourceConfig, "id" | "name" | "description"> &
			Partial<SourceConfig>,
		aggregator: AggregatorLayer,
	) {
		super(
			{
				id: "wsdot-source",
				name: "WSDOT Traffic",
				description: "Washington State DOT Road Alerts",
				...config,
			},
			aggregator,
		);
		this.intervalMs = config.intervalMs || 60000;
	}

	public async connect(): Promise<void> {
		logger.info({ source: this.id }, "Starting polling for WSDOT...");
		await this.tick();
		this.intervalId = setInterval(() => this.tick(), this.intervalMs);
	}

	public disconnect(): void {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}

	private async tick() {
		try {
			const response = await fetch(API_URL, {
				headers: {
					Accept: "application/json",
					"User-Agent":
						"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
				},
			});

			if (!response.ok) {
				throw new Error(
					`HTTP Error: ${response.status} ${response.statusText}`,
				);
			}

			const rawData = await response.json();
			const parsed = WsdotResponseSchema.safeParse(rawData);

			if (parsed.success) {
				const events: WsdotTrafficEvent[] = parsed.data.features.map(
					(feature) => {
						const [lng, lat] = webMercatorToWgs84(
							feature.geometry.x,
							feature.geometry.y,
						);

						return {
							eventId: feature.attributes.EventID,
							category: feature.attributes.EventCategoryDescription || "Alert",
							categoryType:
								feature.attributes.EventCategoryTypeDescription || "Unknown",
							priority: feature.attributes.EventPriorityID || 5,
							road: feature.attributes.Road || "Unknown",
							direction: feature.attributes.RoadDirection || "",
							headline: feature.attributes.HeadlineMessage || "",
							lastModified: feature.attributes.LastModifiedDate || Date.now(),
							coordinates: [lng, lat],
						};
					},
				);

				logger.info(
					{ source: this.id, count: events.length },
					"Fetched WSDOT Traffic Events",
				);

				this.emit({
					type: "wsdot_batch",
					timestamp: Date.now(),
					events: events,
				});
			} else {
				logger.warn(
					{ source: this.id, errors: parsed.error },
					"Schema validation failed for WSDOT",
				);
			}
		} catch (err) {
			logger.error({ source: this.id, err }, "Polling failed");
		}
	}
}
