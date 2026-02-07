import { logger } from "@/server/utils/logger";
import { clickhouse } from "@/storage/clickhouse";
import type { AggregatorLayer } from "../aggregator";
import type { SourceConfig } from "./base";
import { BaseSource } from "./base";

const FBI_API_BASE = "https://api.fbi.gov/wanted/v1";
const EMUFETCH_URL = process.env.EMUFETCH_URL || "http://emufetch:8916";

interface FBISourceConfig extends SourceConfig {
	pageSize?: number;
	intervalMs?: number;
}

interface FBIWantedPerson {
	uid: string;
	title: string | null;
	description: string | null;
	sex: string | null;
	race: string | null;
	dates_of_birth_used: string[] | null;
	aliases: string[] | null;
	subjects: string[] | null;
	field_offices: string[] | null;
	reward_max: number | null;
	reward_text: string | null;
	caution: string | null;
	url: string | null;
	status: string | null;
	images: Array<{ thumb?: string; large?: string }> | null;
}

interface FBIResponse {
	total: number;
	items: FBIWantedPerson[];
}

export class FBISource extends BaseSource {
	private intervalId: Timer | null = null;
	private pageSize: number;
	private intervalMs: number;
	private isFetching = false;

	constructor(
		config: Omit<FBISourceConfig, "id" | "name" | "description"> &
			Partial<SourceConfig>,
		aggregator: AggregatorLayer,
	) {
		super(
			{
				id: "fbi-source",
				name: "FBI Wanted",
				description: "Fetches FBI Most Wanted list",
				...config,
			},
			aggregator,
		);

		this.pageSize = config.pageSize ?? 50;
		this.intervalMs = config.intervalMs ?? 3600000;
	}

	private async saveToClickHouse(persons: FBIWantedPerson[]): Promise<void> {
		if (persons.length === 0) return;

		const rows = persons.map((p) => ({
			id: p.uid,
			source: "fbi",
			notice_type: "wanted",
			name: p.title || "",
			forename: "",
			title: p.title || "",
			description: p.description || "",
			date_of_birth: p.dates_of_birth_used?.[0] || "",
			sex: p.sex || "",
			nationalities: [],
			thumbnail_url: p.images?.[0]?.thumb || p.images?.[0]?.large || "",
			detail_url: p.url || "",
			reward: p.reward_max || 0,
			reward_text: p.reward_text || "",
			caution: p.caution || "",
			subjects: p.subjects || [],
			field_offices: p.field_offices || [],
			aliases: p.aliases || [],
			fetched_at: new Date().toISOString().slice(0, 19).replace("T", " "),
		}));

		await clickhouse.insert({
			table: "wanted_notices",
			values: rows,
			format: "JSONEachRow",
		});
	}

	private async fetchPage(
		page: number,
	): Promise<{ items: FBIWantedPerson[]; total: number }> {
		const url = `${FBI_API_BASE}/list?pageSize=${this.pageSize}&page=${page}`;
		const proxyUrl = `${EMUFETCH_URL}/open?url=${encodeURIComponent(url)}&type=json`;

		const response = await fetch(proxyUrl);
		if (!response.ok) {
			throw new Error(`FBI API returned ${response.status}`);
		}

		const wrapper = (await response.json()) as {
			success: boolean;
			body?: FBIResponse;
			error?: string;
		};
		if (!wrapper.success || !wrapper.body) {
			throw new Error(wrapper.error || "Failed to fetch FBI data");
		}

		return { items: wrapper.body.items || [], total: wrapper.body.total || 0 };
	}

	private async poll(): Promise<void> {
		if (this.isFetching) {
			logger.warn({ source: this.id }, "Already fetching, skip");
			return;
		}

		this.isFetching = true;
		logger.info({ source: this.id }, "Starting FBI sync...");

		try {
			let page = 1;
			let totalPages = 1;
			let totalSaved = 0;
			let failures = 0;

			while (page <= totalPages) {
				try {
					const { items, total } = await this.fetchPage(page);

					if (page === 1 && total > 0) {
						totalPages = Math.ceil(total / this.pageSize);
						logger.info(
							{ source: this.id, total, pages: totalPages },
							"FBI: starting pagination",
						);
					}

					if (items.length > 0) {
						await this.saveToClickHouse(items);
						totalSaved += items.length;

						if (page % 5 === 0 || page === totalPages) {
							logger.info(
								{ source: this.id, page, totalPages, saved: totalSaved },
								"FBI: progress",
							);
						}
					}

					page++;
					failures = 0;

					if (page <= totalPages) {
						await new Promise((r) => setTimeout(r, 2000));
					}
				} catch (err) {
					failures++;
					logger.error(
						{ source: this.id, page, failures, err },
						"FBI: error fetching page",
					);

					if (failures >= 3) {
						logger.warn(
							{ source: this.id, page },
							"FBI: skipping page after 3 failures",
						);
						page++;
						failures = 0;
					}

					await new Promise((r) => setTimeout(r, 5000));
				}
			}

			this.emit({
				type: "fbi_sync_complete",
				totalSaved,
				timestamp: Date.now(),
			});

			logger.info({ source: this.id, totalSaved }, "FBI sync complete");
		} finally {
			this.isFetching = false;
		}
	}

	private async waitForEmufetch(maxAttempts = 15): Promise<boolean> {
		for (let i = 0; i < maxAttempts; i++) {
			try {
				const res = await fetch(`${EMUFETCH_URL}/health`);
				if (res.ok) {
					logger.info({ source: this.id }, "emufetch ready");
					return true;
				}
			} catch {}
			logger.info(
				{ source: this.id, attempt: i + 1 },
				"Waiting for emufetch...",
			);
			await new Promise((r) => setTimeout(r, 2000));
		}
		return false;
	}

	public async connect(): Promise<void> {
		logger.info({ source: this.id }, "Starting FBI source...");

		const ready = await this.waitForEmufetch();
		if (!ready) {
			logger.error({ source: this.id }, "emufetch not available");
			return;
		}

		// Initial fetch in background
		this.poll();

		this.intervalId = setInterval(() => this.poll(), this.intervalMs);
	}

	public disconnect(): void {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
		logger.info({ source: this.id }, "Disconnected");
	}
}
