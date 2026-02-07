import NumberFlow from "@number-flow/react";
import { Bitcoin, Building2, TrendingUp } from "lucide-react";
import React, { useEffect, useState } from "react";
import { DashboardCardWrapper } from "@/ui/components";

interface TreasuryHolding {
	company_name: string;
	ticker: string;
	coin: string;
	holdings: number;
	latest_acquisitions: number | string;
	cost_basis: number | string;
	data_as_of: string;
}

interface TreasuriesState {
	holdings: TreasuryHolding[];
	totalBtcHoldings: number;
	lastUpdate: number;
}

const _formatNumber = (val: number) => {
	if (val >= 1000000) return `${(val / 1000000).toFixed(2)}M`;
	if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
	return val.toLocaleString();
};

const _formatMoney = (val: number | string) => {
	if (typeof val === "string" || val === 0) return "--";
	return `$${val.toLocaleString()}`;
};

export const CryptoTreasuriesWidget: React.FC<{ data?: TreasuriesState }> =
	React.memo(({ data: propData }) => {
		const [internalData, setInternalData] = useState<TreasuriesState>({
			holdings: [],
			totalBtcHoldings: 0,
			lastUpdate: Date.now(),
		});

		const data = propData || internalData;

		useEffect(() => {
			if (propData) return;

			const fetchSnapshot = async () => {
				try {
					const res = await fetch("/api/observable/snapshots");
					const json = await res.json();
					const cardData = json["crypto-treasuries-card"];
					if (cardData) {
						setInternalData(cardData);
					}
				} catch (e) {
					console.error("Failed to fetch treasuries", e);
				}
			};

			fetchSnapshot();
			const interval = setInterval(fetchSnapshot, 30000); // Refresh every 30s
			return () => clearInterval(interval);
		}, [propData]);

		return (
			<DashboardCardWrapper className="p-5">
				{/* Header */}
				<h3 className="text-xs font-semibold uppercase tracking-wider text-white/90 flex items-center gap-2 mb-4">
					<Building2 size={14} className="text-orange-500" />
					Corporate Treasuries
				</h3>

				<div className="flex justify-end mb-2">
					<div className="flex items-center gap-1 text-[10px] text-orange-500">
						<Bitcoin size={12} />
						<NumberFlow
							value={data.totalBtcHoldings}
							format={{ notation: "compact", maximumFractionDigits: 1 }}
						/>{" "}
						BTC
					</div>
				</div>

				{/* Table */}
				<div className="flex-1 overflow-y-auto custom-scrollbar">
					<table className="w-full text-left">
						<tbody>
							{data.holdings.length === 0 ? (
								<tr>
									<td
										colSpan={3}
										className="py-6 text-center text-white/40 text-xs"
									>
										Loading treasuries...
									</td>
								</tr>
							) : (
								data.holdings.map((h, i) => (
									<tr
										key={`${h.ticker}-${i}`}
										className="odd:bg-dark-800/20 hover:bg-dark-700/40 transition-colors group/row"
									>
										<td className="py-2 pr-2">
											<div className="flex items-center gap-2">
												<span className="text-[10px] font-semibold text-orange-400 bg-orange-900/20 px-1.5 py-0.5 rounded">
													{h.ticker}
												</span>
												<span
													className="text-[11px] text-white/90 truncate max-w-[120px]"
													title={h.company_name}
												>
													{h.company_name}
												</span>
											</div>
										</td>
										<td className="py-2 text-right">
											<div className="flex flex-col items-end">
												<span className="text-[11px] font-medium text-white/80">
													<NumberFlow
														value={h.holdings}
														format={{
															notation: "compact",
															maximumFractionDigits: 1,
														}}
													/>
												</span>
												{typeof h.latest_acquisitions === "number" &&
													h.latest_acquisitions > 0 && (
														<span className="text-[9px] text-lime-500 flex items-center gap-0.5">
															<TrendingUp size={8} />+
															<NumberFlow
																value={h.latest_acquisitions}
																format={{
																	notation: "compact",
																	maximumFractionDigits: 1,
																}}
															/>
														</span>
													)}
											</div>
										</td>
										<td className="py-2 text-right text-[11px] text-white/50">
											{typeof h.cost_basis === "string" ||
											h.cost_basis === 0 ? (
												"--"
											) : (
												<NumberFlow
													value={h.cost_basis}
													format={{
														style: "currency",
														currency: "USD",
														maximumFractionDigits: 0,
													}}
												/>
											)}
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>

				{/* Footer */}
				<div className="mt-2 pt-2 border-t border-dark-600 text-[9px] text-white/50 flex justify-between">
					<span>Source: CoinMarketCap</span>
					<span>
						Updated:{" "}
						{new Date(data.lastUpdate).toLocaleTimeString([], {
							hour: "2-digit",
							minute: "2-digit",
						})}
					</span>
				</div>
			</DashboardCardWrapper>
		);
	});
