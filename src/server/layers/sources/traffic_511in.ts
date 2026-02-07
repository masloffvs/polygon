import {
	Traffic511InMapFeaturesResponseSchema,
	type TrafficEvent511In,
} from "../../adapters/traffic_511in";
import { logger } from "../../utils/logger";
import type { AggregatorLayer } from "../aggregator";
import type { SourceConfig } from "./base";
import { BaseSource } from "./base";

interface Traffic511InSourceConfig extends SourceConfig {
	intervalMs?: number;
}

// MapFeatures query - returns real coordinates
const GRAPHQL_QUERY = `
query MapFeatures($input: MapFeaturesArgs!) {
  mapFeaturesQuery(input: $input) {
    mapFeatures {
      bbox
      title
      tooltip
      uri
      features {
        id
        geometry
        properties
        type
      }
      ... on Event {
        priority
      }
      __typename
    }
    error {
      message
      type
    }
  }
}
`;

// Indiana bounding box
const VARIABLES = {
	input: {
		north: 42.0,
		south: 37.5,
		east: -84.5,
		west: -88.5,
		zoom: 8,
		layerSlugs: ["incidents"],
		nonClusterableUris: ["dashboard"],
	},
};

export class Traffic511InSource extends BaseSource {
	private intervalId: Timer | null = null;
	private intervalMs: number;

	constructor(
		config: Omit<Traffic511InSourceConfig, "id" | "name" | "description"> &
			Partial<SourceConfig>,
		aggregator: AggregatorLayer,
	) {
		super(
			{
				id: "traffic-511in-source",
				name: "Traffic 511IN",
				description: "Monitors Indiana 511 Traffic Events",
				...config,
			},
			aggregator,
		);
		this.intervalMs = (config as any).intervalMs || 60000;
	}

	public async connect(): Promise<void> {
		logger.info({ source: this.id }, "Starting polling for Traffic 511IN...");
		await this.tick(); // Run immediately
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
			const response = await fetch("https://511in.org/api/graphql", {
				method: "POST",
				headers: {
					accept: "*/*",
					"content-type": "application/json",
					language: "en",
					origin: "https://511in.org",
					referer: "https://511in.org/",
					"user-agent":
						"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.6997.93 Safari/537.36",
				},
				body: JSON.stringify({
					query: GRAPHQL_QUERY,
					variables: VARIABLES,
				}),
			});

			if (!response.ok) {
				throw new Error(
					`HTTP Error: ${response.status} ${response.statusText}`,
				);
			}

			const rawData = await response.json();
			const parsed = Traffic511InMapFeaturesResponseSchema.safeParse(rawData);

			if (parsed.success) {
				const mapFeatures = parsed.data.data.mapFeaturesQuery.mapFeatures;

				// Transform to simplified events with coordinates
				const events: TrafficEvent511In[] = mapFeatures.map((feature) => {
					// Find first Point geometry (skip LineString which has encoded polyline string)
					const pointFeature = feature.features?.find(
						(f) =>
							f.geometry.type === "Point" &&
							Array.isArray(f.geometry.coordinates),
					);
					const coords = pointFeature?.geometry?.coordinates;
					const iconUrl = pointFeature?.properties?.icon?.url;

					return {
						uri: feature.uri,
						title: feature.title,
						tooltip: feature.tooltip,
						priority: feature.priority,
						typename: feature.__typename,
						coordinates:
							coords &&
							Array.isArray(coords) &&
							coords[0] !== undefined &&
							coords[1] !== undefined
								? [coords[0] as number, coords[1] as number]
								: undefined,
						iconUrl: iconUrl,
					};
				});

				logger.info(
					{ source: this.id, count: events.length },
					"Fetched Traffic Events with coordinates",
				);

				this.emit({
					type: "traffic_511in_batch",
					timestamp: Date.now(),
					events: events,
				});
			} else {
				logger.warn(
					{ source: this.id, errors: parsed.error },
					"Schema validation failed for Traffic 511IN",
				);
			}
		} catch (err) {
			logger.error({ source: this.id, err }, "Polling failed");
		}
	}
}
