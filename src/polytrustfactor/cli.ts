#!/usr/bin/env bun
/**
 * PolyTrustFactor CLI
 * Command-line interface for trader analysis
 */

import { analyzeTrader } from './analyzer';
import { formatAnalysisReport, formatAnalysisJSON, formatAnalysisSummary } from './reporter';
import { logger } from '../server/utils/logger';

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const address = args[0];
  const format = args.includes('--json') ? 'json' : args.includes('--summary') ? 'summary' : 'full';
  const maxPositions = parseInt(args.find(arg => arg.startsWith('--max='))?.split('=')[1] || '50000');
  const useCache = !args.includes('--no-cache'); // Cache enabled by default

  if (!address || !address.startsWith('0x')) {
    console.error('❌ Error: Invalid Ethereum address');
    console.error('Usage: bun run src/polytrustfactor/cli.ts <address> [options]');
    process.exit(1);
  }

  try {
    console.log(`\n🔍 Analyzing trader: ${address}\n`);

    const analysis = await analyzeTrader(address, { maxPositions });

    switch (format) {
      case 'json':
        console.log(formatAnalysisJSON(analysis));
        break;
      case 'summary':
        console.log(formatAnalysisSummary(analysis));
        break;
      default:
        console.log(formatAnalysisReport(analysis));
    }

    // Exit code based on risk level
    if (analysis.trustLevel === 'high-risk') {
      process.exit(2);
    } else if (analysis.trustLevel === 'suspicious') {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (error) {
    logger.error({ error }, 'Analysis failed');
    console.error(`\n❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
    process.exit(1);
  }
}

function printHelp() {
  console.log(`
🔍 PolyTrustFactor - Polymarket Trader Risk Analysis

USAGE:
  bun run src/polytrustfactor/cli.ts <address> [options]

ARGUMENTS:
  <address>         Ethereum address of the trader to analyze (required)

OPTIONS:
  --json            Output results in JSON format
  --summary         Output compact summary
  --max=<number>    Maximum positions to fetch (default: 50000)
  -h, --help        Show this help message

EXAMPLES:
  # Full analysis report
  bun run src/polytrustfactor/cli.ts 0xe00740bce98a594e26861838885ab310ec3b548c

  # JSON output
  bun run src/polytrustfactor/cli.ts 0xe00740bce98a594e26861838885ab310ec3b548c --json

  # Summary only
  bun run src/polytrustfactor/cli.ts 0xe00740bce98a594e26861838885ab310ec3b548c --summary

  # Limit positions
  bun run src/polytrustfactor/cli.ts 0xe00740bce98a594e26861838885ab310ec3b548c --max=1000

EXIT CODES:
  0 - Trusted or neutral trader
  1 - Suspicious trader
  2 - High-risk trader

RISK FACTORS DETECTED:
  • Bot Behavior - Automated trading patterns
  • Insider Trading - Access to non-public information
  • Whale Activity - Large capital operations
  • Market Manipulation - Wash trading or price manipulation

For more information, visit: https://github.com/your-repo/polytrustfactor
`);
}

main();
