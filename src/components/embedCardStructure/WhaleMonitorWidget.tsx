import NumberFlow from "@number-flow/react";
import { format } from "date-fns";
import { ArrowRight, Radar } from "lucide-react";
import React from "react";
import { DashboardCardWrapper } from "@/ui/components";

interface WhaleTransaction {
	transactionHash: string;
	value: number;
	symbol: string;
	timestamp: number;
	from: string;
	to: string;
}

interface WhaleMonitorProps {
	data: {
		recentTransactions: WhaleTransaction[];
		lastUpdate: number;
	};
}

export const WhaleMonitorWidget: React.FC<WhaleMonitorProps> = React.memo(
	({ data }) => {
		const transactions = data?.recentTransactions || [];

		return (
			<DashboardCardWrapper className="p-5">
				{/* Header */}
				<h3 className="text-xs font-semibold uppercase tracking-wider text-white/90 flex items-center gap-2 mb-4">
					<Radar size={14} className="text-lime-500" />
					Whale Watch
				</h3>

				{/* List */}
				<div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin scrollbar-thumb-dark-600 scrollbar-track-transparent pr-2 -mr-2">
					<table className="w-full text-left border-collapse">
						<tbody className="text-xs">
							{transactions.length === 0 ? (
								<tr>
									<td colSpan={3} className="py-8 text-center text-white/30">
										Waiting for whales...
									</td>
								</tr>
							) : (
								transactions.map((tx) => (
									<tr
										key={tx.transactionHash}
										className="group/row odd:bg-dark-800/20 hover:bg-dark-700/40 transition-colors"
									>
										<td className="py-2 pl-1 text-white/90 group-hover/row:text-white">
											<NumberFlow
												value={tx.value || 0}
												format={{
													style: "currency",
													currency: "USD",
													maximumFractionDigits: 0,
												}}
											/>
										</td>
										<td className="py-2">
											<span
												className={`text-[10px] px-1 py-0.5 rounded ${
													tx.symbol === "USDT" || tx.symbol === "USDC"
														? "text-lime-500 bg-lime-500/10"
														: "text-blue-400 bg-blue-900/10"
												}`}
											>
												{tx.symbol}
											</span>
										</td>
										<td className="py-2 text-right">
											<a
												href={`https://etherscan.io/tx/${tx.transactionHash}`}
												target="_blank"
												rel="noopener noreferrer"
												className="inline-flex items-center gap-1 text-white/50 group-hover/row:text-blue-400 transition-colors"
											>
												<span className="text-[10px]">
													{format(tx.timestamp || Date.now(), "HH:mm:ss")}
												</span>
												<ArrowRight size={8} />
											</a>
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
