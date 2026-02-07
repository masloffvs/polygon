import type {
	Capture,
	Medum,
	Result2,
	Result3,
	Root,
	UserMention,
} from "./types/account";
import type {
	ParsedMedia,
	ParsedTimeline,
	ParsedTweet,
	ParsedUser,
} from "./types/parsed";

/**
 * Parse raw Twitter GraphQL response into clean types
 */
export function parseTimelineResponse(response: Root): ParsedTimeline {
	const tweets: ParsedTweet[] = [];
	let timelineUser: ParsedUser | undefined;

	for (const capture of response.captures) {
		// Skip non-timeline captures
		if (
			!capture.operationName?.includes("UserTweets") &&
			!capture.operationName?.includes("UserMedia") &&
			!capture.operationName?.includes("UserWithProfileTweets")
		) {
			continue;
		}

		const data = capture.responseBody?.data;
		if (!data?.user?.result?.timeline?.timeline?.instructions) continue;

		const instructions = data.user.result.timeline.timeline.instructions;

		for (const instruction of instructions) {
			if (instruction.type !== "TimelineAddEntries" || !instruction.entries)
				continue;

			for (const entry of instruction.entries) {
				// Skip cursors and other non-tweet entries
				if (!entry.entryId.startsWith("tweet-")) continue;

				const tweetResult = entry.content?.itemContent?.tweet_results?.result;
				if (!tweetResult) continue;

				const parsed = parseTweet(tweetResult);
				if (parsed) {
					tweets.push(parsed);

					// Extract user from first tweet if not set
					if (!timelineUser && parsed.author) {
						timelineUser = parsed.author;
					}
				}
			}
		}
	}

	// Dedupe by tweet id
	const seen = new Set<string>();
	const uniqueTweets = tweets.filter((t) => {
		if (seen.has(t.id)) return false;
		seen.add(t.id);
		return true;
	});

	// Sort by date (newest first)
	uniqueTweets.sort(
		(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
	);

	return {
		tweets: uniqueTweets,
		user: timelineUser,
	};
}

/**
 * Parse a single tweet result
 */
export function parseTweet(result: Result2): ParsedTweet | null {
	try {
		// Handle TweetWithVisibilityResults wrapper
		const tweet = (result as any).tweet || result;

		if (tweet.__typename === "TweetTombstone") return null;
		if (!tweet.legacy || !tweet.core?.user_results?.result) return null;

		const legacy = tweet.legacy;
		const userResult = tweet.core.user_results.result;

		const author = parseUser(userResult);
		if (!author) return null;

		// Parse media
		const media = parseMedia(
			legacy.extended_entities?.media || legacy.entities?.media || [],
		);

		// Parse mentions
		const mentions = (legacy.entities?.user_mentions || []).map(
			(m: UserMention) => ({
				id: m.id_str,
				username: m.screen_name,
				name: m.name,
			}),
		);

		// Parse quoted tweet
		let quotedTweet: ParsedTweet | undefined;
		if (tweet.quoted_status_result?.result) {
			quotedTweet = parseTweet(tweet.quoted_status_result.result) || undefined;
		}

		// Parse view count
		let viewCount = 0;
		if (tweet.views?.count) {
			viewCount = parseInt(tweet.views.count, 10) || 0;
		}

		return {
			id: tweet.rest_id || legacy.id_str,
			text: legacy.full_text,
			createdAt: legacy.created_at,
			lang: legacy.lang,
			source: cleanSource(tweet.source),

			likeCount: legacy.favorite_count || 0,
			retweetCount: legacy.retweet_count || 0,
			replyCount: legacy.reply_count || 0,
			quoteCount: legacy.quote_count || 0,
			viewCount,
			bookmarkCount: legacy.bookmark_count || 0,

			isLiked: legacy.favorited || false,
			isRetweeted: legacy.retweeted || false,
			isBookmarked: legacy.bookmarked || false,

			author,
			media,
			mentions,
			quotedTweet,

			conversationId: legacy.conversation_id_str,
			inReplyToId: legacy.in_reply_to_status_id_str,

			isQuote: legacy.is_quote_status || false,
			isPossiblySensitive: legacy.possibly_sensitive || false,
		};
	} catch (err) {
		console.error("Failed to parse tweet:", err);
		return null;
	}
}

/**
 * Parse user result into clean type
 */
export function parseUser(result: Result3): ParsedUser | null {
	try {
		if (result.__typename === "UserUnavailable") return null;

		const legacy = result.legacy;
		const core = result.core;

		if (!legacy || !core) return null;

		return {
			id: result.rest_id,
			username: core.screen_name,
			name: core.name,
			description: legacy.description || result.profile_bio?.description || "",
			location: result.location?.location || "",
			avatarUrl:
				result.avatar?.image_url ||
				legacy.profile_image_url_https?.replace("_normal", "_400x400") ||
				"",
			bannerUrl: legacy.profile_banner_url,
			isVerified: result.verification?.verified || false,
			isBlueVerified: result.is_blue_verified || false,
			followersCount: legacy.followers_count || 0,
			followingCount: legacy.friends_count || 0,
			tweetsCount: legacy.statuses_count || 0,
			likesCount: legacy.favourites_count || 0,
			listedCount: legacy.listed_count || 0,
			createdAt: core.created_at,
			professional: result.professional
				? {
						type: result.professional.professional_type,
						category: result.professional.category?.[0]?.name,
					}
				: undefined,
		};
	} catch (err) {
		console.error("Failed to parse user:", err);
		return null;
	}
}

/**
 * Parse media array
 */
export function parseMedia(mediaArray: Medum[]): ParsedMedia[] {
	if (!mediaArray || !Array.isArray(mediaArray)) return [];

	return mediaArray
		.map((m) => {
			const base: ParsedMedia = {
				id: m.id_str,
				type: m.type as "photo" | "video" | "animated_gif",
				url:
					m.type === "photo"
						? m.media_url_https
						: getBestVideoUrl(m.video_info?.variants || []),
				thumbnailUrl: m.media_url_https,
				width: m.original_info?.width || m.sizes?.large?.w || 0,
				height: m.original_info?.height || m.sizes?.large?.h || 0,
			};

			if (m.video_info) {
				base.duration = m.video_info.duration_millis;
				base.variants = m.video_info.variants
					.filter((v) => v.content_type === "video/mp4")
					.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))
					.map((v) => ({
						url: v.url,
						bitrate: v.bitrate,
						contentType: v.content_type,
					}));
			}

			return base;
		})
		.filter((m) => m.url);
}

