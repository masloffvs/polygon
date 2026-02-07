import { emuOpenJson } from "@/emufetch/client";
import type { InterpolNotice } from "@/server/adapters/interpol";
import { logger } from "@/server/utils/logger";
import { clickhouse } from "@/storage/clickhouse";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

interface InterpolBatch {
	type: "interpol_batch";
	notices: InterpolNotice[];
	timestamp: number;
}

interface InterpolDetail {
	entity_id: string;
	notice_type: "red" | "yellow" | "un";
	forename?: string;
	name?: string;
	date_of_birth?: string;
	sex_id?: string;
	nationalities: string[];
	country_of_birth_id?: string;
	place_of_birth?: string;
	height?: number;
	weight?: number;
	eyes_colors?: string[];
	hairs?: string[];
	languages_spoken?: string[];
	distinguishing_marks?: string;
	arrest_warrants_json?: string;
	thumbnail_url?: string;
	detail_url?: string;
	fetched_at: number;
}

/**
 * Background fetcher for Interpol notice details.
 * Fetches full details for each notice and stores in ClickHouse.
 */
export class InterpolDetailsFetcherStage extends PipelineStage<
	InterpolBatch,
	{ fetched: number }
> {
	id = "interpol-details-fetcher";
	description = "Fetches and stores detailed Interpol notice information";
	inputs = ["interpol-source"];
	output = "interpol-details-stored";

	private pendingQueue: InterpolNotice[] = [];
	private isProcessing = false;
	private processedIds = new Set<string>();

	public async process(
		data: InterpolBatch,
		context: ProcessingContext,
	): Promise<{ fetched: number } | null> {
		if (context.topic !== "interpol-source" || data.type !== "interpol_batch") {
			return null;
		}

		// Add notices to queue (deduplicate)
		for (const notice of data.notices) {
			const key = `${notice.type}-${notice.id}`;
			if (!this.processedIds.has(key)) {
				this.pendingQueue.push(notice);
			}
		}

		logger.info(
			{ stage: this.id, queueSize: this.pendingQueue.length },
			"Added notices to detail fetch queue",
		);

		// Start background processing if not already running
		if (!this.isProcessing) {
			this.processQueueInBackground();
		}

		return { fetched: 0 };
	}

	private async processQueueInBackground(): Promise<void> {
		if (this.isProcessing || this.pendingQueue.length === 0) return;

		this.isProcessing = true;

		try {
			while (this.pendingQueue.length > 0) {
				const notice = this.pendingQueue.shift();
				if (!notice) continue;

				const key = `${notice.type}-${notice.id}`;

				// Check if already in database
				const exists = await this.checkExists(notice.id, notice.type);
				if (exists) {
					this.processedIds.add(key);
					continue;
				}

				// Fetch details via emufetch
				try {
					const detail = await this.fetchDetail(notice);
					if (detail) {
						await this.storeDetail(detail);
						this.processedIds.add(key);
						logger.info(
							{ stage: this.id, entityId: notice.id, type: notice.type },
							"Fetched and stored notice detail",
						);
					}
				} catch (err) {
					logger.error(
						{ stage: this.id, entityId: notice.id, err },
						"Failed to fetch notice detail",
					);
				}

				// Rate limit - wait 500ms between requests
				await new Promise((r) => setTimeout(r, 500));
			}
		} finally {
			this.isProcessing = false;
		}
	}

	private async checkExists(
		entityId: string,
		noticeType: string,
	): Promise<boolean> {
		try {
			const result = await clickhouse.query({
				query: `SELECT 1 FROM interpol_details WHERE entity_id = {entityId:String} AND notice_type = {noticeType:String} LIMIT 1`,
				query_params: { entityId, noticeType },
				format: "JSONEachRow",
			});
			const rows = await result.json();
			return Array.isArray(rows) && rows.length > 0;
		} catch {
			// Table might not exist yet
			return false;
		}
	}

	private async fetchDetail(
		notice: InterpolNotice,
	): Promise<InterpolDetail | null> {
		if (!notice.detailUrl) return null;

		try {
			const data = await emuOpenJson<Record<string, unknown>>(notice.detailUrl);

			return {
				entity_id: notice.id,
				notice_type: notice.type,
				forename: (data.forename as string) || notice.forename,
				name: (data.name as string) || notice.name,
				date_of_birth: (data.date_of_birth as string) || notice.dateOfBirth,
				sex_id: data.sex_id as string,
				nationalities:
					(data.nationalities as string[]) || notice.nationalities || [],
				country_of_birth_id: data.country_of_birth_id as string,
				place_of_birth: data.place_of_birth as string,
				height: data.height as number,
				weight: data.weight as number,
				eyes_colors: data.eyes_colors_id as string[],
				hairs: data.hairs_id as string[],
				languages_spoken: data.languages_spoken_ids as string[],
				distinguishing_marks: data.distinguishing_marks as string,
				arrest_warrants_json: data.arrest_warrants
					? JSON.stringify(data.arrest_warrants)
					: undefined,
				thumbnail_url: notice.thumbnailUrl,
				detail_url: notice.detailUrl,
				fetched_at: Date.now(),
			};
		} catch (err) {
			logger.error(
				{ stage: this.id, url: notice.detailUrl, err },
				"Failed to fetch detail from URL",
			);
			return null;
		}
	}

	private async storeDetail(detail: InterpolDetail): Promise<void> {
		// Format date for ClickHouse DateTime
		const fetchedAtStr = new Date(detail.fetched_at)
			.toISOString()
			.slice(0, 19)
			.replace("T", " ");

		await clickhouse.insert({
			table: "interpol_details",
			values: [
				{
					entity_id: detail.entity_id,
					notice_type: detail.notice_type,
					forename: detail.forename || "",
					name: detail.name || "",
					date_of_birth: detail.date_of_birth || "",
					sex_id: detail.sex_id || "",
					nationalities: detail.nationalities,
					country_of_birth_id: detail.country_of_birth_id || "",
					place_of_birth: detail.place_of_birth || "",
					height: detail.height || 0,
					weight: detail.weight || 0,
					eyes_colors: detail.eyes_colors || [],
					hairs: detail.hairs || [],
					languages_spoken: detail.languages_spoken || [],
					distinguishing_marks: detail.distinguishing_marks || "",
					arrest_warrants_json: detail.arrest_warrants_json || "",
					thumbnail_url: detail.thumbnail_url || "",
					detail_url: detail.detail_url || "",
					fetched_at: fetchedAtStr,
				},
			],
			format: "JSONEachRow",
		});
	}
}
