/**
 * PolyTrustFactor - Polymarket Trader Risk Analysis
 * 
 * Main entry point for the module
 */

export { PolyTrustFactorAnalyzer, analyzeTrader } from './analyzer';
export * from './types';
export { formatAnalysisReport } from './reporter';
export {
  initCacheLayer,
  getCachedPositions,
  getLatestCachedTimestamp,
  cachePositions,
  clearTraderCache,
  clearAllCache,
  getCacheStats,
  getCacheSize,
  getCachedTradersCount,
} from './cache-layer';
