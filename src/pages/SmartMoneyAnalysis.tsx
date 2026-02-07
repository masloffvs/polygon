import { motion } from "framer-motion";
import {
	Activity,
	ArrowDown,
	ArrowUp,
	BarChart3,
	BookOpen,
	CheckCircle,
	Clock,
	Flame,
	TrendingDown,
	TrendingUp,
	Users,
	Waves,
} from "lucide-react";
import { lazy, Suspense } from "react";
import useSWR from "swr";
import type { RealTimeState, SymbolState } from "./smart-money/types";

// Lazy imports
const NumericFont = lazy(() => import("@/ui/components").then(m => ({ default: m.NumericFont })));

// Lazy Loaded Components
const HistorySection = lazy(
	() => import("./smart-money/components/HistorySection"),
);

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const LoadingFallback = () => (
	<div className="bg-dark-400/30 border border-dark-700 rounded-xl p-4 flex items-center justify-center h-full min-h-[200px]">
		<div className="text-sm text-gray-500 font-mono animate-pulse">
			Loading...
		</div>
	</div>
);

// Helper to format age
const formatAge = (age: number | null) => {
	if (age === null) return "—";
	if (age < 60) return `${age.toFixed(0)}s`;
	return `${(age / 60).toFixed(1)}m`;
};

