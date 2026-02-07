import NumberFlow from "@number-flow/react";
import { Scale } from "lucide-react";
import React, { useMemo } from "react";
import { DashboardCardWrapper } from "@/ui/components";

interface MarketSnapshot {
	[exchange: string]: {
		[symbol: string]: number;
	};
}

interface MarketSnapshotWidgetProps {
	data?: MarketSnapshot;
}

export const MarketSnapshotWidget: React.FC<MarketSnapshotWidgetProps> =
	React.memo(({ data }) => {
		// Transform Data for Table Display
		// Rows: Symbols
		// Columns: Exchanges
		const { columns, rows } = useMemo(() => {
			if (!data) return { columns: [], rows: [] };

			const exchanges = Object.keys(data).sort();
			const symbols = new Set<string>();

			exchanges.forEach((ex) => {
				Object.keys(data[ex]).forEach((sym) => symbols.add(sym));
			});

			const sortedSymbols = Array.from(symbols).sort();

			return { columns: exchanges, rows: sortedSymbols };
		}, [data]);

		// Highlight Logic: Find Min/Max for each row
		const getHighlights = (symbol: string) => {
			if (!data) return { min: 0, max: 0 };
			let min = Infinity;
			let max = -Infinity;

			columns.forEach((ex) => {
				const price = data[ex]?.[symbol];
				if (price) {
					if (price < min) min = price;
					if (price > max) max = price;
				}
			});

			return { min, max };
		};

		return (
			<DashboardCardWrapper className="p-5">
				{/* Header */}
				<h3 className="text-xs font-semibold uppercase tracking-wider text-white/90 flex items-center gap-2 mb-4">
					<Scale size={14} className="text-lime-500" />
					Market Arbitrage Matrix
				</h3>

				<div className="flex justify-end gap-2 mb-4 -mt-8">
					<span className="flex items-center gap-1 text-[10px] text-lime-500 bg-lime-500/10 px-2 py-1 rounded">
						LOW (BUY)
					</span>
					<span className="flex items-center gap-1 text-[10px] text-[#f43f5e] bg-[#f43f5e]/10 px-2 py-1 rounded">
						HIGH (SELL)
					</span>
				</div>

				{/* Table */}
				<div className="flex-1 overflow-auto -mx-5 px-5">
					{!data || Object.keys(data).length === 0 ? (
						<div className="flex items-center justify-center h-full text-[#333] text-xs">
							Waiting for market data...
						</div>
					) : (
						<table className="w-full text-left border-collapse">
							<thead>
								<tr className="text-[10px] uppercase tracking-wider">
									<th className="py-2 text-[10px] text-white/50 uppercase font-normal w-24 bg-dark-800/50 first:rounded-l-md">
										Symbol
									</th>
									{columns.map((col) => (
										<th
											key={col}
											className="py-2 text-[10px] text-white/50 uppercase font-normal text-right bg-dark-800/50"
										>
											{col.toUpperCase()}
										</th>
									))}
									<th className="py-2 text-[10px] text-white/50 uppercase font-normal text-right w-20 bg-dark-800/50 last:rounded-r-md">
										Spread
									</th>
								</tr>
							</thead>
							<tbody className="text-xs">
								{rows.map((sym) => {
									const { min, max } = getHighlights(sym);
									const spread = max - min;
									const spreadPct = (spread / min) * 100;
									const hasData = min !== Infinity && max !== -Infinity;

									return (
										<tr
											key={sym}
											className="odd:bg-dark-800/20 hover:bg-dark-700/40 transition-colors group"
										>
											<td className="py-2 text-white/80 font-medium">{sym}</td>
											{columns.map((ex) => {
												const price = data[ex]?.[sym];
												const isMin = price === min;
												const isMax = price === max;

												let colorClass = "text-white/40";
												if (price) {
													if (isMin && hasData)
														colorClass = "text-lime-500 font-bold";
													else if (isMax && hasData)
														colorClass = "text-[#f43f5e] font-bold";
													else colorClass = "text-white/40";
												}

												return (
													<td
														key={ex}
														className={`py-2 text-right ${colorClass}`}
													>
														{price ? (
															<NumberFlow
																value={price}
																format={{
																	minimumFractionDigits: 2,
																	maximumFractionDigits: 2,
																}}
															/>
														) : (
															"-"
														)}
													</td>
												);
											})}
											<td className="py-2 text-right">
												{hasData ? (
													<div className="flex flex-col items-end">
														<span className="text-white/90 font-medium">
															<NumberFlow
																value={spreadPct}
																format={{
																	style: "percent",
																	minimumFractionDigits: 2,
																	maximumFractionDigits: 2,
																}}
															/>
														</span>
														<span className="text-[9px] text-white/50">
															<NumberFlow
																value={spread}
																format={{
																	style: "currency",
																	currency: "USD",
																	minimumFractionDigits: 2,
																	maximumFractionDigits: 2,
																}}
															/>
														</span>
													</div>
												) : (
													"-"
												)}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					)}
				</div>
			</DashboardCardWrapper>
		);
	});
