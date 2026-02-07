/**
 * PolyTrustFactor - Trader Risk Analysis Module
 * 
 * Analyzes Polymarket traders for suspicious behavior patterns including:
 * - Bot detection
 * - Insider trading indicators
 * - Market manipulation
 * - Wash trading
 */

export interface TraderPosition {
  proxyWallet: string;
  asset: string;
  conditionId: string;
  avgPrice: number;
  totalBought: number;
  realizedPnl: number;
  curPrice: number;
  title: string;
  slug: string;
  icon?: string;
  eventSlug: string;
  outcome: string;
  outcomeIndex: number;
  oppositeOutcome: string;
  oppositeAsset: string;
  endDate: string;
  timestamp: number;
}

export interface TraderStats {
  address: string;
  totalPositions: number;
  closedPositions: number;
  openPositions: number;
  wins: number;
  losses: number;
  neutral: number;
  winRate: number;
  totalPnl: number;
  totalWinPnl: number;
  totalLossPnl: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  avgPnlPerPosition: number;
}

export interface MarketCategory {
  name: string;
  count: number;
  wins: number;
  losses: number;
  winRate: number;
  pnl: number;
}

export interface RiskFactor {
  id: string;
  name: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  score: number; // 0-100
  description: string;
  evidence: string[];
  recommendation?: string;
}

export interface TrustFactorAnalysis {
  address: string;
  analyzedAt: Date;
  stats: TraderStats;
  marketCategories: MarketCategory[];
  riskFactors: RiskFactor[];
  overallRiskScore: number; // 0-100 (0 = safe, 100 = extremely risky)
  trustLevel: 'trusted' | 'neutral' | 'suspicious' | 'high-risk';
  topWins: TraderPosition[];
  topLosses: TraderPosition[];
  flags: {
    isBot: boolean;
    isPossibleInsider: boolean;
    isWhale: boolean;
    hasManipulationPatterns: boolean;
  };
}

export interface AnalysisOptions {
  includePositions?: boolean;
  maxPositions?: number;
  minPositionValue?: number;
  categories?: string[];
  useCache?: boolean; // Enable/disable cache layer
}
