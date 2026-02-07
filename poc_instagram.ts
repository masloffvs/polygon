/**
 * Instagram Search POC with Login Support
 * Run: bun run poc_instagram.ts
 *
 * Usage:
 *   - With existing session: Set INSTAGRAM_COOKIES below
 *   - Fresh login: Set INSTAGRAM_USERNAME and INSTAGRAM_PASSWORD env vars
 */

import hexToArrayBuffer from "hex-to-array-buffer";
import sealBox from "tweetnacl-sealedbox-js";

// ═══════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

const INSTAGRAM_USERNAME = process.env.INSTAGRAM_USERNAME || "berl.off";
const INSTAGRAM_PASSWORD = process.env.INSTAGRAM_PASSWORD || "bonMasloff16*";

// Existing session cookies (if you already have them) - leave empty to force login
const INSTAGRAM_COOKIES = {
	ds_user_id: "",
	sessionid: "",
};

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

interface SessionData {
	id: string;
	user: {
		id: number;
		username?: string;
	};
}

interface InstagramEncryptionKey {
	public: string;
	id: number;
	version: number;
}

interface VerificationData {
	csrf: string;
	key: InstagramEncryptionKey;
}

interface EncryptedPassword {
	timestamp: number;
	cipher: string;
}

interface TwoFactorInformation {
	identifier: string;
	user: {
		username: string;
		id: number;
	};
	device: string;
}

class TwoFactorRequired extends Error {
	info: TwoFactorInformation;

	constructor(info: TwoFactorInformation) {
		super("Two factor authentication is enabled for this account.");
		this.info = info;
	}
}

// ═══════════════════════════════════════════════════════════════════
// LOGIN FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

const encoder = new TextEncoder();

async function fetchVerification(): Promise<VerificationData> {
	const response = await fetch(
		"https://www.instagram.com/api/v1/web/data/shared_data/",
		{
			headers: {
				"Sec-Fetch-Site": "same-origin",
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
			},
		},
	);

	const data = (await response.json()) as {
		config: { csrf_token: string };
		encryption: { key_id: string; public_key: string; version: string };
	};

	return {
		csrf: data.config.csrf_token,
		key: {
			id: parseInt(data.encryption.key_id, 10),
			public: data.encryption.public_key,
			version: parseInt(data.encryption.version, 10),
		},
	};
}

async function encryptPassword({
	password,
	key,
	time,
}: {
	password: string;
	key: InstagramEncryptionKey;
	time?: Date;
}): Promise<EncryptedPassword> {
	const passwordBuffer = encoder.encode(password);
	const timeString = ((time ?? new Date()).getTime() / 1000).toFixed(0);

	if (key.public.length !== 64) throw new Error("Wrong public key hex.");
	const keyBuffer = new Uint8Array(hexToArrayBuffer(key.public));

	const target = new Uint8Array(100 + passwordBuffer.length);
	target.set([1, key.id]);

	const algorithmName = "AES-GCM";
	const rawKeys = await crypto.subtle.generateKey(
		{ length: keyBuffer.byteLength * 8, name: algorithmName },
		true,
		["encrypt", "decrypt"],
	);

	const iv = new Uint8Array(12);
	const exportedKeys = await crypto.subtle.exportKey("raw", rawKeys);
	const cipher = new Uint8Array(
		await crypto.subtle.encrypt(
			{
				additionalData: encoder.encode(timeString),
				iv,
				name: algorithmName,
				tagLength: 16 * 8,
			},
			rawKeys,
			passwordBuffer.buffer,
		),
	);

	const box = sealBox.seal(new Uint8Array(exportedKeys), keyBuffer);
	if (box.length !== 48 + 32)
		throw new Error("Encrypted key is the wrong length");

	target.set([box.length, (box.length >> 8) & 255], 2);
	target.set(box, 4);
	target.set(cipher.slice(-16), 84);
	target.set(cipher.slice(0, -16), 100);

	const converted: string[] = [];
	target.forEach((element) => converted.push(String.fromCharCode(element)));

	return {
		timestamp: parseInt(timeString, 10),
		cipher: btoa(converted.join("")),
	};
}

function getSessionId(response: Response): string {
	const identifier = "sessionid=";
	const identify = (cookie: string) => cookie.startsWith(identifier);

	const cookie = response.headers.getSetCookie().find(identify);

	if (!cookie) throw new Error("No sessionid cookie found");

	return cookie.split(";").find(identify)?.substring(identifier.length);
}

function hasJsonBody(response: Response): boolean {
	const contentType = response.headers.get("content-type");
	return contentType?.includes("application/json") ?? false;
}

