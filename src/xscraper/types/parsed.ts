// Clean, readable types for parsed Twitter data

export interface ParsedUser {
	id: string;
	username: string;
	name: string;
	description: string;
	location: string;
	avatarUrl: string;
	bannerUrl?: string;
	isVerified: boolean;
	isBlueVerified: boolean;
	followersCount: number;
	followingCount: number;
	tweetsCount: number;
	likesCount: number;
	listedCount: number;
	createdAt: string;
	professional?: {
		type: string;
		category?: string;
	};
}

export interface ParsedMedia {
	id: string;
	type: "photo" | "video" | "animated_gif";
	url: string;
	thumbnailUrl: string;
	width: number;
	height: number;
	// Video specific
	duration?: number;
	variants?: {
		url: string;
		bitrate?: number;
		contentType: string;
	}[];
}

export interface ParsedTweet {
	id: string;
	text: string;
	createdAt: string;
	lang: string;
	source: string;

	// Engagement
	likeCount: number;
	retweetCount: number;
	replyCount: number;
	quoteCount: number;
	viewCount: number;
	bookmarkCount: number;

	// User interaction state
	isLiked: boolean;
	isRetweeted: boolean;
	isBookmarked: boolean;

	// Author
	author: ParsedUser;

	// Media
	media: ParsedMedia[];

	// Mentions
	mentions: {
		id: string;
		username: string;
		name: string;
	}[];

	// Quote tweet
	quotedTweet?: ParsedTweet;

	// Conversation
	conversationId: string;
	inReplyToId?: string;

	// Flags
	isQuote: boolean;
	isPossiblySensitive: boolean;
}

export interface ParsedTimeline {
	tweets: ParsedTweet[];
	user?: ParsedUser;
	cursor?: string;
}
