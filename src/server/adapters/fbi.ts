import { z } from "zod";
import { BaseAdapter } from "./base";

// FBI Wanted person image
const FBIImageSchema = z.object({
	large: z.string().nullish(),
	caption: z.string().nullish(),
	original: z.string().nullish(),
	thumb: z.string().nullish(),
});

// FBI Wanted person file
const FBIFileSchema = z.object({
	url: z.string().nullish(),
	name: z.string().nullish(),
});

// FBI Wanted person schema
export const FBIWantedPersonSchema = z.object({
	uid: z.string(),
	title: z.string().nullish(),
	description: z.string().nullish(),
	url: z.string().nullish(),
	path: z.string().nullish(),
	status: z.string().nullish(),
	sex: z.string().nullish(),
	race: z.string().nullish(),
	race_raw: z.string().nullish(),
	hair: z.string().nullish(),
	hair_raw: z.string().nullish(),
	eyes: z.string().nullish(),
	eyes_raw: z.string().nullish(),
	height_min: z.number().nullish(),
	height_max: z.number().nullish(),
	weight: z.string().nullish(),
	weight_min: z.number().nullish(),
	weight_max: z.number().nullish(),
	build: z.string().nullish(),
	complexion: z.string().nullish(),
	age_min: z.number().nullish(),
	age_max: z.number().nullish(),
	age_range: z.string().nullish(),
	place_of_birth: z.string().nullish(),
	nationality: z.string().nullish(),
	dates_of_birth_used: z.array(z.string()).nullish(),
	scars_and_marks: z.string().nullish(),
	aliases: z.array(z.string()).nullish(),
	languages: z.array(z.string()).nullish(),
	caution: z.string().nullish(),
	details: z.string().nullish(),
	warning_message: z.string().nullish(),
	remarks: z.string().nullish(),
	additional_information: z.string().nullish(),
	reward_min: z.number().nullish(),
	reward_max: z.number().nullish(),
	reward_text: z.string().nullish(),
	subjects: z.array(z.string()).nullish(),
	field_offices: z.array(z.string()).nullish(),
	legat_names: z.array(z.string()).nullish(),
	locations: z.array(z.string()).nullish(),
	possible_states: z.array(z.string()).nullish(),
	possible_countries: z.array(z.string()).nullish(),
	occupations: z.array(z.string()).nullish(),
	suspects: z.string().nullish(),
	ncic: z.string().nullish(),
	person_classification: z.string().nullish(),
	poster_classification: z.string().nullish(),
	publication: z.string().nullish(),
	modified: z.string().nullish(),
	coordinates: z.array(z.number()).nullish(),
	images: z.array(FBIImageSchema).nullish(),
	files: z.array(FBIFileSchema).nullish(),
	pathId: z.string().nullish(),
});

// FBI Wanted list response
export const FBIWantedListResponseSchema = z.object({
	total: z.number(),
	page: z.number().optional(),
	items: z.array(FBIWantedPersonSchema),
});

export type FBIWantedPerson = z.infer<typeof FBIWantedPersonSchema>;
export type FBIWantedListResponse = z.infer<typeof FBIWantedListResponseSchema>;

// Normalized FBI notice for UI
export interface FBINotice {
	id: string;
	type: "fbi";
	title: string;
	name?: string;
	description?: string;
	sex?: string;
	race?: string;
	hair?: string;
	eyes?: string;
	dateOfBirth?: string;
	aliases?: string[];
	subjects?: string[];
	fieldOffices?: string[];
	reward?: number;
	rewardText?: string;
	caution?: string;
	thumbnailUrl?: string;
	detailUrl?: string;
	status?: string;
}

export class FBIWantedAdapter extends BaseAdapter<FBIWantedListResponse> {
	name = "fbi-wanted";
	description = "Validates FBI Wanted List API response";
	schema = FBIWantedListResponseSchema;
}
