/**
 * PolyTrustFactor Analyzer
 * Core analysis engine for trader risk assessment
 */

import { logger } from '../server/utils/logger';
import type {
  TraderPosition,
  TraderStats,
  MarketCategory,
  RiskFactor,
  TrustFactorAnalysis,
  AnalysisOptions,
} from './types';
import {
  initCacheLayer,
  getCachedPositions,
  getLatestCachedTimestamp,
  cachePositions,
  mergePositions,
  getCacheStats,
} from './cache-layer';

const POLYMARKET_API = 'https://data-api.polymarket.com';

export class PolyTrustFactorAnalyzer {
  private address: string;
  private positions: TraderPosition[] = [];
  private stats: TraderStats | null = null;
  private useCache: boolean;

  constructor(address: string, useCache = true) {
    this.address = address.toLowerCase();
    this.useCache = useCache;
  }

  /**
   * Fetch closed positions with cache support
   */
  private async fetchClosedPositions(maxPositions = 50000): Promise<TraderPosition[]> {
    if (!this.useCache) {
      return this.fetchFromAPI(maxPositions);
    }

    try {
      // Initialize cache layer
      await initCacheLayer();

      // Get latest cached timestamp
      const latestCached = await getLatestCachedTimestamp(this.address);

      logger.info(
        { address: this.address, latestCached },
        'Checking cache for positions'
      );

      // Fetch new positions from API (after latest cached)
      const freshPositions = await this.fetchFromAPI(maxPositions, latestCached);

      // Get cached positions
      const cachedPositions = await getCachedPositions(this.address);

      // Merge and deduplicate
      const allPositions = mergePositions(cachedPositions, freshPositions);

      // Cache new positions
      if (freshPositions.length > 0) {
        await cachePositions(this.address, freshPositions);
      }

      // Get cache stats
      const cacheStats = await getCacheStats(this.address);
      cacheStats.newCount = freshPositions.length;
      cacheStats.totalCount = allPositions.length;
      cacheStats.cacheHitRate = allPositions.length > 0 
        ? cachedPositions.length / allPositions.length 
        : 0;

      logger.info(
        {
          address: this.address,
          cached: cachedPositions.length,
          fresh: freshPositions.length,
          total: allPositions.length,
          cacheHitRate: `${(cacheStats.cacheHitRate * 100).toFixed(1)}%`,
        },
        'Positions loaded with cache'
      );

      return allPositions;
    } catch (error) {
      logger.error({ error }, 'Cache layer failed, falling back to API only');
      return this.fetchFromAPI(maxPositions);
    }
  }

  /**
   * Fetch positions directly from API
   */
  private async fetchFromAPI(
    maxPositions = 50000,
    afterTimestamp?: number | null
  ): Promise<TraderPosition[]> {
    const limit = 100;
    let offset = 0;
    const allPositions: TraderPosition[] = [];

    logger.info(
      { address: this.address, afterTimestamp },
      'Fetching positions from API'
    );

    while (allPositions.length < maxPositions) {
      const url = `${POLYMARKET_API}/closed-positions?user=${this.address}&sortBy=timestamp&sortDirection=DESC&limit=${limit}&offset=${offset}`;

      try {
        const response = await fetch(url);
        if (!response.ok) {
          logger.warn({ status: response.status }, 'API request failed');
          break;
        }

        const data = await response.json();

        if (!Array.isArray(data) || data.length === 0) {
          break;
        }

        // Filter positions after timestamp if specified
        const filteredData = afterTimestamp
          ? data.filter(pos => pos.timestamp > afterTimestamp)
          : data;

        allPositions.push(...filteredData);

        // If we got positions older than afterTimestamp, we can stop
        if (afterTimestamp && filteredData.length < data.length) {
          break;
        }

        offset += limit;

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        logger.error({ error }, 'Failed to fetch positions');
        break;
      }
    }

    logger.info({ count: allPositions.length }, 'Positions fetched from API');
    return allPositions;
  }

