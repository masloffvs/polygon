import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";

const DOWNLOADS_DIR = "/app/downloads";
const COOKIES_FILE = "/app/cookies/cookies.txt";

// Ensure directories exist
await mkdir(DOWNLOADS_DIR, { recursive: true });
await mkdir("/app/cookies", { recursive: true });

interface DownloadRequest {
	url: string;
	format?: string;
	audioOnly?: boolean;
	cookies?: boolean;
	extraArgs?: string[];
}

interface DownloadJob {
	id: string;
	url: string;
	status: "pending" | "downloading" | "completed" | "failed";
	filename?: string;
	error?: string;
	startedAt: Date;
	completedAt?: Date;
}

const jobs = new Map<string, DownloadJob>();

async function downloadVideo(job: DownloadJob, options: DownloadRequest) {
	job.status = "downloading";

	try {
		const args: string[] = [
			"yt-dlp",
			"--no-playlist",
			"-o",
			`${DOWNLOADS_DIR}/%(title)s.%(ext)s`,
			"--print",
			"after_move:filepath",
		];

		// Add cookies if requested and file exists
		if (options.cookies) {
			try {
				await readFile(COOKIES_FILE);
				args.push("--cookies", COOKIES_FILE);
			} catch {
				// No cookies file, continue without
			}
		}

		// Audio only
		if (options.audioOnly) {
			args.push("-x", "--audio-format", "mp3");
		}

		// Custom format
		if (options.format) {
			args.push("-f", options.format);
		}

		// Extra args
		if (options.extraArgs) {
			args.push(...options.extraArgs);
		}

		args.push(options.url);

		const result = await $`${args}`.text();
		const filepath = result.trim().split("\n").pop() || "";

		job.status = "completed";
		job.filename = filepath.split("/").pop();
		job.completedAt = new Date();
	} catch (err) {
		job.status = "failed";
		job.error = err instanceof Error ? err.message : String(err);
		job.completedAt = new Date();
	}
}

const server = Bun.serve({
	port: 8917,
	async fetch(req) {
		const url = new URL(req.url);
		const path = url.pathname;

		// CORS headers
		const corsHeaders = {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type",
		};

		if (req.method === "OPTIONS") {
			return new Response(null, { headers: corsHeaders });
		}

		// Health check
		if (path === "/health" && req.method === "GET") {
			return Response.json(
				{ status: "ok", service: "ytdlp-api" },
				{ headers: corsHeaders },
			);
		}

		// Get yt-dlp version
		if (path === "/version" && req.method === "GET") {
			try {
				const version = await $`yt-dlp --version`.text();
				return Response.json(
					{ version: version.trim() },
					{ headers: corsHeaders },
				);
			} catch (_err) {
				return Response.json(
					{ error: "Failed to get version" },
					{ status: 500, headers: corsHeaders },
				);
			}
		}

		// Update cookies
		if (path === "/cookies" && req.method === "POST") {
			try {
				const body = await req.text();
				await writeFile(COOKIES_FILE, body);
				return Response.json(
					{ success: true, message: "Cookies updated" },
					{ headers: corsHeaders },
				);
			} catch (err) {
				return Response.json(
					{
						error:
							err instanceof Error ? err.message : "Failed to save cookies",
					},
					{ status: 500, headers: corsHeaders },
				);
			}
		}

		// Get cookies
		if (path === "/cookies" && req.method === "GET") {
			try {
				const cookies = await readFile(COOKIES_FILE, "utf-8");
				return new Response(cookies, {
					headers: { ...corsHeaders, "Content-Type": "text/plain" },
				});
			} catch {
				return Response.json(
					{ error: "No cookies file found" },
					{ status: 404, headers: corsHeaders },
				);
			}
		}

		// Start download
		if (path === "/download" && req.method === "POST") {
			try {
				const body: DownloadRequest = await req.json();

				if (!body.url) {
					return Response.json(
						{ error: "URL is required" },
						{ status: 400, headers: corsHeaders },
					);
				}

				const jobId = crypto.randomUUID();
				const job: DownloadJob = {
					id: jobId,
					url: body.url,
					status: "pending",
					startedAt: new Date(),
				};

				jobs.set(jobId, job);

				// Start download in background
				downloadVideo(job, body);

				return Response.json(
					{ jobId, status: "pending" },
					{ headers: corsHeaders },
				);
			} catch (err) {
				return Response.json(
					{ error: err instanceof Error ? err.message : "Invalid request" },
					{ status: 400, headers: corsHeaders },
				);
			}
		}

		// Get job status
		if (path.startsWith("/job/") && req.method === "GET") {
			const jobId = path.replace("/job/", "");
			const job = jobs.get(jobId);

			if (!job) {
				return Response.json(
					{ error: "Job not found" },
					{ status: 404, headers: corsHeaders },
				);
			}

			return Response.json(job, { headers: corsHeaders });
		}

		// List all jobs
		if (path === "/jobs" && req.method === "GET") {
			return Response.json(Array.from(jobs.values()), { headers: corsHeaders });
		}

		// List downloaded files
		if (path === "/files" && req.method === "GET") {
			try {
				const files = await readdir(DOWNLOADS_DIR);
				return Response.json({ files }, { headers: corsHeaders });
			} catch {
				return Response.json({ files: [] }, { headers: corsHeaders });
			}
		}

		// Get/download file
		if (path.startsWith("/files/") && req.method === "GET") {
			const filename = decodeURIComponent(path.replace("/files/", ""));
			const filepath = join(DOWNLOADS_DIR, filename);

			try {
				const file = Bun.file(filepath);
				if (!(await file.exists())) {
					return Response.json(
						{ error: "File not found" },
						{ status: 404, headers: corsHeaders },
					);
				}

				return new Response(file, {
					headers: {
						...corsHeaders,
						"Content-Disposition": `attachment; filename="${filename}"`,
					},
				});
			} catch {
				return Response.json(
					{ error: "File not found" },
					{ status: 404, headers: corsHeaders },
				);
			}
		}

		// Delete file
		if (path.startsWith("/files/") && req.method === "DELETE") {
			const filename = decodeURIComponent(path.replace("/files/", ""));
			const filepath = join(DOWNLOADS_DIR, filename);

			try {
				await unlink(filepath);
				return Response.json({ success: true }, { headers: corsHeaders });
			} catch {
				return Response.json(
					{ error: "File not found" },
					{ status: 404, headers: corsHeaders },
				);
			}
		}

		// Get video info without downloading
		if (path === "/info" && req.method === "POST") {
			try {
				const body: { url: string } = await req.json();

				if (!body.url) {
					return Response.json(
						{ error: "URL is required" },
						{ status: 400, headers: corsHeaders },
					);
				}

				const info =
					await $`yt-dlp --dump-json --no-download ${body.url}`.json();
				return Response.json(info, { headers: corsHeaders });
			} catch (err) {
				return Response.json(
					{ error: err instanceof Error ? err.message : "Failed to get info" },
					{ status: 500, headers: corsHeaders },
				);
			}
		}

		// Update yt-dlp
		if (path === "/update" && req.method === "POST") {
			try {
				const result =
					await $`pip3 install --break-system-packages -U yt-dlp`.text();
				return Response.json(
					{ success: true, output: result },
					{ headers: corsHeaders },
				);
			} catch (err) {
				return Response.json(
					{ error: err instanceof Error ? err.message : "Failed to update" },
					{ status: 500, headers: corsHeaders },
				);
			}
		}

		return Response.json(
			{ error: "Not found" },
			{ status: 404, headers: corsHeaders },
		);
	},
});

console.log(`🎬 yt-dlp API server running on port ${server.port}`);
