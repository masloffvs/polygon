import { addSeconds, formatDistance } from "date-fns";
import type React from "react";
import { useEffect, useState } from "react";
import { type NodeRendererProps, registerRenderer } from "./registry";

const RedisMemoRenderer: React.FC<NodeRendererProps> = ({ data, nodeData }) => {
	const [restoredData, setRestoredData] = useState<any>(null);
	const [isLoading, setIsLoading] = useState(false);

	// Effectively usage: props data takes precedence if it arrives (a new tick), otherwise falls back to restored state
	// But wait, if data prop exists (because the node ran "restoreState" on server start), then we don't need to fetch.
	// The issue is if the UI connects AFTER the server emit.
	const hasLiveOrServerRestoredData = !!data?.stored?.value;

	useEffect(() => {
		if (hasLiveOrServerRestoredData) return;

		let isMounted = true;
		const fetchState = async () => {
			setIsLoading(true);
			try {
				// "tries to pull API ... if there is something ... render as if a tick arrived"
				const res = await fetch(`/api/datastudio/redis-memo?id=${nodeData.id}`);
				if (res.ok && res.status !== 204) {
					const json = await res.json();
					if (isMounted) {
						setRestoredData({
							value: json.value,
							ttl: json.ttl,
							restored: true,
							timestamp: json.timestamp,
						});
					}
				}
			} catch (err) {
				// silent fail or log
				console.error("Redis restore error", err);
			} finally {
				if (isMounted) setIsLoading(false);
			}
		};

		fetchState();
		return () => {
			isMounted = false;
		};
	}, [nodeData.id, hasLiveOrServerRestoredData]);

	const effectiveData = data?.stored?.value ? data.stored : restoredData;

	if (!effectiveData) {
		return (
			<div className="p-3 text-xs text-gray-500 italic text-center">
				{isLoading ? "Checking cache..." : "No data allocated in Redis"}
			</div>
		);
	}

	const { value, ttl, timestamp } = effectiveData;
	const ts =
		typeof timestamp === "number" && timestamp > 0 ? timestamp : Date.now();
	let expiresAt: Date;
	let isExpired = false;
	let timeLeft = "N/A";

	try {
		expiresAt = addSeconds(new Date(ts), ttl || 0);
		const now = new Date();
		isExpired = expiresAt < now;
		timeLeft = isExpired
			? "Expired"
			: formatDistance(expiresAt, now, { addSuffix: true });
	} catch {
		timeLeft = "Invalid";
	}

	return (
		<div className="flex flex-col gap-2 p-2 w-full min-w-[200px]">
			<div className="flex justify-between items-end text-xs pb-1">
				<span className="text-gray-400 font-medium">TTL Status</span>
				<span
					className={`font-mono ${!isExpired ? "text-lime-400" : "text-red-400"}`}
				>
					{timeLeft}
				</span>
			</div>

			<div className="relative group">
				<div className="absolute top-0 right-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
					<div className="text-[9px] bg-black/50 px-1 rounded text-gray-300">
						Type: {typeof value}
					</div>
				</div>
				<div className="bg-dark-900/50 rounded-lg p-2.5 overflow-hidden">
					<pre className="text-[10px] font-mono text-lime-100/80 whitespace-pre-wrap break-all max-h-[120px] overflow-y-auto custom-scrollbar">
						{typeof value === "object"
							? JSON.stringify(value, null, 2)
							: String(value)}
					</pre>
				</div>
			</div>

			<div className="flex justify-between items-center text-[9px] text-gray-600">
				<span>{effectiveData.restored ? "Restored" : "Synced"}</span>
				<span>
					{(() => {
						try {
							return new Date(ts).toLocaleTimeString();
						} catch {
							return "N/A";
						}
					})()}
				</span>
			</div>
		</div>
	);
};

registerRenderer("redis-memo", RedisMemoRenderer);
export default RedisMemoRenderer;
