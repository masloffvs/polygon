# PolyTrustFactor - Trader Risk Analysis Module

Comprehensive risk analysis system for Polymarket traders. Detects suspicious behavior patterns including bot trading, insider trading, market manipulation, and whale activity.

## Features

- **Bot Detection**: Identifies automated trading patterns
- **Insider Trading Detection**: Flags suspicious win rates and low-price purchases
- **Whale Detection**: Identifies large capital traders
- **Manipulation Detection**: Detects wash trading and market manipulation
- **Persistent Caching**: MongoDB-based cache for fast repeated analysis
- **REST API**: HTTP endpoints for integration
- **CLI Tool**: Command-line interface for quick analysis

## Installation

```bash
# Install dependencies
bun install

# Ensure MongoDB is running
docker-compose up -d mongo
```

## Usage

### CLI

```bash
# Analyze a trader
bun run src/polytrustfactor/cli.ts 0xYOUR_ADDRESS_HERE

# With custom options
bun run src/polytrustfactor/cli.ts 0xYOUR_ADDRESS_HERE --max-positions 1000 --no-cache
```

### Programmatic

```typescript
import { analyzeTrader } from './src/polytrustfactor/analyzer';

// Basic analysis (with cache)
const analysis = await analyzeTrader('0x...');

// With options
const analysis = await analyzeTrader('0x...', {
  maxPositions: 1000,
  useCache: true,
});

console.log(`Risk Score: ${analysis.overallRiskScore}/100`);
console.log(`Trust Level: ${analysis.trustLevel}`);
console.log(`Flags:`, analysis.flags);
```

### REST API

```bash
# Start the API server
bun run src/api/index.ts

# Analyze a trader
curl http://localhost:3001/api/polytrustfactor/analyze/0x...

# Get cache stats
curl http://localhost:3001/api/polytrustfactor/cache/stats/0x...

# Clear cache
curl -X DELETE http://localhost:3001/api/polytrustfactor/cache/0x...
```

## Cache Layer

The module uses MongoDB for persistent caching to avoid re-fetching historical data.

### How It Works

1. **First Analysis**: Fetches all positions from Polymarket API and caches them
2. **Subsequent Analyses**: Loads cached positions and only fetches new ones
3. **Permanent Storage**: No TTL - all history is kept forever
4. **Incremental Updates**: Only fetches positions after latest cached timestamp

### Performance

- **First run**: Same speed as API fetch (~1-2 seconds for 100 positions)
- **Cached runs**: 5-15x faster (~100-200ms)
- **Cache hit rate**: Typically 95-100% on subsequent runs

### Cache Management

```typescript
import { 
  getCacheStats, 
  clearTraderCache, 
  getCacheSize,
  getCachedTradersCount 
} from './src/polytrustfactor/cache-layer';

// Get cache statistics for a trader
const stats = await getCacheStats('0x...');
console.log(`Cached: ${stats.cachedCount} positions`);
console.log(`Cache hit rate: ${(stats.cacheHitRate * 100).toFixed(1)}%`);

// Clear cache for a specific trader
await clearTraderCache('0x...');

// Get total cache size
const totalPositions = await getCacheSize();
const totalTraders = await getCachedTradersCount();
```

### Disabling Cache

```typescript
// Disable cache for a single analysis
const analysis = await analyzeTrader('0x...', { useCache: false });
```

## Risk Factors

### Bot Behavior
- High trading frequency (>1000 positions)
- Low average PnL per trade (<$50)
- Extremely low loss rate (<1%)

### Insider Trading
- Low price purchases with high profits
- Abnormally high win rates on sports (>65%)
- High success rate on outsider bets
- Extremely high profit factor (>3)

### Whale Activity
- Large average position size (>$10,000)
- Maximum position size (>$100,000)
- High total PnL (>$1M)

### Market Manipulation
- Negative profit factor with continued trading
- High volume with minimal profit
- Zero losses (statistically improbable)

