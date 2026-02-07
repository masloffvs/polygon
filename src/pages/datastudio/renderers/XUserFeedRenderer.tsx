import type React from "react";
import { type NodeRendererProps, registerRenderer } from "./registry";

/**
 * X User Feed Renderer
 *
 * Shows username, last scrape info, and tweet count.
 */
const XUserFeedRenderer: React.FC<NodeRendererProps> = ({ data, nodeData }) => {
	// Get outputs
	const tweets = data?.tweets?.value;
	const user = data?.user?.value;
	const error = data?.error?.value;

	const tweetCount = Array.isArray(tweets) ? tweets.length : 0;
	const username = nodeData.settings?.username || "";
	const scrollCount = nodeData.settings?.scrollCount || 3;

	// Show last few tweets preview
	const recentTweets = Array.isArray(tweets) ? tweets.slice(0, 3) : [];

	return (
		<div className="flex flex-col gap-2 p-3 w-full min-w-[220px]">
			{/* Header */}
			<div className="flex items-center gap-2">
				<div
					className={`w-2 h-2 rounded-full ${
						error ? "bg-red-500" : tweetCount > 0 ? "bg-sky-400" : "bg-gray-500"
					}`}
				/>
				<span className="text-xs font-medium text-white/80">
					{error ? "Error" : tweetCount > 0 ? "Ready" : "Waiting for trigger"}
				</span>
			</div>

			{/* Username display */}
			<div className="bg-white/5 rounded p-2">
				<div className="flex items-center gap-2">
					<svg
						className="w-4 h-4 text-sky-400"
						viewBox="0 0 24 24"
						fill="currentColor"
					>
						<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
					</svg>
					<span className="text-sm font-mono text-white/90">
						@{username || "not set"}
					</span>
				</div>
				{user && (
					<div className="text-xs text-white/50 mt-1 truncate">
						{user.name} • {user.followerCount?.toLocaleString() || 0} followers
					</div>
				)}
			</div>

			{/* Error display */}
			{error && (
				<div className="bg-red-500/10 border border-red-500/30 rounded p-2">
					<div className="text-xs text-red-400">{error.message}</div>
				</div>
			)}

			{/* Stats */}
			{tweetCount > 0 && (
				<div className="bg-white/5 rounded p-2">
					<div className="flex justify-between items-center">
						<span className="text-xs text-white/60">Tweets:</span>
						<span className="text-sm font-bold text-sky-400">{tweetCount}</span>
					</div>
				</div>
			)}

			{/* Recent tweets preview */}
			{recentTweets.length > 0 && (
				<div className="space-y-1">
					<div className="text-xs text-white/40">Recent:</div>
					{recentTweets.map((tweet: any, i: number) => (
						<div
							key={tweet.id || i}
							className="bg-white/5 rounded p-1.5 text-xs text-white/70 truncate"
						>
							{tweet.text?.slice(0, 60)}...
						</div>
					))}
				</div>
			)}

			{/* Settings summary */}
			<div className="text-xs text-white/40">Scrolls: {scrollCount}</div>
		</div>
	);
};

registerRenderer("x-user-feed", XUserFeedRenderer);
export default XUserFeedRenderer;
