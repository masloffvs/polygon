import { z } from "zod";
import { BaseAdapter } from "./base";

// Schema for MapFeatures API response (with real coordinates)
export const TrafficMapFeatureSchema = z.object({
	bbox: z.array(z.number()).optional(),
	title: z.string(),
	tooltip: z.string().optional(),
	uri: z.string(),
	priority: z.number().optional(),
	__typename: z.string().optional(),
	features: z
		.array(
			z.object({
				id: z.string(),
				type: z.string(),
				geometry: z.object({
					type: z.string(),
					// coordinates can be [lng, lat] array for Point, or encoded polyline string for LineString
					coordinates: z.union([z.array(z.number()), z.string()]),
				}),
				properties: z
					.object({
						icon: z
							.object({
								url: z.string().optional(),
								scaledSize: z
									.object({
										width: z.number(),
										height: z.number(),
									})
									.optional(),
							})
							.optional(),
						zIndex: z.number().optional(),
						priority: z.number().optional(),
					})
					.optional(),
			}),
		)
		.optional(),
});

export const Traffic511InMapFeaturesResponseSchema = z.object({
	data: z.object({
		mapFeaturesQuery: z.object({
			mapFeatures: z.array(TrafficMapFeatureSchema),
			error: z
				.object({
					message: z.string().optional(),
					type: z.string().optional(),
				})
				.nullable()
				.optional(),
		}),
	}),
});

// Simplified event type for frontend consumption
export interface TrafficEvent511In {
	uri: string;
	title: string;
	tooltip?: string;
	priority?: number;
	typename?: string;
	coordinates?: [number, number]; // [lng, lat]
	iconUrl?: string;
}

export type Traffic511InMapFeaturesResponse = z.infer<
	typeof Traffic511InMapFeaturesResponseSchema
>;

export class Traffic511InAdapter extends BaseAdapter<Traffic511InMapFeaturesResponse> {
	name = "traffic-511in-adapter";
	description = "Validates Traffic 511IN MapFeatures GraphQL API response";
	schema = Traffic511InMapFeaturesResponseSchema;
}
