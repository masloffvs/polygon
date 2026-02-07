/**
 * emufetch client - helper to use emufetch service from Polygon
 *
 * Usage:
 *   import { emuFetch, emuOpen, emuNavigate, emuScreenshot } from "@/emufetch/client";
 *
 *   // Via JS fetch inside browser
 *   const data = await emuFetch("https://protected-api.com/data");
 *   const postData = await emuFetch("https://api.com/submit", "POST", { key: "value" });
 *
 *   // Via REAL browser navigation (opens the tab!)
 *   const html = await emuOpen("https://example.com");
 *   const json = await emuOpen("https://api.com/data.json", { returnType: "json" });
 */

const EMUFETCH_URL = process.env.EMUFETCH_URL || "http://emufetch:8916";

interface EmuFetchResponse<T = unknown> {
	success: boolean;
	status?: number;
	statusText?: string;
	headers?: Record<string, string>;
	body?: T;
	error?: string;
}

interface EmuOpenResponse<T = unknown> {
	success: boolean;
	status?: number;
	url?: string;
	title?: string;
	body?: T;
	error?: string;
}

interface EmuOpenOptions {
	waitFor?: string; // CSS selector to wait for
	waitTimeout?: number;
	returnType?: "html" | "text" | "json";
}

/**
 * Execute HTTP request through browser emulation (uses fetch API inside browser)
 */
export async function emuFetch<T = unknown>(
	url: string,
	method: "GET" | "POST" = "GET",
	body?: Record<string, unknown>,
	headers?: Record<string, string>,
): Promise<T> {
	const response = await fetch(`${EMUFETCH_URL}/fetch`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ url, method, body, headers }),
	});

	const result = (await response.json()) as EmuFetchResponse<T>;

	if (!result.success) {
		throw new Error(`emufetch error: ${result.error}`);
	}

	return result.body as T;
}

/**
 * Open URL via REAL browser navigation and return page content
 * This actually opens the page in a browser tab - maximum realism!
 */
export async function emuOpen<T = string>(
	url: string,
	options: EmuOpenOptions = {},
): Promise<T> {
	const response = await fetch(`${EMUFETCH_URL}/open`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			url,
			waitFor: options.waitFor,
			waitTimeout: options.waitTimeout,
			returnType: options.returnType || "html",
		}),
	});

	const result = (await response.json()) as EmuOpenResponse<T>;

	if (!result.success) {
		throw new Error(`emufetch open error: ${result.error}`);
	}

	return result.body as T;
}

/**
 * Open URL and get JSON response (shortcut for emuOpen with returnType: "json")
 */
export async function emuOpenJson<T = unknown>(
	url: string,
	options: Omit<EmuOpenOptions, "returnType"> = {},
): Promise<T> {
	return emuOpen<T>(url, { ...options, returnType: "json" });
}

/**
 * Open URL and get text content (shortcut for emuOpen with returnType: "text")
 */
export async function emuOpenText(
	url: string,
	options: Omit<EmuOpenOptions, "returnType"> = {},
): Promise<string> {
	return emuOpen<string>(url, { ...options, returnType: "text" });
}

/**
 * Navigate browser to URL (useful for setting cookies/sessions)
 */
export async function emuNavigate(url: string): Promise<string> {
	const response = await fetch(`${EMUFETCH_URL}/navigate`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ url }),
	});

	const result = (await response.json()) as {
		success: boolean;
		url?: string;
		error?: string;
	};

	if (!result.success) {
		throw new Error(`emufetch navigate error: ${result.error}`);
	}

	return result.url || url;
}

/**
 * Get screenshot of current browser state (returns PNG buffer)
 */
export async function emuScreenshot(): Promise<ArrayBuffer> {
	const response = await fetch(`${EMUFETCH_URL}/screenshot`);
	return response.arrayBuffer();
}

/**
 * Health check
 */
export async function emuHealth(): Promise<{
	status: string;
	browser: boolean;
}> {
	const response = await fetch(`${EMUFETCH_URL}/health`);
	return response.json() as Promise<{ status: string; browser: boolean }>;
}

/**
 * Check if emufetch service is available
 */
export async function isEmuFetchAvailable(): Promise<boolean> {
	try {
		const health = await emuHealth();
		return health.status === "ok" && health.browser;
	} catch {
		return false;
	}
}
