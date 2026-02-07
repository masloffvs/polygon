import { mkdir, readFile, writeFile } from "node:fs/promises";
import puppeteer, {
	type Browser,
	type HTTPRequest,
	type HTTPResponse,
	type Page,
} from "puppeteer";
import { parseTimelineResponse } from "./parser";
import type { Root } from "./types/account";

const PORT = 8918;
const COOKIES_FILE = "/app/cookies/twitter_cookies.json";
const GRAPHQL_PATTERN = /api\.x\.com\/graphql/;

let browser: Browser | null = null;
let page: Page | null = null;

interface GraphQLCapture {
	url: string;
	method: string;
	requestHeaders: Record<string, string>;
	requestBody?: unknown;
	responseStatus: number;
	responseHeaders: Record<string, string>;
	responseBody: unknown;
	timestamp: number;
	operationName?: string;
}

interface ScrapeResult {
	success: boolean;
	username?: string;
	captures: GraphQLCapture[];
	error?: string;
	duration?: number;
}

async function initBrowser(): Promise<void> {
	console.log("🚀 Launching browser (non-headless)...");

	browser = await puppeteer.launch({
		headless: false,
		args: [
			"--no-sandbox",
			"--disable-setuid-sandbox",
			"--disable-dev-shm-usage",
			"--disable-gpu",
			"--window-size=1920,1080",
			"--display=:99",
		],
		defaultViewport: {
			width: 1920,
			height: 1080,
		},
	});

	page = await browser.newPage();

	// Set realistic user agent
	await page.setUserAgent(
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
	);

	// Load cookies if exist
	await loadCookies();

	console.log("✅ Browser ready!");
}

async function loadCookies(): Promise<boolean> {
	if (!page) return false;

	try {
		const cookiesData = await readFile(COOKIES_FILE, "utf-8");
		const cookies = JSON.parse(cookiesData);
		await page.setCookie(...cookies);
		console.log(`🍪 Loaded ${cookies.length} cookies`);
		return true;
	} catch {
		console.log("📝 No cookies file found");
		return false;
	}
}

async function saveCookies(): Promise<void> {
	if (!page) return;

	try {
		const cookies = await page.cookies();
		await mkdir("/app/cookies", { recursive: true });
		await writeFile(COOKIES_FILE, JSON.stringify(cookies, null, 2));
		console.log(`🍪 Saved ${cookies.length} cookies`);
	} catch (err) {
		console.error("Failed to save cookies:", err);
	}
}

