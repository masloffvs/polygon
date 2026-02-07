import { emuOpenJson } from "@/emufetch/client";
import { clickhouse } from "@/storage/clickhouse";
import type {
	InterpolNotice,
	RedNoticesResponse,
} from "../../adapters/interpol";
import { logger } from "../../utils/logger";
import type { AggregatorLayer } from "../aggregator";
import type { SourceConfig } from "./base";
import { BaseSource } from "./base";

const INTERPOL_API_BASE = "https://ws-public.interpol.int";
const EMUFETCH_URL = process.env.EMUFETCH_URL || "http://emufetch:8916";

interface InterpolSourceConfig extends SourceConfig {
	resultPerPage?: number;
	intervalMs?: number;
	fetchRed?: boolean;
	fetchYellow?: boolean;
	fetchUN?: boolean;
}

export class InterpolSource extends BaseSource {
	private intervalId: Timer | null = null;
	private resultPerPage: number;
	private intervalMs: number;
	private fetchRed: boolean;
	private fetchYellow: boolean;
	private fetchUN: boolean;
	private isFetching = false;

	constructor(
		config: Omit<InterpolSourceConfig, "id" | "name" | "description"> &
			Partial<SourceConfig>,
		aggregator: AggregatorLayer,
	) {
		super(
			{
				id: "interpol-source",
				name: "Interpol Notices",
				description: "Fetches Red, Yellow, and UN notices from Interpol",
				...config,
			},
			aggregator,
		);

		this.resultPerPage = config.resultPerPage ?? 100;
		this.intervalMs = config.intervalMs ?? 3600000;
		this.fetchRed = config.fetchRed ?? true;
		this.fetchYellow = config.fetchYellow ?? true;
		this.fetchUN = config.fetchUN ?? true;
	}

	private async saveToClickHouse(
		notices: InterpolNotice[],
		noticeType: string,
	): Promise<void> {
		if (notices.length === 0) return;

		const rows = notices.map((n) => ({
			id: n.id,
			source: "interpol",
			notice_type: noticeType,
			name: n.name || "",
			forename: n.forename || "",
			title: "",
			description: "",
			date_of_birth: n.dateOfBirth || "",
			sex: "",
			nationalities: n.nationalities || [],
			thumbnail_url: n.thumbnailUrl || "",
			detail_url: n.detailUrl || "",
			reward: 0,
			reward_text: "",
			caution: "",
			subjects: [],
			field_offices: [],
			aliases: [],
			fetched_at: new Date().toISOString().slice(0, 19).replace("T", " "),
		}));

		await clickhouse.insert({
			table: "wanted_notices",
			values: rows,
			format: "JSONEachRow",
		});
	}

	private async fetchAndSaveType(
		type: "red" | "yellow" | "un",
	): Promise<number> {
		let page = 1;
		let totalPages = 1;
		let totalSaved = 0;
		let failures = 0;

		while (page <= totalPages) {
			try {
				const url = `${INTERPOL_API_BASE}/notices/v1/${type}?resultPerPage=${this.resultPerPage}&page=${page}`;
				const data = await emuOpenJson<RedNoticesResponse>(url);

				if (page === 1 && data.total) {
					totalPages = Math.ceil(data.total / this.resultPerPage);
					logger.info(
						{ source: this.id, type, total: data.total, pages: totalPages },
						`Interpol ${type}: starting`,
					);
				}

				const notices: InterpolNotice[] = (data._embedded?.notices || []).map(
					(n) => ({
						id: n.entity_id,
						type: type,
						forename: n.forename ?? undefined,
						name: n.name ?? undefined,
						dateOfBirth: n.date_of_birth ?? undefined,
						nationalities: n.nationalities || [],
						thumbnailUrl: n._links?.thumbnail?.href,
						detailUrl: n._links?.self?.href,
					}),
				);

				if (notices.length > 0) {
					await this.saveToClickHouse(notices, type);
					totalSaved += notices.length;

					if (page % 10 === 0 || page === totalPages) {
						logger.info(
							{ source: this.id, type, page, totalPages, saved: totalSaved },
							`Interpol ${type}: progress`,
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
					{ source: this.id, type, page, failures, err },
					`Interpol ${type}: error`,
				);

				if (failures >= 3) {
					logger.warn(
						{ source: this.id, type, page },
						`Interpol ${type}: skipping page after 3 failures`,
					);
					page++;
					failures = 0;
				}

				await new Promise((r) => setTimeout(r, 5000));
			}
		}

		logger.info(
			{ source: this.id, type, total: totalSaved },
			`Interpol ${type}: done`,
		);
		return totalSaved;
	}

	private async poll(): Promise<void> {
		if (this.isFetching) {
			logger.warn({ source: this.id }, "Already fetching, skip");
			return;
		}

		this.isFetching = true;
		logger.info({ source: this.id }, "Starting Interpol sync...");

		try {
			let totalSaved = 0;

			if (this.fetchRed) totalSaved += await this.fetchAndSaveType("red");
			if (this.fetchYellow) totalSaved += await this.fetchAndSaveType("yellow");
			if (this.fetchUN) totalSaved += await this.fetchAndSaveType("un");

			this.emit({
				type: "interpol_sync_complete",
				totalSaved,
				timestamp: Date.now(),
			});

			logger.info({ source: this.id, totalSaved }, "Interpol sync complete");
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
		logger.info({ source: this.id }, "Starting Interpol source...");

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