## Output Structure

```typescript
interface TrustFactorAnalysis {
  address: string;
  analyzedAt: Date;
  stats: TraderStats;              // Win rate, PnL, etc.
  marketCategories: MarketCategory[]; // Sports, Crypto, Politics, etc.
  riskFactors: RiskFactor[];       // Detected risks
  overallRiskScore: number;        // 0-100 (0=safe, 100=risky)
  trustLevel: 'trusted' | 'neutral' | 'suspicious' | 'high-risk';
  topWins: TraderPosition[];       // Top 10 winning positions
  topLosses: TraderPosition[];     // Top 10 losing positions
  flags: {
    isBot: boolean;
    isPossibleInsider: boolean;
    isWhale: boolean;
    hasManipulationPatterns: boolean;
  };
}
```

## Examples

### Example 1: Whale Trader

```bash
$ bun run src/polytrustfactor/cli.ts 0xc2e7800b5af46e6093872b177b7a5e7f0563be51

📊 POLYTRUSTFACTOR ANALYSIS
Address: 0xc2e7800b5af46e6093872b177b7a5e7f0563be51
Trust Level: HIGH-RISK
Overall Risk Score: 100/100

📈 STATISTICS:
Total Positions: 85
Win Rate: 62.4%
Total PnL: $5,780,199.53

⚠️ RISK FACTORS:
🚨 WHALE TRADER (LARGE CAPITAL) [HIGH]
Score: 100/100
Average position size: $1,608,129
Maximum single position: $7,784,984
```

### Example 2: Bot Trader

```typescript
const analysis = await analyzeTrader('0x...');

if (analysis.flags.isBot) {
  console.log('Bot detected!');
  console.log(`Positions: ${analysis.stats.totalPositions}`);
  console.log(`Avg PnL: $${analysis.stats.avgPnlPerPosition.toFixed(2)}`);
}
```

## Architecture

```
src/polytrustfactor/
├── types.ts           # TypeScript interfaces
├── analyzer.ts        # Core analysis engine
├── cache-layer.ts     # MongoDB caching layer
├── reporter.ts        # Output formatting
├── cli.ts             # Command-line interface
├── index.ts           # Public API exports
└── README.md          # This file

src/api/
└── polytrustfactor.ts # REST API endpoints
```

## Testing

```bash
# Run comprehensive cache test
bun run test_cache_comprehensive.ts

# Debug position data
bun run debug_positions.ts
```

## MongoDB Schema

```typescript
interface CachedPosition {
  _id: ObjectId;
  address: string;           // Trader address (lowercase)
  asset: string;             // Outcome token address
  conditionId: string;       // Market condition ID
  timestamp: number;         // Position close timestamp
  cachedAt: Date;            // When cached
  // ... all TraderPosition fields
}

// Indexes:
// - { address: 1, timestamp: -1 }
// - { address: 1, asset: 1, conditionId: 1, timestamp: 1 } [unique]
```

## Configuration

Environment variables:
```bash
MONGODB_URL=mongodb://localhost:27017/polygon
```

## Troubleshooting

### Cache not working
```bash
# Check MongoDB connection
docker-compose ps mongo

# Check cache stats
curl http://localhost:3001/api/polytrustfactor/cache/stats/0x...
```

### Duplicate key errors
The cache layer automatically handles duplicate keys. If you see errors, the old index might still exist:

```bash
# Connect to MongoDB
docker exec -it polygon-mongo-1 mongosh polygon

# Drop old index
db.polytrustfactor_positions.dropIndex("address_1_transactionHash_1")
```

### Slow analysis
- First run is always slow (fetches from API)
- Subsequent runs should be 5-15x faster
- Check cache hit rate in logs

## Contributing

When adding new risk detection algorithms:

1. Add detection function in `analyzer.ts`
2. Return a `RiskFactor` object
3. Add to `analyze()` method
4. Update tests
5. Document in README

## License

MIT
