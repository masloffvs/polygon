import { z } from "zod";
import { BaseAdapter } from "./base";

// WSDOT CurrentRoadAlertPoint.json schema
export const WsdotFeatureSchema = z.object({
	attributes: z.object({
		EventID: z.number(),
		TravelCenterPriorityId: z.number().optional(),
		EventCategoryDescription: z.string().optional(),
		EventCategoryTypeDescription: z.string().optional(),
		EventPriorityID: z.number().optional(),
		Road: z.string().optional(),
		RoadDirection: z.string().optional(),
		HeadlineMessage: z.string().optional(),
		LastModifiedDate: z.number().optional(),
		lineMarker: z.string().optional(),
	}),
	geometry: z.object({
		x: z.number(), // Web Mercator X
		y: z.number(), // Web Mercator Y
	}),
});

export const WsdotResponseSchema = z.object({
	displayFieldName: z.string().optional(),
	geometryType: z.string().optional(),
	spatialReference: z
		.object({
			wkid: z.number().optional(),
			latestWkid: z.number().optional(),
		})
		.optional(),
	timestamp: z.union([z.number(), z.string()]).optional(),
	features: z.array(WsdotFeatureSchema),
});

// Simplified event type for frontend
export interface WsdotTrafficEvent {
	eventId: number;
	category: string;
	categoryType: string;
	priority: number;
	road: string;
	direction: string;
	headline: string;
	lastModified: number;
	coordinates: [number, number]; // [lng, lat] in WGS84
}

export type WsdotResponse = z.infer<typeof WsdotResponseSchema>;

export class WsdotAdapter extends BaseAdapter<WsdotResponse> {
	name = "wsdot-adapter";
	description = "Validates WSDOT CurrentRoadAlertPoint API response";
	schema = WsdotResponseSchema;
}
