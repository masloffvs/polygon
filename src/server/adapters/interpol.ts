import { z } from "zod";
import { BaseAdapter } from "./base";

// Links schema for HATEOAS navigation
const LinksSchema = z.object({
	href: z.string(),
});

// Notice embedded in list
const NoticeEmbeddedSchema = z.object({
	forename: z.string().nullish(),
	name: z.string().nullish(),
	date_of_birth: z.string().nullish(),
	entity_id: z.string(),
	nationalities: z.array(z.string()).nullish(),
	_links: z
		.object({
			self: LinksSchema.optional(),
			images: LinksSchema.optional(),
			thumbnail: LinksSchema.optional(),
		})
		.optional(),
});

// Red Notices list response
export const RedNoticesResponseSchema = z.object({
	total: z.number(),
	query: z
		.object({
			page: z.number().optional(),
			resultPerPage: z.number().optional(),
		})
		.optional(),
	_embedded: z
		.object({
			notices: z.array(NoticeEmbeddedSchema),
		})
		.optional(),
	_links: z
		.object({
			self: LinksSchema.optional(),
			first: LinksSchema.optional(),
			next: LinksSchema.optional(),
			last: LinksSchema.optional(),
		})
		.optional(),
});

// Yellow Notices list response (same structure)
export const YellowNoticesResponseSchema = RedNoticesResponseSchema;

// UN Notices list response (same structure)
export const UNNoticesResponseSchema = RedNoticesResponseSchema;

// Red Notice detail
export const RedNoticeDetailSchema = z.object({
	entity_id: z.string().optional(),
	forename: z.string().optional(),
	name: z.string().optional(),
	date_of_birth: z.string().optional(),
	sex_id: z.string().optional(),
	nationalities: z.array(z.string()).optional(),
	country_of_birth_id: z.string().optional(),
	place_of_birth: z.string().optional(),
	height: z.number().optional(),
	weight: z.number().optional(),
	eyes_colors_id: z.array(z.string()).optional(),
	hairs_id: z.array(z.string()).optional(),
	languages_spoken_ids: z.array(z.string()).optional(),
	distinguishing_marks: z.string().optional(),
	arrest_warrants: z
		.array(
			z.object({
				issuing_country_id: z.string().optional(),
				charge: z.string().optional(),
				charge_translation: z.string().nullable().optional(),
			}),
		)
		.optional(),
	_links: z
		.object({
			self: LinksSchema.optional(),
			images: LinksSchema.optional(),
			thumbnail: LinksSchema.optional(),
		})
		.optional(),
});

// Yellow Notice detail
export const YellowNoticeDetailSchema = z.object({
	entity_id: z.string().optional(),
	forename: z.string().optional(),
	name: z.string().optional(),
	birth_name: z.string().optional(),
	date_of_birth: z.string().optional(),
	date_of_event: z.string().optional(),
	sex_id: z.string().optional(),
	nationalities: z.array(z.string()).optional(),
	country_of_birth_id: z.string().optional(),
	place_of_birth: z.string().optional(),
	place: z.string().optional(),
	country: z.string().optional(),
	height: z.number().optional(),
	weight: z.number().optional(),
	eyes_colors_id: z.array(z.string()).optional(),
	hairs_id: z.array(z.string()).optional(),
	languages_spoken_ids: z.array(z.string()).optional(),
	distinguishing_marks: z.string().optional(),
	father_forename: z.string().optional(),
	mother_forename: z.string().optional(),
	mother_name: z.string().optional(),
	_links: z
		.object({
			self: LinksSchema.optional(),
			images: LinksSchema.optional(),
			thumbnail: LinksSchema.optional(),
		})
		.optional(),
});

// UN Notice detail
export const UNNoticeDetailSchema = z.object({
	entity_id: z.string().optional(),
	forename: z.string().optional(),
	name: z.string().optional(),
	name_at_birth: z.string().optional(),
	name_in_original_script: z.string().optional(),
	forename_in_original_script: z.string().optional(),
	date_of_birth: z.string().optional(),
	sex_id: z.string().optional(),
	nationalities: z.array(z.string()).optional(),
	country_of_birth_id: z.string().optional(),
	place_of_birth: z.string().optional(),
	un_reference: z.string().optional(),
	un_reference_date: z.string().optional(),
	un_resolution: z.number().optional(),
	summary: z.string().optional(),
	main_activity: z.string().optional(),
	aliases: z.array(z.string()).optional(),
	associates: z.array(z.string()).optional(),
	adresses: z.array(z.string()).optional(),
	identity_documents: z.array(z.string()).optional(),
	purposes: z.array(z.string()).optional(),
	profession: z.string().optional(),
	additional_information: z.string().optional(),
	_links: z
		.object({
			self: LinksSchema.optional(),
			images: LinksSchema.optional(),
			thumbnail: LinksSchema.optional(),
		})
		.optional(),
});

// Simplified notice for frontend
export interface InterpolNotice {
	id: string;
	type: "red" | "yellow" | "un";
	forename?: string;
	name?: string;
	dateOfBirth?: string;
	nationalities: string[];
	sex?: string;
	thumbnailUrl?: string;
	detailUrl?: string;
	// Red notice specific
	charges?: string[];
	warrantCountries?: string[];
	// UN notice specific
	unReference?: string;
	unResolution?: number;
	summary?: string;
	mainActivity?: string;
}

export type RedNoticesResponse = z.infer<typeof RedNoticesResponseSchema>;
export type YellowNoticesResponse = z.infer<typeof YellowNoticesResponseSchema>;
export type UNNoticesResponse = z.infer<typeof UNNoticesResponseSchema>;
export type RedNoticeDetail = z.infer<typeof RedNoticeDetailSchema>;
export type YellowNoticeDetail = z.infer<typeof YellowNoticeDetailSchema>;
export type UNNoticeDetail = z.infer<typeof UNNoticeDetailSchema>;

export class InterpolRedAdapter extends BaseAdapter<RedNoticesResponse> {
	name = "interpol-red-adapter";
	description = "Validates Interpol Red Notices API response";
	schema = RedNoticesResponseSchema;
}

export class InterpolYellowAdapter extends BaseAdapter<YellowNoticesResponse> {
	name = "interpol-yellow-adapter";
	description = "Validates Interpol Yellow Notices API response";
	schema = YellowNoticesResponseSchema;
}

export class InterpolUNAdapter extends BaseAdapter<UNNoticesResponse> {
	name = "interpol-un-adapter";
	description = "Validates Interpol UN Notices API response";
	schema = UNNoticesResponseSchema;
}
