// Extended signal data for UI analytics
export interface ExtendedSignalData {
	// OrderBook extras
	orderBook?: {
		bidVolume: number;
		askVolume: number;
		bestBid: number;
		bestAsk: number;
		spread: number;
		spreadPercent: number;
		buyWallPrice?: number; // Nearest large buy order
		sellWallPrice?: number; // Nearest large sell order
	};
	// Long/Short extras
	longShort?: {
		longPercent: number;
		shortPercent: number;
		crowdBias: "LONG" | "SHORT" | "NEUTRAL";
	};
	// TradeFlow extras
	tradeFlow?: {
		cvdValue: number;
		largeOrderBias: number;
		buyVolume: number;
		sellVolume: number;
	};
	// Whale extras
	whales?: {
		bullishCount: number;
		bearishCount: number;
		topWhaleDirection: "UP" | "DOWN" | "NEUTRAL";
		totalWeight: number;
	};
	// Liquidations extras
	liquidations?: {
		longLiquidations: number;
		shortLiquidations: number;
		cascadeRisk: "HIGH" | "MEDIUM" | "LOW";
	};
}

export interface SymbolState {
	symbol: string;
	currentPrice: number;
	openPrice: number;
	priceChange: number;
	signals: {
		lsRatio: number | null;
		lsAge: number | null;
		orderBookImbalance: number | null;
		orderBookAge: number | null;
		tvTechRating: number | null;
		tvAge: number | null;
		tuScore: number | null;
		tuAge: number | null;
		tradeFlow: number | null;
		tradeFlowAge: number | null;
		whaleLeaders: number | null;
		whaleLeadersAge: number | null;
		liquidations: number | null;
		liquidationsAge: number | null;
	};
	// Extended analytics for UI
	extended?: ExtendedSignalData;
	score: number;
	confidence: number;
	potentialDirection: "UP" | "DOWN" | "NEUTRAL";
	distanceToThreshold: number;
	alreadyPredicted: boolean;
}

export interface RealTimeState {
	windowStart: number;
	currentPhase: 1 | 2 | 3;
	phaseProgress: number;
	threshold: number;
	thresholds: { 1: number; 2: number; 3: number };
	symbols: SymbolState[];
	timestamp: number;
}

export interface PredictionHistoryItem {
	timestamp: number;
	phase: number;
	direction: "UP" | "DOWN";
	confidence: number;
	openPrice: number;
	closePrice?: number;
	pnl?: number;
	outcome?: "WIN" | "LOSS" | "PENDING";
}

export interface SymbolHistoryData {
	predictions: PredictionHistoryItem[];
	stats: {
		totalPredictions: number;
		wins: number;
		losses: number;
		pending: number;
		winRate: number;
		avgConfidence: number;
		avgPnl: number;
	};
}
