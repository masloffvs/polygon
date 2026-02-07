import puppeteer, { type Browser } from "puppeteer";
import { logger } from "./logger";

let browser: Browser | null = null;
let browserLaunching: Promise<Browser> | null = null;

export async function getBrowser() {
	if (browser?.isConnected()) {
		return browser;
	}

	if (browserLaunching) {
		return browserLaunching;
	}

	logger.info("Launching Puppeteer browser...");
	browserLaunching = puppeteer
		.launch({
			headless: true,
			args: ["--no-sandbox", "--disable-setuid-sandbox"],
		})
		.then((b) => {
			browser = b;
			browserLaunching = null;
			return b;
		})
		.catch((err) => {
			browserLaunching = null;
			throw err;
		});

	return browserLaunching;
}

export async function pfetch(url: string, options: RequestInit = {}) {
	const browser = await getBrowser();
	const page = await browser.newPage();

	try {
		// Set a realistic User Agent
		await page.setUserAgent(
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
		);

		// Try to navigate to the origin to set up context (cookies, storage, etc.)
		// This often helps with Cloudflare challenges that check for environment consistency
		try {
			const urlObj = new URL(url);
			await page.goto(urlObj.origin, {
				waitUntil: "domcontentloaded",
				timeout: 30000,
			});
		} catch (err) {
			logger.warn(
				{ err, url },
				"Failed to navigate to origin in pfetch, proceeding with fetch",
			);
		}

		// Execute fetch inside the browser page
		// We need to serialize options because they are passed to the browser context
		const serializedOptions = {
			...options,
			headers:
				options.headers instanceof Headers
					? Object.fromEntries(options.headers.entries())
					: options.headers,
		};

		const result = await page.evaluate(
			async (url, options) => {
				const res = await fetch(url, options);
				const text = await res.text();

				// Try to parse JSON to see if we can, but keep text available
				let json;
				try {
					json = JSON.parse(text);
				} catch {}

				return {
					ok: res.ok,
					status: res.status,
					statusText: res.statusText,
					headers: Object.fromEntries(res.headers.entries()),
					text,
					json,
				};
			},
			url,
			serializedOptions,
		);

		// reconstruct a Response-like object
		return {
			ok: result.ok,
			status: result.status,
			statusText: result.statusText,
			headers: new Headers(result.headers),
			text: async () => result.text,
			json: async () => {
				if (result.json === undefined) {
					// If parsing failed in browser, try parsing the text here to throw the correct error
					return JSON.parse(result.text);
				}
				return result.json;
			},
			// Helper to match standard Response
			headersRaw: result.headers,
		};
	} finally {
		await page.close();
	}
}
