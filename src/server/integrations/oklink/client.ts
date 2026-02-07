// src/server/integrations/oklink/client.ts
import { logger } from "../../utils/logger";
import type { OKLinkResponse } from "./types";

export class OKLinkClient {
	private readonly baseUrl = "https://www.oklink.com/api/explorer/v2";
	private apiKey: string;

	constructor(apiKey: string) {
		this.apiKey = apiKey;
	}

	// --- API Key Generation Logic (as provided) ---

	private encryptTime(timestamp: number): string {
		const timeStr = (timestamp + 1111111111111).toString();
		const digits = timeStr.split("");
		const r = Math.floor(Math.random() * 10);
		const n = Math.floor(Math.random() * 10);
		const o = Math.floor(Math.random() * 10);
		return digits.concat([r.toString(), n.toString(), o.toString()]).join("");
	}

	private encryptApiKey(): string {
		const chars = this.apiKey.split("");
		const first8 = chars.splice(0, 8);
		return chars.concat(first8).join("");
	}

	private comb(encryptedKey: string, encryptedTime: string): string {
		const combined = `${encryptedKey}|${encryptedTime}`;
		return btoa(combined);
	}

	private generateHeaderKey(): string {
		const timestamp = Date.now();
		const encryptedKey = this.encryptApiKey();
		const encryptedTime = this.encryptTime(timestamp);
		return this.comb(encryptedKey, encryptedTime);
	}

	// --- API Methods ---

	public async fetchNFTTransfers(
		chain: string,
		address: string,
		options: {
			tokenTypes?: string;
			offset?: number;
			limit?: number;
			type?: string;
		} = {},
	): Promise<OKLinkResponse> {
		const {
			tokenTypes = "ERC721,ERC1155",
			offset = 0,
			limit = 20,
			type = "nft",
		} = options;

		const url = new URL(
			`${this.baseUrl}/${chain}/addresses/${address}/transfers/condition/${type}`,
		);
		url.searchParams.set("tokenTypes", tokenTypes);
		url.searchParams.set("offset", offset.toString());
		url.searchParams.set("limit", limit.toString());

		const headerKey = this.generateHeaderKey();

		try {
			const response = await fetch(url.toString(), {
				headers: {
					"x-apikey": headerKey,
					"User-Agent":
						"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
					Accept: "application/json",
				},
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			return await response.json();
		} catch (err) {
			if (err instanceof Error) {
				logger.error({ err, chain, address }, "OKLink API request failed");
			}
			throw err;
		}
	}
}