async function scrapeUserTimeline(
	username: string,
	options: {
		scrollCount?: number;
		waitTime?: number;
		captureTypes?: string[];
	} = {},
): Promise<ScrapeResult> {
	if (!page) {
		return { success: false, captures: [], error: "Browser not initialized" };
	}

	const startTime = Date.now();
	const captures: GraphQLCapture[] = [];
	const scrollCount = options.scrollCount || 3;
	const waitTime = options.waitTime || 3000;
	const captureTypes = options.captureTypes || []; // Empty = capture all

	// Set up request interception
	await page.setRequestInterception(true);

	const pendingRequests = new Map<
		string,
		{ request: HTTPRequest; data: Partial<GraphQLCapture> }
	>();

	// Handle requests
	const requestHandler = (request: HTTPRequest) => {
		const url = request.url();
		const method = request.method();

		// Skip OPTIONS (preflight) requests - they don't have data
		if (method === "OPTIONS") {
			request.continue();
			return;
		}

		if (GRAPHQL_PATTERN.test(url)) {
			const _requestId = `${url}-${Date.now()}`;

			// Extract operation name from URL
			const urlObj = new URL(url);
			const pathParts = urlObj.pathname.split("/");
			const operationName = pathParts[pathParts.length - 1];

			// Filter by capture types if specified
			if (
				captureTypes.length > 0 &&
				!captureTypes.some((t) => operationName.includes(t))
			) {
				request.continue();
				return;
			}

			const headers: Record<string, string> = {};
			const reqHeaders = request.headers();
			for (const [key, value] of Object.entries(reqHeaders)) {
				headers[key] = value;
			}

			let requestBody: unknown;
			if (request.method() === "POST") {
				try {
					requestBody = JSON.parse(request.postData() || "{}");
				} catch {
					requestBody = request.postData();
				}
			}

			pendingRequests.set(url, {
				request,
				data: {
					url,
					method: request.method(),
					requestHeaders: headers,
					requestBody,
					operationName,
					timestamp: Date.now(),
				},
			});
		}

		request.continue();
	};

	// Handle responses
	const responseHandler = async (response: HTTPResponse) => {
		const url = response.url();

		if (GRAPHQL_PATTERN.test(url)) {
			const pending = pendingRequests.get(url);
			if (pending) {
				try {
					const headers: Record<string, string> = {};
					const respHeaders = response.headers();
					for (const [key, value] of Object.entries(respHeaders)) {
						headers[key] = value;
					}

					let responseBody: unknown;
					try {
						responseBody = await response.json();
					} catch {
						try {
							responseBody = await response.text();
						} catch {
							responseBody = null;
						}
					}

					const capture: GraphQLCapture = {
						...pending.data,
						responseStatus: response.status(),
						responseHeaders: headers,
						responseBody,
					} as GraphQLCapture;

					captures.push(capture);
					console.log(
						`📦 Captured: ${pending.data.operationName} (${response.status()})`,
					);
				} catch (err) {
					console.error(`Failed to capture response for ${url}:`, err);
				}

				pendingRequests.delete(url);
			}
		}
	};

	page.on("request", requestHandler);
	page.on("response", responseHandler);

	try {
		// Navigate to user profile
		const profileUrl = `https://x.com/${username}`;
		console.log(`🌐 Navigating to ${profileUrl}`);

		await page.goto(profileUrl, {
			waitUntil: "networkidle2",
			timeout: 30000,
		});

		// Wait for initial content
		await new Promise((resolve) => setTimeout(resolve, waitTime));

		// Scroll to load more content
		for (let i = 0; i < scrollCount; i++) {
			console.log(`📜 Scrolling ${i + 1}/${scrollCount}...`);

			await page.evaluate(() => {
				window.scrollBy(0, window.innerHeight * 2);
			});

			await new Promise((resolve) => setTimeout(resolve, waitTime));
		}

		// Save cookies after successful scrape
		await saveCookies();

		// Clean up listeners
		page.off("request", requestHandler);
		page.off("response", responseHandler);
		await page.setRequestInterception(false);

		return {
			success: true,
			username,
			captures,
			duration: Date.now() - startTime,
		};
	} catch (err) {
		// Clean up listeners on error
		page.off("request", requestHandler);
		page.off("response", responseHandler);
		try {
			await page.setRequestInterception(false);
		} catch {}

		return {
			success: false,
			username,
			captures,
			error: err instanceof Error ? err.message : String(err),
			duration: Date.now() - startTime,
		};
	}
}