  /**
   * Calculate basic trader statistics
   */
  private calculateStats(positions: TraderPosition[]): TraderStats {
    const wins = positions.filter(p => p.realizedPnl > 0);
    const losses = positions.filter(p => p.realizedPnl < 0);
    const neutral = positions.filter(p => p.realizedPnl === 0);

    const totalWinPnl = wins.reduce((sum, p) => sum + p.realizedPnl, 0);
    const totalLossPnl = losses.reduce((sum, p) => sum + p.realizedPnl, 0);
    const totalPnl = totalWinPnl + totalLossPnl;

    const avgWin = wins.length > 0 ? totalWinPnl / wins.length : 0;
    const avgLoss = losses.length > 0 ? totalLossPnl / losses.length : 0;
    const profitFactor = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 0;

    return {
      address: this.address,
      totalPositions: positions.length,
      closedPositions: positions.length,
      openPositions: 0, // We only fetch closed positions
      wins: wins.length,
      losses: losses.length,
      neutral: neutral.length,
      winRate: positions.length > 0 ? wins.length / positions.length : 0,
      totalPnl,
      totalWinPnl,
      totalLossPnl,
      avgWin,
      avgLoss,
      profitFactor,
      avgPnlPerPosition: positions.length > 0 ? totalPnl / positions.length : 0,
    };
  }

