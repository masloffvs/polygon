import type React from "react";
import { useEffect, useState } from "react";

interface ExportChannelSelectorProps {
	value: string;
	onChange: (value: string) => void;
}

export const ExportChannelSelector: React.FC<ExportChannelSelectorProps> = ({
	value,
	onChange,
}) => {
	const [channels, setChannels] = useState<string[]>([]);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		const fetchChannels = async () => {
			setLoading(true);
			try {
				const res = await fetch("/api/pipeline/export-channels");
				if (res.ok) {
					const data = await res.json();
					setChannels(data);
				}
			} catch (err) {
				console.error("Failed to fetch export channels", err);
			} finally {
				setLoading(false);
			}
		};

		fetchChannels();
		// Poll every 5 seconds to keep updated
		const interval = setInterval(fetchChannels, 5000);
		return () => clearInterval(interval);
	}, []);

	return (
		<select
			value={value}
			onChange={(e) => onChange(e.target.value)}
			disabled={loading}
			className="w-full bg-dark-900/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20 transition-all appearance-none cursor-pointer"
		>
			<option value="">Select a channel...</option>
			{channels.map((channel) => (
				<option key={channel} value={channel}>
					{channel}
				</option>
			))}
			{!loading && channels.length === 0 && (
				<option disabled>No channels found</option>
			)}
		</select>
	);
};