async function login({
	user,
	password,
	verification,
}: {
	user: string;
	password: EncryptedPassword;
	verification: VerificationData;
}): Promise<SessionData> {
	const data = new FormData();
	data.set("username", user);
	data.set(
		"enc_password",
		`#PWD_INSTAGRAM_BROWSER:${verification.key.version}:${password.timestamp}:${password.cipher}`,
	);

	const response = await fetch(
		"https://www.instagram.com/api/v1/web/accounts/login/ajax/",
		{
			method: "POST",
			body: data,
			headers: {
				"X-CSRFToken": verification.csrf,
				"Sec-Fetch-Site": "same-origin",
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
			},
		},
	);

	if (!response.ok) {
		if (hasJsonBody(response)) {
			const data = (await response.json()) as {
				message?: string;
				status?: string;
				checkpoint_url?: string;
				two_factor_required?: boolean;
				two_factor_info?: {
					pk: number;
					username: string;
					two_factor_identifier: string;
					device_id: string;
				};
			};

			if (data.two_factor_required) {
				throw new TwoFactorRequired({
					user: {
						id: data.two_factor_info?.pk,
						username: data.two_factor_info?.username,
					},
					identifier: data.two_factor_info?.two_factor_identifier,
					device: data.two_factor_info?.device_id,
				});
			}

			// Handle checkpoint_required - Instagram security check
			if (data.message === "checkpoint_required" || data.checkpoint_url) {
				throw new Error(
					`🔒 Instagram Security Check Required!\n\n` +
						`Instagram detected suspicious login activity.\n` +
						`Please do ONE of the following:\n\n` +
						`1. Open Instagram app/web on your phone and approve the login\n` +
						`2. Check your email for a verification link from Instagram\n` +
						`3. After approving, get fresh cookies from browser:\n` +
						`   - Login to Instagram in browser\n` +
						`   - Open DevTools > Application > Cookies\n` +
						`   - Copy 'sessionid' and 'ds_user_id' values\n` +
						`   - Paste them in INSTAGRAM_COOKIES in this file\n\n` +
						`Checkpoint URL: ${data.checkpoint_url || "N/A"}`,
				);
			}

			throw new Error(data.message ?? "Login attempted failed.");
		} else {
			throw new Error(await response.text());
		}
	}

	const result = (await response.json()) as {
		authenticated: boolean;
		userId: number;
	};

	if (result.authenticated !== true) {
		throw new Error("Authentication failed. Check your credentials.");
	}

	return {
		id: getSessionId(response),
		user: { id: result.userId },
	};
}

async function _verify2FA({
	verification,
	info,
	code,
}: {
	info: TwoFactorInformation;
	verification: VerificationData;
	code: string;
}): Promise<SessionData> {
	const body = new FormData();
	body.set("username", info.user.username);
	body.set("identifier", info.identifier);
	body.set("verificationCode", code);

	const response = await fetch(
		"https://www.instagram.com/api/v1/web/accounts/login/ajax/two_factor/",
		{
			method: "POST",
			headers: {
				"X-CSRFToken": verification.csrf,
				"Sec-Fetch-Site": "same-origin",
				"X-Mid": info.device,
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
			},
			body,
		},
	);

	if (!response.ok) {
		const message = hasJsonBody(response)
			? (await response.json()).message
			: await response.text();
		throw Error(message ?? "Two factor authentication failed.");
	}

	return {
		id: getSessionId(response),
		user: { id: info.user.id, username: info.user.username },
	};
}

// ═══════════════════════════════════════════════════════════════════
// SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

async function getOrCreateSession(): Promise<string> {
	// If we have existing cookies, use them
	if (INSTAGRAM_COOKIES.sessionid) {
		console.log("🔑 Using existing session cookie");
		return buildCookieString(INSTAGRAM_COOKIES);
	}

	// Otherwise try to login
	if (!INSTAGRAM_USERNAME || !INSTAGRAM_PASSWORD) {
		throw new Error(
			"No session cookie and no credentials provided. Set INSTAGRAM_USERNAME and INSTAGRAM_PASSWORD env vars.",
		);
	}

	console.log("🔐 Logging in to Instagram...");

	const verification = await fetchVerification();
	console.log("✅ Got CSRF token and encryption keys");

	const encryptedPassword = await encryptPassword({
		password: INSTAGRAM_PASSWORD,
		key: verification.key,
	});
	console.log("✅ Password encrypted");

	try {
		const session = await login({
			user: INSTAGRAM_USERNAME,
			password: encryptedPassword,
			verification,
		});

		console.log(`✅ Logged in as user ID: ${session.user.id}`);
		console.log(`📝 Session ID: ${session.id}`);
		console.log(
			"\n💡 Save this sessionid to INSTAGRAM_COOKIES to skip login next time!\n",
		);

		return `sessionid=${session.id}; ds_user_id=${session.user.id}`;
	} catch (error) {
		if (error instanceof TwoFactorRequired) {
			console.log("\n⚠️  2FA Required!");
			console.log(`   Username: ${error.info.user.username}`);
			console.log(`   Identifier: ${error.info.identifier}`);
			console.log(
				"\n   To verify, call verify2FA() with the code from your authenticator app.\n",
			);
			throw error;
		}
		throw error;
	}
}

