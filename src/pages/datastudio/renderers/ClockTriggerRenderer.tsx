import type React from "react";
import { useEffect, useState } from "react";
import { type NodeRendererProps, registerRenderer } from "./registry";

interface ClockState {
	pattern: string;
	timezone: string;
	currentTime: string;
	enabled: boolean;
	patternInfo: {
		description: string;
		examples: string[];
	};
}

const TIMEZONE_LABELS: Record<string, string> = {
	UTC: "UTC",
	"Europe/Moscow": "Moscow",
	"Europe/London": "London",
	"Europe/Paris": "Paris",
	"Europe/Berlin": "Berlin",
	"America/New_York": "New York",
	"America/Los_Angeles": "Los Angeles",
	"America/Chicago": "Chicago",
	"Asia/Tokyo": "Tokyo",
	"Asia/Shanghai": "Shanghai",
	"Asia/Singapore": "Singapore",
	"Asia/Dubai": "Dubai",
	"Asia/Kolkata": "India",
	"Australia/Sydney": "Sydney",
	"Pacific/Auckland": "Auckland",
};

/**
 * ClockTrigger Renderer
 *
 * Shows current time in selected timezone and pattern info.
 */
const ClockTriggerRenderer: React.FC<NodeRendererProps> = ({
	data,
	nodeData,
}) => {
	const [state, setState] = useState<ClockState | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	const fetchState = async () => {
		try {
			const res = await fetch(
				`/api/datastudio/scheduled-trigger/state?id=${nodeData.id}`,
			);
			if (res.ok) {
				setState(await res.json());
			}
		} catch (_err) {
			// Ignore
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		fetchState();
		const interval = setInterval(fetchState, 1000); // Update every second for live clock
		return () => clearInterval(interval);
	}, [fetchState]);

	// Check if just triggered (from output data)
	const triggered = data?.trigger?.value;
	const justTriggered = triggered !== undefined;

	const pattern = state?.pattern || nodeData.settings?.pattern || "10:00 AM";
	const timezone = state?.timezone || nodeData.settings?.timezone || "UTC";
	const enabled = state?.enabled ?? nodeData.settings?.enabled ?? true;
	const currentTime = state?.currentTime || "--:--";
	const tzLabel = TIMEZONE_LABELS[timezone] || timezone;

	return (
		<div className="flex flex-col gap-2 p-3 w-full min-w-[200px]">
			{/* Status indicator */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<div
						className={`w-2 h-2 rounded-full ${
							!enabled
								? "bg-gray-500"
								: justTriggered
									? "bg-purple-400 animate-ping"
									: "bg-purple-500"
						}`}
					/>
					<span className="text-xs font-medium text-white/80">
						{!enabled
							? "Disabled"
							: justTriggered
								? "Triggered!"
								: "Waiting..."}
					</span>
				</div>
			</div>

			{/* Current time display */}
			<div className="bg-white/5 rounded p-3 text-center">
				<div className="text-3xl font-mono font-bold text-purple-400">
					{isLoading ? "--:--" : currentTime}
				</div>
				<div className="text-xs text-white/50 mt-1">{tzLabel}</div>
			</div>

			{/* Pattern info */}
			<div className="bg-white/5 rounded p-2">
				<div className="text-xs text-white/60 mb-1">Pattern:</div>
				<div className="text-sm font-mono text-white/90">{pattern}</div>
				{state?.patternInfo?.description && (
					<div className="text-xs text-white/40 mt-1">
						{state.patternInfo.description}
					</div>
				)}
				{state?.patternInfo?.examples &&
					state.patternInfo.examples.length > 0 && (
						<div className="text-xs text-white/30 mt-1">
							e.g. {state.patternInfo.examples.slice(0, 3).join(", ")}
						</div>
					)}
			</div>

			{/* Last trigger info */}
			{justTriggered && (
				<div className="bg-purple-500/10 border border-purple-500/30 rounded p-2">
					<div className="text-xs text-white/60">Last trigger:</div>
					<div className="text-sm font-mono text-purple-400">
						{triggered.localTime || triggered.triggeredAt}
					</div>
				</div>
			)}
		</div>
	);
};

registerRenderer("scheduled-trigger", ClockTriggerRenderer);
export default ClockTriggerRenderer;
