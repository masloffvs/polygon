import NumberFlow from "@number-flow/react";
import { Fish } from "lucide-react";
import React from "react";
import { DashboardCardWrapper } from "@/ui/components";

interface PennyWhaleTrade {
	transactionHash: string;
	title: string;
	outcome: string;
	side: "BUY" | "SELL";
	price: number;
	size: number;
	computedValue: number;
	timestamp: number;
}

interface PennyWhaleProps {
	data: {
		recentTrades: PennyWhaleTrade[];
		lastUpdate: number;
	};
}

export const PennyWhaleWidget: React.FC<PennyWhaleProps> = React.memo(
	({ data }) => {
		const trades = data?.recentTrades || [];

		return (
			<DashboardCardWrapper className="p-5">
				{/* Header */}
				<h3 className="text-xs font-semibold uppercase tracking-wider text-white/90 flex items-center gap-2 mb-4">
					<Fish size={14} className="text-pink-500" />
					Penny Whales
				</h3>

				<div className="flex justify-end mb-4 -mt-8">
					<span className="text-[10px] bg-dark-600 px-1.5 py-0.5 rounded text-white/50">
						{"<"} 20¢ & {">"} $20k
					</span>
				</div>

				{/* List */}
				<div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin scrollbar-thumb-dark-600 scrollbar-track-transparent pr-2 -mr-2">
					<table className="w-full text-left border-collapse">
						<tbody className="text-xs">
							{trades.length === 0 ? (
								<tr>
									<td colSpan={4} className="py-8 text-center text-white/40">
										Watching feed...
									</td>
								</tr>
							) : (
								trades.map((tx) => (
									<tr
										key={tx.transactionHash}
										className="group/row odd:bg-dark-800/20 hover:bg-dark-700/40 transition-colors"
									>
										<td className="py-2 pl-1">
											<span
												className={`text-[9px] font-bold px-1 py-0.5 rounded ${
													tx.side === "BUY"
														? "bg-lime-500/10 text-lime-500"
														: "bg-red-900/20 text-red-500"
												}`}
											>
												{tx.side}
											</span>
										</td>
										<td className="py-2 max-w-[80px]">
											<div
												className="truncate text-white/90 text-[10px]"
												title={tx.title}
											>
												{tx.title}
											</div>
											<div className="text-[9px] text-white/50 flex items-center gap-1">
												{tx.outcome}
											</div>
										</td>
										<td className="py-2 text-white/50 text-[10px]">
											<NumberFlow
												value={tx.price * 100}
												format={{
													notation: "compact",
													maximumFractionDigits: 1,
												}}
											/>
											¢
										</td>
										<td className="py-2 text-right font-medium text-white group-hover/row:text-pink-500 transition-colors">
											<NumberFlow
												value={tx.computedValue}
												format={{
													style: "currency",
													currency: "USD",
													notation: "compact",
													maximumFractionDigits: 1,
												}}
											/>
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			</DashboardCardWrapper>
		);
	},
);
