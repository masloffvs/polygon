import { Globe } from "lucide-react";
import React from "react";
import { DashboardCardWrapper } from "@/ui/components";

interface MarketStatus {
	name: string;
	time: string;
	isOpen: boolean;
	status: "OPEN" | "CLOSED" | "WEEKEND";
	zone: string;
}

interface WorldClockProps {
	data: {
		currentMarket: MarketStatus | null;
		allMarkets?: MarketStatus[];
	};
}

export const WorldClockWidget: React.FC<WorldClockProps> = React.memo(
	({ data }) => {
		// If allMarkets is available, use it. Otherwise fallback to currentMarket or empty.
		const markets =
			data?.allMarkets || (data?.currentMarket ? [data.currentMarket] : []);

		if (markets.length === 0) {
			return (
				<DashboardCardWrapper className="p-5 flex items-center justify-center text-white/50 text-xs">
					Syncing global time...
				</DashboardCardWrapper>
			);
		}

		// Sort markets to ensure consistent order (optional, by specific zones if needed)
		// Priority: New York, London, Tokyo, Hong Kong, Sydney
		const priority = ["New York", "London", "Tokyo", "Hong Kong", "Sydney"];
		const sortedMarkets = [...markets].sort((a, b) => {
			const idxA = priority.indexOf(a.name);
			const idxB = priority.indexOf(b.name);
			if (idxA !== -1 && idxB !== -1) return idxA - idxB;
			if (idxA !== -1) return -1;
			if (idxB !== -1) return 1;
			return a.name.localeCompare(b.name);
		});

		return (
			<DashboardCardWrapper className="p-5 flex flex-col overflow-hidden group">
				{/* Header */}
				<h3 className="relative z-10 text-xs font-semibold uppercase tracking-wider text-white/90 flex items-center gap-2 mb-4 shrink-0">
					<Globe size={14} className="text-purple-500" />
					Global Markets
				</h3>

				{/* Market List */}
				<div className="relative z-10 flex-1 overflow-y-auto custom-scrollbar grid grid-cols-3 gap-1 -mr-2 pr-2">
					{sortedMarkets.map((m) => {
						const isOpen = m.status === "OPEN";
						return (
							<div
								key={m.zone}
								className="flex items-center justify-between p-2 rounded hover:bg-white/5 transition-colors"
							>
								<div className="flex items-center gap-3">
									<div className="flex flex-col">
										<span className="text-xs font-bold text-white/90 uppercase tracking-wide">
											{m.name}
										</span>
										<span className="text-[9px] text-white/50">
											{m.status}
										</span>
									</div>
								</div>

								<div className="flex items-center gap-3">
									<div className="text-right">
										<div className="text-sm font-numeric text-white/90 tabular-nums">
											{m.time}
										</div>
									</div>
									<div
										className={`w-1.5 h-1.5 rounded-full ${isOpen ? "bg-lime-500 shadow-[0_0_5px_rgba(132,204,22,0.5)]" : "bg-red-900/50"}`}
									/>
								</div>
							</div>
						);
					})}
				</div>
			</DashboardCardWrapper>
		);
	},
);
