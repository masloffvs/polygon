import puppeteer, { type Browser, type Page } from "puppeteer";

const PORT = 8916;

let browser: Browser | null = null;
let page: Page | null = null;

interface EmuRequest {
	url: string;
	method: "GET" | "POST";
	body?: Record<string, unknown>;
	headers?: Record<string, string>;
}

interface EmuResponse {
	success: boolean;
	status?: number;
	statusText?: string;
	headers?: Record<string, string>;
	body?: unknown;
	error?: string;
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
			// Для работы в Docker с дисплеем
			"--display=:99",
		],
		defaultViewport: {
			width: 1920,
			height: 1080,
		},
	});

	page = await browser.newPage();

	// Устанавливаем user-agent как реальный браузер
	await page.setUserAgent(
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
	);

	console.log("✅ Browser ready!");
}

async function executeRequest(req: EmuRequest): Promise<EmuResponse> {
	if (!page) {
		return { success: false, error: "Browser not initialized" };
	}

	try {
		// Выполняем fetch в контексте браузера
		const result = await page.evaluate(async (request: EmuRequest) => {
			try {
				const fetchOptions: RequestInit = {
					method: request.method,
					headers: {
						"Content-Type": "application/json",
						...request.headers,
					},
				};

				if (request.method === "POST" && request.body) {
					fetchOptions.body = JSON.stringify(request.body);
				}

				const response = await fetch(request.url, fetchOptions);

				// Собираем заголовки
				const headers: Record<string, string> = {};
				response.headers.forEach((value, key) => {
					headers[key] = value;
				});

				// Пробуем распарсить как JSON, иначе как текст
				let body: unknown;
				const contentType = response.headers.get("content-type");
				if (contentType?.includes("application/json")) {
					body = await response.json();
				} else {
					body = await response.text();
				}

				return {
					success: true,
					status: response.status,
					statusText: response.statusText,
					headers,
					body,
				};
			} catch (err) {
				return {
					success: false,
					error: err instanceof Error ? err.message : String(err),
				};
			}
		}, req as EmuRequest);

		return result as EmuResponse;
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

async function handleRequest(req: Request): Promise<Response> {
	const url = new URL(req.url);

	// Health check
	if (url.pathname === "/health") {
		return new Response(JSON.stringify({ status: "ok", browser: !!browser }), {
			headers: { "Content-Type": "application/json" },
		});
	}

	// Main fetch endpoint
	if (url.pathname === "/fetch" && req.method === "POST") {
		try {
			const body = (await req.json()) as EmuRequest;

			if (!body.url) {
				return new Response(
					JSON.stringify({ success: false, error: "url is required" }),
					{
						status: 400,
						headers: { "Content-Type": "application/json" },
					},
				);
			}

			if (!body.method) {
				body.method = "GET";
			}

			console.log(`📡 ${body.method} ${body.url}`);
			const result = await executeRequest(body);

			return new Response(JSON.stringify(result), {
				headers: { "Content-Type": "application/json" },
			});
		} catch (err) {
			return new Response(
				JSON.stringify({
					success: false,
					error: err instanceof Error ? err.message : String(err),
				}),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				},
			);
		}
	}

	// Navigate to URL (для установки cookies и прочего)
	if (url.pathname === "/navigate" && req.method === "POST") {
		try {
			const body = (await req.json()) as { url: string };

			if (!page) {
				return new Response(
					JSON.stringify({ success: false, error: "Browser not ready" }),
					{
						status: 500,
						headers: { "Content-Type": "application/json" },
					},
				);
			}

			await page.goto(body.url, { waitUntil: "networkidle2" });

			return new Response(JSON.stringify({ success: true, url: page.url() }), {
				headers: { "Content-Type": "application/json" },
			});
		} catch (err) {
			return new Response(
				JSON.stringify({
					success: false,
					error: err instanceof Error ? err.message : String(err),
				}),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				},
			);
		}
	}

	// Open URL and return page content (real navigation!)
	if (url.pathname === "/open" && req.method === "POST") {
		try {
			const body = (await req.json()) as {
				url: string;
				waitFor?: string; // CSS selector to wait for
				waitTimeout?: number;
				returnType?: "html" | "text" | "json"; // what to return
			};

			if (!page) {
				return new Response(
					JSON.stringify({ success: false, error: "Browser not ready" }),
					{
						status: 500,
						headers: { "Content-Type": "application/json" },
					},
				);
			}

			if (!body.url) {
				return new Response(
					JSON.stringify({ success: false, error: "url is required" }),
					{
						status: 400,
						headers: { "Content-Type": "application/json" },
					},
				);
			}

			console.log(`🌐 Opening ${body.url}`);

			// Реальная навигация браузера
			const response = await page.goto(body.url, {
				waitUntil: "networkidle2",
				timeout: body.waitTimeout || 30000,
			});

			// Ждём конкретный элемент если указан
			if (body.waitFor) {
				await page.waitForSelector(body.waitFor, {
					timeout: body.waitTimeout || 10000,
				});
			}

			// Получаем контент в зависимости от типа
			let content: unknown;
			const returnType = body.returnType || "html";

			if (returnType === "json") {
				// Пробуем распарсить JSON из body или pre тега
				content = await page.evaluate(() => {
					const pre = document.querySelector("pre");
					const text = pre ? pre.textContent : document.body.textContent;
					try {
						return JSON.parse(text || "");
					} catch {
						return text;
					}
				});
			} else if (returnType === "text") {
				content = await page.evaluate(() => document.body.innerText);
			} else {
				// html
				content = await page.content();
			}

			return new Response(
				JSON.stringify({
					success: true,
					status: response?.status() || 200,
					url: page.url(),
					title: await page.title(),
					body: content,
				}),
				{
					headers: { "Content-Type": "application/json" },
				},
			);
		} catch (err) {
			return new Response(
				JSON.stringify({
					success: false,
					error: err instanceof Error ? err.message : String(err),
				}),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				},
			);
		}
	}

	// GET shortcut - just open URL via query param
	if (url.pathname === "/open" && req.method === "GET") {
		const targetUrl = url.searchParams.get("url");
		const returnType = url.searchParams.get("type") || "html";

		if (!targetUrl) {
			return new Response(
				JSON.stringify({
					success: false,
					error: "url query param is required",
				}),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		if (!page) {
			return new Response(
				JSON.stringify({ success: false, error: "Browser not ready" }),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		console.log(`🌐 Opening (GET) ${targetUrl}`);

		try {
			const response = await page.goto(targetUrl, {
				waitUntil: "networkidle2",
				timeout: 30000,
			});

			let content: unknown;
			if (returnType === "json") {
				content = await page.evaluate(() => {
					const pre = document.querySelector("pre");
					const text = pre ? pre.textContent : document.body.textContent;
					try {
						return JSON.parse(text || "");
					} catch {
						return text;
					}
				});
			} else if (returnType === "text") {
				content = await page.evaluate(() => document.body.innerText);
			} else {
				content = await page.content();
			}

			return new Response(
				JSON.stringify({
					success: true,
					status: response?.status() || 200,
					url: page.url(),
					title: await page.title(),
					body: content,
				}),
				{
					headers: { "Content-Type": "application/json" },
				},
			);
		} catch (err) {
			return new Response(
				JSON.stringify({
					success: false,
					error: err instanceof Error ? err.message : String(err),
				}),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				},
			);
		}
	}

	// Screenshot (для дебага)
	if (url.pathname === "/screenshot") {
		if (!page) {
			return new Response(
				JSON.stringify({ success: false, error: "Browser not ready" }),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		const screenshot = await page.screenshot({ type: "png" });
		return new Response(screenshot, {
			headers: { "Content-Type": "image/png" },
		});
	}

	return new Response(JSON.stringify({ error: "Not found" }), {
		status: 404,
		headers: { "Content-Type": "application/json" },
	});
}

async function main() {
	await initBrowser();

	console.log(`🌐 emufetch server starting on port ${PORT}...`);

	Bun.serve({
		port: PORT,
		fetch: handleRequest,
	});

	console.log(`✅ emufetch ready at http://0.0.0.0:${PORT}`);
	console.log(`
📚 API Endpoints:
  POST /fetch     - Execute fetch in browser context (uses JS fetch API)
                    Body: { url: string, method: "GET"|"POST", body?: {}, headers?: {} }
  
  POST /open      - REAL navigation! Opens URL in browser tab and returns content
                    Body: { url: string, waitFor?: "css-selector", returnType?: "html"|"text"|"json" }
  
  GET  /open?url=...&type=html|text|json  - Same as POST /open but via GET
  
  POST /navigate  - Navigate browser to URL (sets cookies, etc)
                    Body: { url: string }
  
  GET  /screenshot - Get current page screenshot (PNG)
  GET  /health    - Health check
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