  /**
   * Categorize markets
   */
  private categorizeMarkets(positions: TraderPosition[]): MarketCategory[] {
    const categories = new Map<string, {
      count: number;
      wins: number;
      losses: number;
      pnl: number;
    }>();

    for (const pos of positions) {
      const title = pos.title || '';
      let category = 'Other';

      if (title.match(/NFL|NBA|MLB|NHL|UFC|Soccer|Football|Basketball|Baseball/i)) {
        category = 'Sports';
      } else if (title.match(/Bitcoin|BTC|Ethereum|ETH|Solana|SOL|XRP|Up or Down/i)) {
        category = 'Crypto';
      } else if (title.match(/Trump|Biden|Election|President|Politics/i)) {
        category = 'Politics';
      } else if (title.match(/Will|happen|by/i)) {
        category = 'Events';
      }

      if (!categories.has(category)) {
        categories.set(category, { count: 0, wins: 0, losses: 0, pnl: 0 });
      }

      const cat = categories.get(category)!;
      cat.count++;
      cat.pnl += pos.realizedPnl;

      if (pos.realizedPnl > 0) {
        cat.wins++;
      } else if (pos.realizedPnl < 0) {
        cat.losses++;
      }
    }

    return Array.from(categories.entries())
      .map(([name, data]) => ({
        name,
        count: data.count,
        wins: data.wins,
        losses: data.losses,
        winRate: data.count > 0 ? data.wins / data.count : 0,
        pnl: data.pnl,
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Detect bot behavior patterns
   */
  private detectBotBehavior(stats: TraderStats, positions: TraderPosition[]): RiskFactor | null {
    let score = 0;
    const evidence: string[] = [];

    // High frequency trading
    if (stats.totalPositions > 10000) {
      score += 30;
      evidence.push(`Extreme trading frequency: ${stats.totalPositions.toLocaleString()} positions`);
    } else if (stats.totalPositions > 5000) {
      score += 20;
      evidence.push(`Very high trading frequency: ${stats.totalPositions.toLocaleString()} positions`);
    } else if (stats.totalPositions > 1000) {
      score += 10;
      evidence.push(`High trading frequency: ${stats.totalPositions.toLocaleString()} positions`);
    }

    // Low average PnL (scalping)
    const avgPnl = Math.abs(stats.avgPnlPerPosition);
    if (avgPnl < 20 && stats.totalPositions > 2000) {
      score += 30;
      evidence.push(`Very low avg PnL per trade: $${avgPnl.toFixed(2)}`);
    } else if (avgPnl < 50 && stats.totalPositions > 1000) {
      score += 20;
      evidence.push(`Low avg PnL per trade: $${avgPnl.toFixed(2)}`);
    }

    // Extremely low loss rate
    const lossRate = stats.totalPositions > 0 ? stats.losses / stats.totalPositions : 0;
    if (lossRate < 0.01 && stats.totalPositions > 1000) {
      score += 15;
      evidence.push(`Extremely low loss rate: ${(lossRate * 100).toFixed(2)}%`);
    }

    if (score === 0) return null;

    let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (score >= 70) severity = 'critical';
    else if (score >= 40) severity = 'high';
    else if (score >= 20) severity = 'medium';

    return {
      id: 'bot-behavior',
      name: 'Automated Trading Bot',
      severity,
      score,
      description: 'Trading patterns consistent with automated bot behavior',
      evidence,
      recommendation: 'Verify if this is a legitimate market maker or arbitrage bot',
    };
  }

  /**
   * Detect insider trading patterns
   */
  private detectInsiderTrading(stats: TraderStats, positions: TraderPosition[], categories: MarketCategory[]): RiskFactor | null {
    let score = 0;
    const evidence: string[] = [];

    // Low price purchases with high wins (buying when outcome is "known")
    const suspiciousWins = positions.filter(p => 
      p.avgPrice < 0.15 && p.realizedPnl > 100
    );

    if (suspiciousWins.length > 10) {
      score += 40;
      evidence.push(`${suspiciousWins.length} positions bought at very low prices (<0.15) with large profits`);
    } else if (suspiciousWins.length > 5) {
      score += 20;
      evidence.push(`${suspiciousWins.length} positions bought at very low prices with large profits`);
    }

    // Extremely high win rate on sports (insider info)
    const sportsCategory = categories.find(c => c.name === 'Sports');
    if (sportsCategory && sportsCategory.winRate > 0.70 && sportsCategory.count > 20) {
      score += 40;
      evidence.push(`Abnormally high win rate on sports: ${(sportsCategory.winRate * 100).toFixed(1)}%`);
    } else if (sportsCategory && sportsCategory.winRate > 0.65 && sportsCategory.count > 10) {
      score += 20;
      evidence.push(`High win rate on sports: ${(sportsCategory.winRate * 100).toFixed(1)}%`);
    }

    // Winning on outsiders (low probability events)
    const outsiderWins = positions.filter(p => 
      p.avgPrice < 0.30 && p.totalBought > 100 && p.realizedPnl > 0
    );

    if (outsiderWins.length > 0) {
      const outsiderWinRate = outsiderWins.length / positions.filter(p => p.avgPrice < 0.30 && p.totalBought > 100).length;
      if (outsiderWinRate > 0.60) {
        score += 30;
        evidence.push(`High success rate on outsider bets: ${(outsiderWinRate * 100).toFixed(1)}%`);
      }
    }

    // Extremely high profit factor
    if (stats.profitFactor > 3) {
      score += 20;
      evidence.push(`Extremely high profit factor: ${stats.profitFactor.toFixed(2)}`);
    }

    if (score === 0) return null;

    let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (score >= 70) severity = 'critical';
    else if (score >= 40) severity = 'high';
    else if (score >= 20) severity = 'medium';

    return {
      id: 'insider-trading',
      name: 'Possible Insider Trading',
      severity,
      score,
      description: 'Trading patterns suggest possible access to non-public information',
      evidence,
      recommendation: 'Investigate source of information and timing of trades',
    };
  }

  /**
   * Detect whale behavior (large capital trader)
   */
  private detectWhale(stats: TraderStats, positions: TraderPosition[]): RiskFactor | null {
    const avgPositionSize = positions.reduce((sum, p) => sum + p.totalBought, 0) / positions.length;
    const maxPositionSize = Math.max(...positions.map(p => p.totalBought));

    let score = 0;
    const evidence: string[] = [];

    if (avgPositionSize > 50000) {
      score += 40;
      evidence.push(`Average position size: $${avgPositionSize.toLocaleString()}`);
    } else if (avgPositionSize > 10000) {
      score += 20;
      evidence.push(`Large average position size: $${avgPositionSize.toLocaleString()}`);
    }

    if (maxPositionSize > 1000000) {
      score += 30;
      evidence.push(`Maximum single position: $${maxPositionSize.toLocaleString()}`);
    } else if (maxPositionSize > 100000) {
      score += 15;
      evidence.push(`Large maximum position: $${maxPositionSize.toLocaleString()}`);
    }

    if (Math.abs(stats.totalPnl) > 1000000) {
      score += 30;
      evidence.push(`Total PnL: $${stats.totalPnl.toLocaleString()}`);
    }

    if (score === 0) return null;

    return {
      id: 'whale',
      name: 'Whale Trader (Large Capital)',
      severity: score > 50 ? 'high' : 'medium',
      score,
      description: 'Trader operates with significant capital that can influence markets',
      evidence,
      recommendation: 'Monitor for potential market manipulation or price impact',
    };
  }

  /**
   * Detect manipulation patterns
   */
  private detectManipulation(stats: TraderStats, positions: TraderPosition[]): RiskFactor | null {
    let score = 0;
    const evidence: string[] = [];

    // Profit factor < 1 but still trading (possible wash trading)
    if (stats.profitFactor < 0.8 && stats.totalPositions > 100) {
      score += 20;
      evidence.push(`Negative profit factor (${stats.profitFactor.toFixed(2)}) with continued trading`);
    }

    // Very high volume with low profit
    if (stats.totalPositions > 5000 && Math.abs(stats.avgPnlPerPosition) < 10) {
      score += 25;
      evidence.push('High volume trading with minimal profit per trade');
    }

    // Suspicious win/loss ratio (too perfect)
    if (stats.losses === 0 && stats.wins > 100) {
      score += 40;
      evidence.push(`Zero losses on ${stats.wins} winning positions - statistically improbable`);
    }

    if (score === 0) return null;

    return {
      id: 'manipulation',
      name: 'Potential Market Manipulation',
      severity: score > 50 ? 'critical' : score > 30 ? 'high' : 'medium',
      score,
      description: 'Trading patterns suggest possible wash trading or market manipulation',
      evidence,
      recommendation: 'Investigate for self-trading or coordinated manipulation',
    };
  }

  /**
   * Run complete analysis
   */
  async analyze(options: AnalysisOptions = {}): Promise<TrustFactorAnalysis> {
    const startTime = Date.now();
    
    // Set cache preference
    if (options.useCache !== undefined) {
      this.useCache = options.useCache;
    }
    
    logger.info(
      { address: this.address, useCache: this.useCache },
      'Starting PolyTrustFactor analysis'
    );

    // Fetch positions (with cache support)
    this.positions = await this.fetchClosedPositions(options.maxPositions);

    if (this.positions.length === 0) {
      throw new Error('No positions found for this address');
    }

    // Calculate stats
    this.stats = this.calculateStats(this.positions);

    // Categorize markets
    const marketCategories = this.categorizeMarkets(this.positions);

    // Run risk detection
    const riskFactors: RiskFactor[] = [];

    const botRisk = this.detectBotBehavior(this.stats, this.positions);
    if (botRisk) riskFactors.push(botRisk);

    const insiderRisk = this.detectInsiderTrading(this.stats, this.positions, marketCategories);
    if (insiderRisk) riskFactors.push(insiderRisk);

    const whaleRisk = this.detectWhale(this.stats, this.positions);
    if (whaleRisk) riskFactors.push(whaleRisk);

    const manipulationRisk = this.detectManipulation(this.stats, this.positions);
    if (manipulationRisk) riskFactors.push(manipulationRisk);

    // Calculate overall risk score
    const overallRiskScore = riskFactors.reduce((sum, rf) => sum + rf.score, 0) / Math.max(riskFactors.length, 1);

    // Determine trust level
    let trustLevel: 'trusted' | 'neutral' | 'suspicious' | 'high-risk' = 'neutral';
    if (overallRiskScore >= 70) trustLevel = 'high-risk';
    else if (overallRiskScore >= 40) trustLevel = 'suspicious';
    else if (overallRiskScore < 20) trustLevel = 'trusted';

    // Get top wins/losses
    const topWins = [...this.positions]
      .filter(p => p.realizedPnl > 0)
      .sort((a, b) => b.realizedPnl - a.realizedPnl)
      .slice(0, 10);

    const topLosses = [...this.positions]
      .filter(p => p.realizedPnl < 0)
      .sort((a, b) => a.realizedPnl - b.realizedPnl)
      .slice(0, 10);

    const analysis: TrustFactorAnalysis = {
      address: this.address,
      analyzedAt: new Date(),
      stats: this.stats,
      marketCategories,
      riskFactors,
      overallRiskScore,
      trustLevel,
      topWins,
      topLosses,
      flags: {
        isBot: riskFactors.some(rf => rf.id === 'bot-behavior' && rf.score >= 40),
        isPossibleInsider: riskFactors.some(rf => rf.id === 'insider-trading' && rf.score >= 40),
        isWhale: riskFactors.some(rf => rf.id === 'whale'),
        hasManipulationPatterns: riskFactors.some(rf => rf.id === 'manipulation' && rf.score >= 30),
      },
    };

    const duration = Date.now() - startTime;
    logger.info({ 
      address: this.address, 
      duration, 
      riskScore: overallRiskScore,
      trustLevel,
    }, 'Analysis complete');

    return analysis;
  }
}

/**
 * Convenience function to analyze a trader
 */
export async function analyzeTrader(
  address: string,
  options?: AnalysisOptions
): Promise<TrustFactorAnalysis> {
  const useCache = options?.useCache !== false; // Default to true
  const analyzer = new PolyTrustFactorAnalyzer(address, useCache);
  return analyzer.analyze(options);
}