// Individual signal card component
const SignalCard = ({
	icon: Icon,
	label,
	value,
	age,
	extras,
	currentPrice,
}: {
	icon: React.ElementType;
	label: string;
	value: number | null;
	age: number | null;
	extras?: { label: string; value: string; color?: string }[];
	currentPrice?: number;
}) => {
	const hasData = value !== null;
	const isStale = age !== null && age > 120;
	const normalizedValue = hasData ? Math.max(-1, Math.min(1, value)) : 0;
	const percentage = ((normalizedValue + 1) / 2) * 100;

	const direction = hasData
		? value > 0.1
			? "bullish"
			: value < -0.1
				? "bearish"
				: "neutral"
		: "none";

	const barStyle =
		normalizedValue >= 0
			? { left: "50%", width: `${(normalizedValue / 2) * 100}%` }
			: {
					left: `${percentage}%`,
					width: `${(Math.abs(normalizedValue) / 2) * 100}%`,
				};

	return (
		<div
			className={`bg-dark-500/30 border border-dark-600 rounded-lg p-2.5 ${isStale ? "opacity-60" : ""}`}
		>
			{/* Header */}
			<div className="flex items-center justify-between mb-2">
				<div className="flex items-center gap-2">
					<Icon
						size={14}
						className={
							direction === "bullish"
								? "text-lime-400"
								: direction === "bearish"
									? "text-red-400"
									: "text-gray-500"
						}
					/>
					<span className="text-xs font-mono text-gray-300 font-medium">
						{label}
					</span>
				</div>
				<div className="flex items-center gap-1.5 text-[10px] text-gray-500 font-mono">
					<Clock size={10} />
					{formatAge(age)}
				</div>
			</div>

			{/* Progress bar */}
			<div className="h-1.5 bg-dark-700 rounded-full overflow-hidden relative mb-2">
				<div className="absolute left-1/2 top-0 bottom-0 w-px bg-dark-500" />
				{hasData ? (
					<motion.div
						className={`absolute top-0 bottom-0 rounded-full ${
							direction === "bullish"
								? "bg-lime-500"
								: direction === "bearish"
									? "bg-red-500"
									: "bg-gray-500"
						}`}
						initial={false}
						animate={barStyle}
						transition={{ type: "spring", stiffness: 300, damping: 30 }}
					/>
				) : (
					<div className="absolute inset-0 bg-dark-600/50" />
				)}
			</div>

			{/* Value + Direction */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-1">
					{direction === "bullish" && (
						<TrendingUp size={12} className="text-lime-400" />
					)}
					{direction === "bearish" && (
						<TrendingDown size={12} className="text-red-400" />
					)}
					{direction === "neutral" && (
						<span className="w-2 h-0.5 bg-gray-500 rounded" />
					)}
					{direction === "none" && (
						<span className="w-2 h-2 rounded-full bg-dark-600" />
					)}
					<NumericFont
						className={`text-xs font-medium ${
							direction === "bullish"
								? "text-lime-400"
								: direction === "bearish"
									? "text-red-400"
									: "text-gray-400"
						}`}
					>
						{hasData ? value.toFixed(3) : "—"}
					</NumericFont>
				</div>
				<span
					className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
						direction === "bullish"
							? "bg-lime-500/20 text-lime-400"
							: direction === "bearish"
								? "bg-red-500/20 text-red-400"
								: "bg-dark-600/50 text-gray-500"
					}`}
				>
					{direction === "bullish"
						? "LONG"
						: direction === "bearish"
							? "SHORT"
							: "NEUTRAL"}
				</span>
			</div>

			{/* Extra info */}
			{extras && extras.length > 0 && (
				<div className="mt-2 pt-2 border-t border-dark-600 grid grid-cols-2 gap-1">
					{extras.map((extra) => (
						<div key={extra.label} className="text-[10px] font-mono">
							<span className="text-gray-500">{extra.label}: </span>
							<span className={extra.color || "text-gray-300"}>
								{extra.value}
							</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
};

// Signal grid with individual cards
const SignalGrid = ({
	signals,
	extended,
	currentPrice,
}: {
	signals: SymbolState["signals"];
	extended?: SymbolState["extended"];
	currentPrice: number;
}) => {
	// Long/Short ratio extras - use extended data if available
	const lsExtras = (() => {
		if (extended?.longShort) {
			return [
				{
					label: "Longs",
					value: `${extended.longShort.longPercent.toFixed(1)}%`,
					color:
						extended.longShort.longPercent > 50
							? "text-lime-400"
							: "text-red-400",
				},
				{
					label: "Shorts",
					value: `${extended.longShort.shortPercent.toFixed(1)}%`,
					color:
						extended.longShort.shortPercent > 50
							? "text-red-400"
							: "text-lime-400",
				},
				{
					label: "Crowd",
					value: extended.longShort.crowdBias,
					color:
						extended.longShort.crowdBias === "LONG"
							? "text-lime-400"
							: extended.longShort.crowdBias === "SHORT"
								? "text-red-400"
								: "text-gray-400",
				},
			];
		}
		if (signals.lsRatio !== null) {
			const ratio = signals.lsRatio;
			return [
				{
					label: "Ratio",
					value: ratio.toFixed(2),
					color: ratio > 1 ? "text-lime-400" : "text-red-400",
				},
			];
		}
		return undefined;
	})();

	// OrderBook extras - use extended data with real prices
	const obExtras = (() => {
		if (extended?.orderBook) {
			const ob = extended.orderBook;
			return [
				{
					label: "Bid Vol",
					value:
						ob.bidVolume > 1000000
							? `${(ob.bidVolume / 1000000).toFixed(2)}M`
							: `${(ob.bidVolume / 1000).toFixed(0)}K`,
					color: "text-lime-400",
				},
				{
					label: "Ask Vol",
					value:
						ob.askVolume > 1000000
							? `${(ob.askVolume / 1000000).toFixed(2)}M`
							: `${(ob.askVolume / 1000).toFixed(0)}K`,
					color: "text-red-400",
				},
				{
					label: "Spread",
					value: `${ob.spreadPercent.toFixed(3)}%`,
					color: ob.spreadPercent > 0.1 ? "text-yellow-400" : "text-gray-400",
				},
				{
					label: "Best Bid",
					value: `$${ob.bestBid.toFixed(2)}`,
					color: "text-lime-400",
				},
			];
		}
		if (signals.orderBookImbalance !== null) {
			return [
				{
					label: "Imbalance",
					value: `${(signals.orderBookImbalance * 100).toFixed(1)}%`,
					color:
						signals.orderBookImbalance > 0 ? "text-lime-400" : "text-red-400",
				},
			];
		}
		return undefined;
	})();

	// TradeFlow extras - use extended data
	const tfExtras = (() => {
		if (extended?.tradeFlow) {
			const tf = extended.tradeFlow;
			return [
				{
					label: "CVD",
					value:
						tf.cvdValue > 0
							? `+${tf.cvdValue.toFixed(0)}`
							: tf.cvdValue.toFixed(0),
					color: tf.cvdValue > 0 ? "text-lime-400" : "text-red-400",
				},
				{
					label: "Buy Vol",
					value:
						tf.buyVolume > 1000000
							? `${(tf.buyVolume / 1000000).toFixed(2)}M`
							: `${(tf.buyVolume / 1000).toFixed(0)}K`,
					color: "text-lime-400",
				},
				{
					label: "Sell Vol",
					value:
						tf.sellVolume > 1000000
							? `${(tf.sellVolume / 1000000).toFixed(2)}M`
							: `${(tf.sellVolume / 1000).toFixed(0)}K`,
					color: "text-red-400",
				},
				{
					label: "Large Orders",
					value:
						tf.largeOrderBias > 0
							? "Buy Bias"
							: tf.largeOrderBias < 0
								? "Sell Bias"
								: "Neutral",
					color:
						tf.largeOrderBias > 0
							? "text-lime-400"
							: tf.largeOrderBias < 0
								? "text-red-400"
								: "text-gray-400",
				},
			];
		}
		if (signals.tradeFlow !== null) {
			return [
				{
					label: "Flow",
					value: signals.tradeFlow > 0 ? "Inflow" : "Outflow",
					color: signals.tradeFlow > 0 ? "text-lime-400" : "text-red-400",
				},
			];
		}
		return undefined;
	})();

	// Whale extras - use extended data
	const whaleExtras = (() => {
		if (extended?.whales) {
			const w = extended.whales;
			return [
				{
					label: "Bulls",
					value: `${w.bullishCount}`,
					color: "text-lime-400",
				},
				{
					label: "Bears",
					value: `${w.bearishCount}`,
					color: "text-red-400",
				},
				{
					label: "Top Whale",
					value: w.topWhaleDirection,
					color:
						w.topWhaleDirection === "UP"
							? "text-lime-400"
							: w.topWhaleDirection === "DOWN"
								? "text-red-400"
								: "text-gray-400",
				},
				{
					label: "Weight",
					value: `${w.totalWeight.toFixed(1)}`,
				},
			];
		}
		if (signals.whaleLeaders !== null) {
			return [
				{
					label: "Position",
					value: signals.whaleLeaders > 0 ? "Accumulating" : "Distributing",
					color: signals.whaleLeaders > 0 ? "text-lime-400" : "text-red-400",
				},
			];
		}
		return undefined;
	})();

	// Liquidations extras - use extended data
	const liqExtras = (() => {
		if (extended?.liquidations) {
			const liq = extended.liquidations;
			const formatLiq = (v: number) =>
				v > 1000000
					? `$${(v / 1000000).toFixed(2)}M`
					: `$${(v / 1000).toFixed(0)}K`;
			return [
				{
					label: "Long Liq",
					value: formatLiq(liq.longLiquidations),
					color: "text-red-400",
				},
				{
					label: "Short Liq",
					value: formatLiq(liq.shortLiquidations),
					color: "text-lime-400",
				},
				{
					label: "Cascade",
					value: liq.cascadeRisk,
					color:
						liq.cascadeRisk === "HIGH"
							? "text-red-400"
							: liq.cascadeRisk === "MEDIUM"
								? "text-yellow-400"
								: "text-gray-400",
				},
			];
		}
		if (signals.liquidations !== null) {
			return [
				{
					label: "Side",
					value: signals.liquidations > 0 ? "Shorts liq" : "Longs liq",
					color: signals.liquidations > 0 ? "text-lime-400" : "text-red-400",
				},
			];
		}
		return undefined;
	})();

	return (
		<div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
			<SignalCard
				icon={BarChart3}
				label="Long/Short"
				value={signals.lsRatio ? 1 - signals.lsRatio : null}
				age={signals.lsAge}
				extras={lsExtras}
				currentPrice={currentPrice}
			/>
			<SignalCard
				icon={BookOpen}
				label="OrderBook"
				value={signals.orderBookImbalance}
				age={signals.orderBookAge}
				extras={obExtras}
				currentPrice={currentPrice}
			/>
			<SignalCard
				icon={Activity}
				label="TradingView"
				value={signals.tvTechRating}
				age={signals.tvAge}
				currentPrice={currentPrice}
			/>
			<SignalCard
				icon={Users}
				label="TradersUnion"
				value={signals.tuScore}
				age={signals.tuAge}
				currentPrice={currentPrice}
			/>
			<SignalCard
				icon={Waves}
				label="TradeFlow"
				value={signals.tradeFlow}
				age={signals.tradeFlowAge}
				extras={tfExtras}
				currentPrice={currentPrice}
			/>
			<SignalCard
				icon={Activity}
				label="Whales"
				value={signals.whaleLeaders}
				age={signals.whaleLeadersAge}
				extras={whaleExtras}
				currentPrice={currentPrice}
			/>
			<SignalCard
				icon={Flame}
				label="Liquidations"
				value={signals.liquidations}
				age={signals.liquidationsAge}
				extras={liqExtras}
				currentPrice={currentPrice}
			/>
		</div>
	);
};

import { withErrorBoundary } from "@/ui/components/ErrorBoundary";

const SmartMoneyAnalysisComponent = () => {
	const { data: state } = useSWR<RealTimeState>(
		"/api/predictions/realtime",
		fetcher,
		{
			refreshInterval: 1000,
		},
	);

	if (!state) {
		return (
			<div className="flex bg-dark-900/50 p-6 h-full items-center justify-center">
				<div className="text-sm text-gray-500 font-mono animate-pulse">
					Initializing...
				</div>
			</div>
		);
	}

	const windowEnd = new Date(state.windowStart + 15 * 60 * 1000);
	const timeRemaining = Math.max(0, windowEnd.getTime() - Date.now());
	const formattedRemaining = new Date(timeRemaining)
		.toISOString()
		.substr(14, 5);

	// Keep original order (no sorting by confidence)
	const symbols = state.symbols;

	// Count signals summary
	const upCount = symbols.filter((s) => s.potentialDirection === "UP").length;
	const downCount = symbols.filter(
		(s) => s.potentialDirection === "DOWN",
	).length;
	const readyCount = symbols.filter(
		(s) => s.confidence >= state.threshold,
	).length;

	return (
		<div className="flex flex-col h-full p-4 overflow-y-auto custom-scrollbar">
			<Suspense fallback={<LoadingFallback />}>
				{/* Header Strip */}
				<div className="mb-4 flex items-center justify-between bg-dark-400/30 border border-dark-700 rounded-lg px-4 py-3">
					<div className="flex items-center gap-5">
						<div className="flex items-center gap-2">
							<span className="text-sm font-mono text-gray-500">Phase</span>
							<span className="text-base font-bold text-yellow-400 font-mono">
								{state.currentPhase}
							</span>
						</div>
						<div className="w-px h-5 bg-dark-600" />
						<div className="flex items-center gap-2">
							<span className="text-sm font-mono text-gray-500">Threshold</span>
							<span className="text-base font-bold text-gray-100 font-mono">
								≥{state.threshold}%
							</span>
						</div>
						<div className="w-px h-5 bg-dark-600" />
						<div className="flex items-center gap-2">
							<span className="text-sm font-mono text-gray-500">Time</span>
							<NumericFont className="text-base font-bold text-gray-100">
								{formattedRemaining}
							</NumericFont>
						</div>
					</div>
					<div className="flex items-center gap-4 text-sm font-mono">
						<div className="flex items-center gap-1.5 text-green-400">
							<ArrowUp size={14} />
							<span>{upCount}</span>
						</div>
						<div className="flex items-center gap-1.5 text-red-400">
							<ArrowDown size={14} />
							<span>{downCount}</span>
						</div>
						<div className="flex items-center gap-1.5 text-blue-400">
							<CheckCircle size={14} />
							<span>{readyCount} ready</span>
						</div>
					</div>
				</div>

				{/* Ticker Grid - fixed 2 columns */}
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
					{symbols.map((symbol) => (
						<div
							key={symbol.symbol}
							className={`bg-dark-400/30 border rounded-lg p-4 transition-colors ${
								symbol.confidence >= state.threshold
									? "border-green-500/50"
									: symbol.potentialDirection === "DOWN"
										? "border-red-500/30"
										: symbol.potentialDirection === "UP"
											? "border-green-500/30"
											: "border-dark-700"
							}`}
						>
							{/* Row 1: Symbol + Direction + Price */}
							<div className="flex items-center justify-between mb-3">
								<div className="flex items-center gap-3">
									<span className="text-lg font-bold text-gray-100 font-mono">
										{symbol.symbol.replace("USDT", "")}
									</span>
									<span
										className={`text-sm font-bold px-2.5 py-1 rounded flex items-center gap-1.5 ${
											symbol.potentialDirection === "UP"
												? "bg-green-500/20 text-green-400"
												: symbol.potentialDirection === "DOWN"
													? "bg-red-500/20 text-red-400"
													: "bg-dark-600/30 text-gray-500"
										}`}
									>
										{symbol.potentialDirection === "UP" && (
											<TrendingUp size={14} />
										)}
										{symbol.potentialDirection === "DOWN" && (
											<TrendingDown size={14} />
										)}
										{symbol.potentialDirection === "UP"
											? "LONG"
											: symbol.potentialDirection === "DOWN"
												? "SHORT"
												: "—"}
									</span>
									{symbol.alreadyPredicted && (
										<span className="text-xs px-2 py-1 rounded bg-blue-500/20 text-blue-400 flex items-center gap-1">
											<CheckCircle size={12} />
											SENT
										</span>
									)}
								</div>
								<div className="text-right">
									<NumericFont className="text-base font-bold text-gray-100">
										${symbol.currentPrice.toLocaleString()}
									</NumericFont>
									{symbol.openPrice > 0 && (
										<NumericFont
											className={`text-sm block ${
												symbol.priceChange > 0
													? "text-green-400"
													: symbol.priceChange < 0
														? "text-red-400"
														: "text-gray-500"
											}`}
										>
											{symbol.priceChange > 0 ? "+" : ""}
											{symbol.priceChange.toFixed(2)}%
										</NumericFont>
									)}
								</div>
							</div>

							{/* Row 2: Confidence bar */}
							<div className="mb-3">
								<div className="flex items-center justify-between text-xs text-gray-500 font-mono mb-1.5">
									<span>
										Confidence{" "}
										<NumericFont className="text-gray-200">
											{symbol.confidence.toFixed(1)}%
										</NumericFont>
									</span>
									<span>
										Score{" "}
										<NumericFont className="text-gray-200">
											{symbol.score.toFixed(2)}
										</NumericFont>
									</span>
								</div>
								<div className="h-2 w-full bg-dark-700 rounded-full overflow-hidden relative">
									{/* Threshold marker */}
									<div
										className="absolute top-0 bottom-0 w-0.5 bg-yellow-500/80"
										style={{ left: `${state.threshold}%` }}
									/>
									<div
										className={`h-full transition-all ${
											symbol.confidence >= state.threshold
												? "bg-green-500"
												: symbol.potentialDirection === "DOWN"
													? "bg-red-400"
													: symbol.potentialDirection === "UP"
														? "bg-green-400"
														: "bg-gray-500"
										}`}
										style={{
											width: `${Math.min(100, symbol.confidence)}%`,
										}}
									/>
								</div>
							</div>

							{/* Row 3: Signal indicators with progress bars */}
							<SignalGrid
								signals={symbol.signals}
								extended={symbol.extended}
								currentPrice={symbol.currentPrice}
							/>
						</div>
					))}
				</div>

				{/* Signal Legend - compact */}
				<div className="mb-4 px-4 py-2 bg-dark-400/20 border border-dark-700 rounded-lg">
					<div className="flex items-center gap-5 text-xs font-mono text-gray-500">
						<span className="flex items-center gap-1.5">
							<TrendingUp size={12} className="text-lime-500" />
							Bullish
						</span>
						<span className="flex items-center gap-1.5">
							<TrendingDown size={12} className="text-red-500" />
							Bearish
						</span>
						<span className="flex items-center gap-1.5">
							<span className="w-2.5 h-0.5 bg-gray-500 rounded" />
							Neutral
						</span>
					</div>
				</div>

				{/* History */}
				<HistorySection />
			</Suspense>
		</div>
	);
};

export const SmartMoneyAnalysis = withErrorBoundary(SmartMoneyAnalysisComponent, {
  title: "Smart Money Analysis",
});

export default SmartMoneyAnalysis;