const buildCookieString = (cookies: Record<string, string>): string =>
	Object.entries(cookies)
		.map(([key, value]) => `${key}=${value}`)
		.join("; ");

const INSTAGRAM_APP_ID = "936619743392459";

interface InstagramPost {
	id: string;
	code: string;
	caption?: string;
	username: string;
	timestamp: number;
	likeCount: number;
	commentCount: number;
	mediaUrl?: string;
}

async function searchInstagram(
	query: string,
	cookie: string,
	maxId?: string,
): Promise<{ posts: InstagramPost[]; nextMaxId?: string }> {
	const params = new URLSearchParams({
		enable_metadata: "true",
		query: query,
		search_session_id: "",
	});

	if (maxId) {
		params.set("next_max_id", maxId);
	}

	const url = `https://www.instagram.com/api/v1/fbsearch/web/top_serp/?${params.toString()}`;

	console.log(`\n🔍 Searching Instagram for: ${query}`);
	console.log(`📡 URL: ${url}\n`);

	const response = await fetch(url, {
		method: "GET",
		redirect: "manual",
		headers: {
			"x-ig-app-id": INSTAGRAM_APP_ID,
			Cookie: cookie,
			"User-Agent":
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
			Accept: "*/*",
			"Accept-Language": "en-US,en;q=0.9",
			"Sec-Fetch-Site": "same-origin",
			"Sec-Fetch-Mode": "cors",
		},
	});

	// Handle redirects - likely means session is invalid
	if (response.status === 302 || response.status === 301) {
		const location = response.headers.get("Location");
		throw new Error(`Session invalid - redirected to: ${location}`);
	}

	if (!response.ok) {
		throw new Error(`HTTP ${response.status}: ${response.statusText}`);
	}

	const data = await response.json();

	// Debug: print raw structure
	console.log("📦 Raw response keys:", Object.keys(data));

	const posts: InstagramPost[] = [];

	// Parse media items from response
	if (data.media_grid?.sections) {
		for (const section of data.media_grid.sections) {
			if (section.layout_content?.medias) {
				for (const item of section.layout_content.medias) {
					const media = item.media;
					if (media) {
						posts.push({
							id: media.pk || media.id,
							code: media.code,
							caption: media.caption?.text || "",
							username: media.user?.username || "unknown",
							timestamp: media.taken_at,
							likeCount: media.like_count || 0,
							commentCount: media.comment_count || 0,
							mediaUrl: media.image_versions2?.candidates?.[0]?.url,
						});
					}
				}
			}
		}
	}

	// Alternative: check for inform_module (hashtag results)
	if (data.inform_module?.media_infos) {
		for (const info of data.inform_module.media_infos) {
			posts.push({
				id: info.pk,
				code: info.code,
				caption: info.caption?.text || "",
				username: info.user?.username || "unknown",
				timestamp: info.taken_at,
				likeCount: info.like_count || 0,
				commentCount: info.comment_count || 0,
				mediaUrl: info.image_versions2?.candidates?.[0]?.url,
			});
		}
	}

	return {
		posts,
		nextMaxId: data.next_max_id,
	};
}

async function main() {
	console.log("═══════════════════════════════════════════");
	console.log("       📸 Instagram Search POC");
	console.log("═══════════════════════════════════════════");

	try {
		// Get or create session
		const cookie = await getOrCreateSession();

		const result = await searchInstagram("#polymarket", cookie);

		console.log(`\n✅ Found ${result.posts.length} posts\n`);

		if (result.posts.length > 0) {
			console.log("─────────────────────────────────────────");
			for (const post of result.posts.slice(0, 10)) {
				const date = new Date(post.timestamp * 1000).toISOString();
				console.log(`👤 @${post.username}`);
				console.log(`📅 ${date}`);
				console.log(
					`❤️  ${post.likeCount} likes | 💬 ${post.commentCount} comments`,
				);
				console.log(
					`📝 ${post.caption?.substring(0, 100)}${post.caption && post.caption.length > 100 ? "..." : ""}`,
				);
				console.log(`🔗 https://instagram.com/p/${post.code}`);
				console.log("─────────────────────────────────────────");
			}
		}

		if (result.nextMaxId) {
			console.log(`\n📄 Next page ID: ${result.nextMaxId}`);
		}

		// Save full response for debugging
		await Bun.write(
			"poc_instagram_output.json",
			JSON.stringify(result, null, 2),
		);
		console.log("\n💾 Full output saved to poc_instagram_output.json");
	} catch (error) {
		console.error("\n❌ Error:", error);
	}
}

main();