/**
 * Get best quality video URL
 */
function getBestVideoUrl(
	variants: { url: string; bitrate?: number; content_type: string }[],
): string {
	const mp4s = variants
		.filter((v) => v.content_type === "video/mp4")
		.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

	return mp4s[0]?.url || variants[0]?.url || "";
}

/**
 * Clean HTML from source string
 */
function cleanSource(source: string): string {
	if (!source) return "unknown";
	// Extract text between > and <
	const match = source.match(/>([^<]+)</);
	return match?.[1] || source;
}

/**
 * Extract all tweets from raw captures array
 */
export function extractTweetsFromCaptures(captures: Capture[]): ParsedTweet[] {
	const tweets: ParsedTweet[] = [];

	for (const capture of captures) {
		const data = capture.responseBody?.data;
		if (!data) continue;

		// Handle UserTweets response
		if (data.user?.result?.timeline?.timeline?.instructions) {
			const instructions = data.user.result.timeline.timeline.instructions;

			for (const instruction of instructions) {
				if (instruction.type !== "TimelineAddEntries" || !instruction.entries)
					continue;

				for (const entry of instruction.entries) {
					if (!entry.entryId.startsWith("tweet-")) continue;

					const tweetResult = entry.content?.itemContent?.tweet_results?.result;
					if (tweetResult) {
						const parsed = parseTweet(tweetResult);
						if (parsed) tweets.push(parsed);
					}
				}
			}
		}
	}

	// Dedupe
	const seen = new Set<string>();
	return tweets.filter((t) => {
		if (seen.has(t.id)) return false;
		seen.add(t.id);
		return true;
	});
}
