/**
 * PolyTrustFactor Reporter
 * Formats analysis results for display
 */

import type { TrustFactorAnalysis, RiskFactor } from './types';

/**
 * Format analysis as a readable text report
 */
export function formatAnalysisReport(analysis: TrustFactorAnalysis): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('='.repeat(100));
  lines.push('🔍 POLYTRUSTFACTOR ANALYSIS REPORT');
  lines.push('='.repeat(100));
  lines.push('');

  // Header
  lines.push(`Address: ${analysis.address}`);
  lines.push(`Analyzed: ${analysis.analyzedAt.toISOString()}`);
  lines.push(`Trust Level: ${getTrustLevelEmoji(analysis.trustLevel)} ${analysis.trustLevel.toUpperCase()}`);
  lines.push(`Overall Risk Score: ${analysis.overallRiskScore.toFixed(0)}/100`);
  lines.push('');

  // Flags
  lines.push('🚩 FLAGS:');
  lines.push(`  Bot: ${analysis.flags.isBot ? '🤖 YES' : '✅ NO'}`);
  lines.push(`  Possible Insider: ${analysis.flags.isPossibleInsider ? '🕵️ YES' : '✅ NO'}`);
  lines.push(`  Whale: ${analysis.flags.isWhale ? '🐋 YES' : '✅ NO'}`);
  lines.push(`  Manipulation: ${analysis.flags.hasManipulationPatterns ? '⚠️ YES' : '✅ NO'}`);
  lines.push('');

  // Stats
  lines.push('📊 TRADING STATISTICS:');
  lines.push('');
  lines.push(`Total Positions: ${analysis.stats.totalPositions.toLocaleString()}`);
  lines.push(`Wins: ${analysis.stats.wins.toLocaleString()} (${(analysis.stats.winRate * 100).toFixed(2)}%)`);
  lines.push(`Losses: ${analysis.stats.losses.toLocaleString()} (${((1 - analysis.stats.winRate) * 100).toFixed(2)}%)`);
  lines.push('');
  lines.push(`Total PnL: $${analysis.stats.totalPnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  lines.push(`Win PnL: $${analysis.stats.totalWinPnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  lines.push(`Loss PnL: $${analysis.stats.totalLossPnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  lines.push('');
  lines.push(`Average Win: $${analysis.stats.avgWin.toFixed(2)}`);
  lines.push(`Average Loss: $${analysis.stats.avgLoss.toFixed(2)}`);
  lines.push(`Profit Factor: ${analysis.stats.profitFactor.toFixed(2)}`);
  lines.push(`Avg PnL per Position: $${analysis.stats.avgPnlPerPosition.toFixed(2)}`);
  lines.push('');

  // Market Categories
  if (analysis.marketCategories.length > 0) {
    lines.push('🎯 MARKET CATEGORIES:');
    lines.push('');
    for (const cat of analysis.marketCategories) {
      lines.push(`${cat.name}:`);
      lines.push(`  Positions: ${cat.count} | Win Rate: ${(cat.winRate * 100).toFixed(2)}% | PnL: $${cat.pnl.toFixed(2)}`);
    }
    lines.push('');
  }

  // Risk Factors
  if (analysis.riskFactors.length > 0) {
    lines.push('⚠️ RISK FACTORS:');
    lines.push('');
    for (const risk of analysis.riskFactors) {
      lines.push(formatRiskFactor(risk));
      lines.push('');
    }
  } else {
    lines.push('✅ NO SIGNIFICANT RISK FACTORS DETECTED');
    lines.push('');
  }

  // Top Wins
  if (analysis.topWins.length > 0) {
    lines.push('🟢 TOP 5 WINS:');
    lines.push('');
    for (let i = 0; i < Math.min(5, analysis.topWins.length); i++) {
      const pos = analysis.topWins[i];
      const date = new Date(pos.timestamp * 1000).toISOString().split('T')[0];
      lines.push(`${i + 1}. $${pos.realizedPnl.toFixed(2)} - ${pos.title}`);
      lines.push(`   Date: ${date} | Outcome: ${pos.outcome} | Price: ${pos.avgPrice.toFixed(4)}`);
    }
    lines.push('');
  }

  // Top Losses
  if (analysis.topLosses.length > 0) {
    lines.push('🔴 TOP 5 LOSSES:');
    lines.push('');
    for (let i = 0; i < Math.min(5, analysis.topLosses.length); i++) {
      const pos = analysis.topLosses[i];
      const date = new Date(pos.timestamp * 1000).toISOString().split('T')[0];
      lines.push(`${i + 1}. $${pos.realizedPnl.toFixed(2)} - ${pos.title}`);
      lines.push(`   Date: ${date} | Outcome: ${pos.outcome} | Price: ${pos.avgPrice.toFixed(4)}`);
    }
    lines.push('');
  }

  lines.push('='.repeat(100));
  lines.push('');

  return lines.join('\n');
}

function formatRiskFactor(risk: RiskFactor): string {
  const lines: string[] = [];
  
  const severityEmoji = {
    low: 'ℹ️',
    medium: '⚠️',
    high: '🚨',
    critical: '🔥',
  };

  lines.push(`${severityEmoji[risk.severity]} ${risk.name.toUpperCase()} [${risk.severity.toUpperCase()}]`);
  lines.push(`Score: ${risk.score}/100`);
  lines.push(`Description: ${risk.description}`);
  
  if (risk.evidence.length > 0) {
    lines.push('Evidence:');
    for (const evidence of risk.evidence) {
      lines.push(`  • ${evidence}`);
    }
  }

  if (risk.recommendation) {
    lines.push(`Recommendation: ${risk.recommendation}`);
  }

  return lines.join('\n');
}

function getTrustLevelEmoji(level: string): string {
  switch (level) {
    case 'trusted': return '✅';
    case 'neutral': return 'ℹ️';
    case 'suspicious': return '⚠️';
    case 'high-risk': return '🚨';
    default: return '❓';
  }
}

/**
 * Format analysis as JSON
 */
export function formatAnalysisJSON(analysis: TrustFactorAnalysis): string {
  return JSON.stringify(analysis, null, 2);
}

/**
 * Format analysis as compact summary
 */
export function formatAnalysisSummary(analysis: TrustFactorAnalysis): string {
  const lines: string[] = [];

  lines.push(`${getTrustLevelEmoji(analysis.trustLevel)} ${analysis.address}`);
  lines.push(`Risk: ${analysis.overallRiskScore.toFixed(0)}/100 | Trust: ${analysis.trustLevel}`);
  lines.push(`PnL: $${analysis.stats.totalPnl.toLocaleString()} | Win Rate: ${(analysis.stats.winRate * 100).toFixed(1)}%`);
  
  const flags = [];
  if (analysis.flags.isBot) flags.push('🤖 Bot');
  if (analysis.flags.isPossibleInsider) flags.push('🕵️ Insider');
  if (analysis.flags.isWhale) flags.push('🐋 Whale');
  if (analysis.flags.hasManipulationPatterns) flags.push('⚠️ Manipulation');
  
  if (flags.length > 0) {
    lines.push(`Flags: ${flags.join(', ')}`);
  }

  return lines.join('\n');
}