async function handleRequest(req: Request): Promise<Response> {
	const url = new URL(req.url);
	const corsHeaders = {
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type",
		"Content-Type": "application/json",
	};

	if (req.method === "OPTIONS") {
		return new Response(null, { headers: corsHeaders });
	}

	// Health check
	if (url.pathname === "/health") {
		return new Response(JSON.stringify({ status: "ok", browser: !!browser }), {
			headers: corsHeaders,
		});
	}

	// Scrape user timeline
	// POST /user/:username or POST /user with body { username: "..." }
	if (url.pathname.startsWith("/user") && req.method === "POST") {
		try {
			let username = url.pathname.replace("/user/", "").replace("/user", "");
			let options: {
				scrollCount?: number;
				waitTime?: number;
				captureTypes?: string[];
			} = {};

			if (req.headers.get("content-type")?.includes("application/json")) {
				const body = (await req.json()) as {
					username?: string;
					scrollCount?: number;
					waitTime?: number;
					captureTypes?: string[];
				};
				if (body.username) username = body.username;
				options = {
					scrollCount: body.scrollCount,
					waitTime: body.waitTime,
					captureTypes: body.captureTypes,
				};
			}

			if (!username) {
				return new Response(
					JSON.stringify({ success: false, error: "username is required" }),
					{ status: 400, headers: corsHeaders },
				);
			}

			console.log(`🔍 Scraping user: @${username}`);
			const result = await scrapeUserTimeline(username, options);

			return new Response(JSON.stringify(result), { headers: corsHeaders });
		} catch (err) {
			return new Response(
				JSON.stringify({
					success: false,
					error: err instanceof Error ? err.message : String(err),
				}),
				{ status: 500, headers: corsHeaders },
			);
		}
	}

	// GET shortcut for user timeline
	if (url.pathname.startsWith("/user/") && req.method === "GET") {
		const username = url.pathname.replace("/user/", "");
		const scrollCount = parseInt(url.searchParams.get("scrolls") || "3", 10);

		if (!username) {
			return new Response(
				JSON.stringify({ success: false, error: "username is required" }),
				{ status: 400, headers: corsHeaders },
			);
		}

		console.log(`🔍 Scraping user (GET): @${username}`);
		const result = await scrapeUserTimeline(username, { scrollCount });

		return new Response(JSON.stringify(result), { headers: corsHeaders });
	}

	// Scrape and parse user timeline (returns clean data)
	// GET /timeline/:username?scrolls=3
	if (url.pathname.startsWith("/timeline/") && req.method === "GET") {
		const username = url.pathname.replace("/timeline/", "");
		const scrollCount = parseInt(url.searchParams.get("scrolls") || "3", 10);

		if (!username) {
			return new Response(
				JSON.stringify({ success: false, error: "username is required" }),
				{ status: 400, headers: corsHeaders },
			);
		}

		console.log(`🔍 Scraping & parsing timeline: @${username}`);
		const result = await scrapeUserTimeline(username, { scrollCount });

		if (!result.success) {
			return new Response(JSON.stringify(result), {
				status: 500,
				headers: corsHeaders,
			});
		}

		// Parse into clean format
		try {
			const parsed = parseTimelineResponse(result as Root);

			return new Response(
				JSON.stringify({
					success: true,
					username,
					user: parsed.user,
					tweets: parsed.tweets,
					tweetCount: parsed.tweets.length,
					duration: result.duration,
				}),
				{ headers: corsHeaders },
			);
		} catch (parseErr) {
			console.error("Parse error:", parseErr);
			// Return raw data if parsing fails
			return new Response(
				JSON.stringify({
					success: true,
					username,
					parseError:
						parseErr instanceof Error ? parseErr.message : String(parseErr),
					raw: result,
				}),
				{ headers: corsHeaders },
			);
		}
	}

	// POST /timeline/:username - same but with options
	if (url.pathname.startsWith("/timeline") && req.method === "POST") {
		try {
			let username = url.pathname
				.replace("/timeline/", "")
				.replace("/timeline", "");
			let scrollCount = 3;
			let waitTime = 3000;

			if (req.headers.get("content-type")?.includes("application/json")) {
				const body = (await req.json()) as {
					username?: string;
					scrollCount?: number;
					waitTime?: number;
				};
				if (body.username) username = body.username;
				if (body.scrollCount) scrollCount = body.scrollCount;
				if (body.waitTime) waitTime = body.waitTime;
			}

			if (!username) {
				return new Response(
					JSON.stringify({ success: false, error: "username is required" }),
					{ status: 400, headers: corsHeaders },
				);
			}

			console.log(`🔍 Scraping & parsing timeline: @${username}`);
			const result = await scrapeUserTimeline(username, {
				scrollCount,
				waitTime,
			});

			if (!result.success) {
				return new Response(JSON.stringify(result), {
					status: 500,
					headers: corsHeaders,
				});
			}

			// Parse into clean format
			try {
				const parsed = parseTimelineResponse(result as Root);

				return new Response(
					JSON.stringify({
						success: true,
						username,
						user: parsed.user,
						tweets: parsed.tweets,
						tweetCount: parsed.tweets.length,
						duration: result.duration,
					}),
					{ headers: corsHeaders },
				);
			} catch (parseErr) {
				console.error("Parse error:", parseErr);
				return new Response(
					JSON.stringify({
						success: true,
						username,
						parseError:
							parseErr instanceof Error ? parseErr.message : String(parseErr),
						raw: result,
					}),
					{ headers: corsHeaders },
				);
			}
		} catch (err) {
			return new Response(
				JSON.stringify({
					success: false,
					error: err instanceof Error ? err.message : String(err),
				}),
				{ status: 500, headers: corsHeaders },
			);
		}
	}

	// Update cookies (POST raw cookies JSON array)
	if (url.pathname === "/cookies" && req.method === "POST") {
		try {
			const cookies = await req.json();

			if (!page) {
				return new Response(
					JSON.stringify({ success: false, error: "Browser not ready" }),
					{ status: 500, headers: corsHeaders },
				);
			}

			await page.setCookie(...(cookies as Parameters<Page["setCookie"]>[0][]));
			await saveCookies();

			return new Response(
				JSON.stringify({ success: true, message: "Cookies updated" }),
				{ headers: corsHeaders },
			);
		} catch (err) {
			return new Response(
				JSON.stringify({
					success: false,
					error: err instanceof Error ? err.message : String(err),
				}),
				{ status: 500, headers: corsHeaders },
			);
		}
	}

	// Get current cookies
	if (url.pathname === "/cookies" && req.method === "GET") {
		try {
			if (!page) {
				return new Response(
					JSON.stringify({ success: false, error: "Browser not ready" }),
					{ status: 500, headers: corsHeaders },
				);
			}

			const cookies = await page.cookies();
			return new Response(JSON.stringify(cookies), { headers: corsHeaders });
		} catch (err) {
			return new Response(
				JSON.stringify({
					success: false,
					error: err instanceof Error ? err.message : String(err),
				}),
				{ status: 500, headers: corsHeaders },
			);
		}
	}

	// Navigate to login page (manual login via VNC)
	if (url.pathname === "/login" && req.method === "POST") {
		try {
			if (!page) {
				return new Response(
					JSON.stringify({ success: false, error: "Browser not ready" }),
					{ status: 500, headers: corsHeaders },
				);
			}

			await page.goto("https://x.com/i/flow/login", {
				waitUntil: "networkidle2",
			});

			return new Response(
				JSON.stringify({
					success: true,
					message: "Navigated to login. Use VNC to complete login manually.",
					vnc: "Connect to port 5901",
				}),
				{ headers: corsHeaders },
			);
		} catch (err) {
			return new Response(
				JSON.stringify({
					success: false,
					error: err instanceof Error ? err.message : String(err),
				}),
				{ status: 500, headers: corsHeaders },
			);
		}
	}

	// Save current session cookies
	if (url.pathname === "/save-session" && req.method === "POST") {
		try {
			await saveCookies();
			return new Response(
				JSON.stringify({ success: true, message: "Session saved" }),
				{ headers: corsHeaders },
			);
		} catch (err) {
			return new Response(
				JSON.stringify({
					success: false,
					error: err instanceof Error ? err.message : String(err),
				}),
				{ status: 500, headers: corsHeaders },
			);
		}
	}

	// Screenshot (for debugging)
	if (url.pathname === "/screenshot") {
		if (!page) {
			return new Response(
				JSON.stringify({ success: false, error: "Browser not ready" }),
				{ status: 500, headers: corsHeaders },
			);
		}

		const screenshot = await page.screenshot({ type: "png" });
		return new Response(screenshot, {
			headers: { "Content-Type": "image/png" },
		});
	}

	// Current page URL
	if (url.pathname === "/current" && req.method === "GET") {
		if (!page) {
			return new Response(
				JSON.stringify({ success: false, error: "Browser not ready" }),
				{ status: 500, headers: corsHeaders },
			);
		}

		return new Response(
			JSON.stringify({
				url: page.url(),
				title: await page.title(),
			}),
			{ headers: corsHeaders },
		);
	}

	return new Response(JSON.stringify({ error: "Not found" }), {
		status: 404,
		headers: corsHeaders,
	});
}

async function main() {
	await initBrowser();

	console.log(`🐦 xscraper server starting on port ${PORT}...`);

	Bun.serve({
		port: PORT,
		fetch: handleRequest,
		idleTimeout: 120, // 2 minutes for long scraping operations
	});

	console.log(`✅ xscraper ready at http://0.0.0.0:${PORT}`);
	console.log(`
📚 API Endpoints:

  🔍 SCRAPING (RAW - returns GraphQL captures):
  POST /user/:username    - Scrape user timeline, capture raw GraphQL
                            Body: { scrollCount?: 3, waitTime?: 3000, captureTypes?: ["UserTweets"] }
  GET  /user/:username    - Same as POST (quick access)
                            Query: ?scrolls=3

  📦 SCRAPING (PARSED - returns clean tweets):
  GET  /timeline/:username    - Scrape & parse timeline into clean format
                                Query: ?scrolls=3
  POST /timeline/:username    - Same with options
                                Body: { scrollCount?: 3, waitTime?: 3000 }

  🍪 COOKIES/AUTH:
  POST /login             - Navigate to login page (complete via VNC)
  POST /cookies           - Set cookies (JSON array)
  GET  /cookies           - Get current cookies
  POST /save-session      - Save current session to file

  🔧 DEBUG:
  GET  /screenshot        - Get current page screenshot
  GET  /current           - Get current page URL
  GET  /health            - Health check
`);
}

// Graceful shutdown
process.on("SIGINT", async () => {
	console.log("\n🛑 Shutting down...");
	if (browser) {
		await browser.close();
	}
	process.exit(0);
});

process.on("SIGTERM", async () => {
	console.log("\n🛑 Shutting down...");
	if (browser) {
		await browser.close();
	}
	process.exit(0);
});

main().catch(console.error);
