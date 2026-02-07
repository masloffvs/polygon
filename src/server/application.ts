import path from "node:path";
// import { PolymarketGammaSource } from "./layers/sources/polymarket_gamma";
import solanaObjects from "@/objects/solana-exchanges.json" with { type: "json" };
import { initClickHouse } from "../storage/clickhouse";
import { initMongoDB } from "../storage/mongodb";
import { BinanceAdapter } from "./adapters/binance";
import { BlueSkyAdapter } from "./adapters/bluesky";
import { BybitAdapter } from "./adapters/bybit";
import { CoinankAdapter } from "./adapters/coinank";
import { CryptoTreasuriesResponseSchema } from "./adapters/crypto_treasuries";
import { OKXAdapter } from "./adapters/okx";
import { OsintAdapter, OsintFeedSchema } from "./adapters/osint"; // New Adapter
import { PolymarketCryptoLeadersAdapter } from "./adapters/polymarket_crypto_leaders";
import {
  GammaResponseSchema,
  PolymarketGammaAdapter,
} from "./adapters/polymarket_gamma";
import { RektNewsResponseSchema } from "./adapters/rekt_news";
import { TradersUnionAdapter } from "./adapters/traders_union";
import { TradingViewTechAdapter } from "./adapters/tradingview_tech";
import { Traffic511InAdapter } from "./adapters/traffic_511in";
import { WorldClockAdapter } from "./adapters/world_clock";
import { loadDataFlowNodes } from "./dataflow/loader";
import { NodeRegistry } from "./dataflow/registry";
import { GraphRuntime } from "./dataflow/Runtime";
import { AggregatorLayer } from "./layers/aggregator";
import { ObservableDataLayer } from "./layers/observable";
import { registerAgentsToNodeRegistry } from "./layers/pipeline/agents";
import { NewsImpactAgent } from "./layers/pipeline/agents/news_market_influence";
import { NewsSummarizerAgent } from "./layers/pipeline/agents/news_summarizer";
import { NewsVectorizationAgent } from "./layers/pipeline/agents/news_vectorizer";
import { OpenAIDemoAgent } from "./layers/pipeline/agents/openai_demo";
import { DegenNotificationFunction } from "./layers/pipeline/functions/degen_notification";
import { ExportDataFunction } from "./layers/pipeline/functions/export_data";
import { TickTackRegistratorFunction } from "./layers/pipeline/functions/tick_tack_registrator";
import { PipelineManager } from "./layers/pipeline/manager";
import { AggregatorEquityDistributionStorageStage } from "./layers/pipeline/stages/aggregator_equity_distribution_storage";
import { AggregatorLiquidationsStorageStage } from "./layers/pipeline/stages/aggregator_liquidations_storage";
import { AggregatorMetricsPerpPositionsStorageStage } from "./layers/pipeline/stages/aggregator_metrics_perp_positions_storage";
import { AggregatorPerpVolumeStorageStage } from "./layers/pipeline/stages/aggregator_perp_volume_storage";
import { AggregatorPositionsStorageStage } from "./layers/pipeline/stages/aggregator_positions_storage";
import { ArbitrageCardStage } from "./layers/pipeline/stages/arbitrage_card";
import { PriceAveragerStage } from "./layers/pipeline/stages/average";
import { BinanceLongShortAggregationStage } from "./layers/pipeline/stages/binance_ls_aggregation";
import { BinanceLongShortStorageStage } from "./layers/pipeline/stages/binance_ls_storage";
import { BlueSkyStorageStage } from "./layers/pipeline/stages/bluesky_storage";
import { BlueSkyVectorizerStage } from "./layers/pipeline/stages/bluesky_vectorizer";
import { CbsNbaStorageStage } from "./layers/pipeline/stages/cbs_nba_storage";
import { CoinankStorageStage } from "./layers/pipeline/stages/coinank_storage";
import { CryptoArbitrageStage } from "./layers/pipeline/stages/crypto_arbitrage";
import { CryptoBuyAggregationStage } from "./layers/pipeline/stages/crypto_buy_aggregation";
import { CryptoBuyFilterStage } from "./layers/pipeline/stages/crypto_buy_filter";
import { CryptoLeadersCacheStage } from "./layers/pipeline/stages/crypto_leaders_cache";
import { CryptoProfitabilityStage } from "./layers/pipeline/stages/crypto_profitability";
import { CryptoProfitabilityStorageStage } from "./layers/pipeline/stages/crypto_profitability_storage";
import { CryptoTreasuriesStorageStage } from "./layers/pipeline/stages/crypto_treasuries_storage";
import { DegenAnalysisStage } from "./layers/pipeline/stages/degen_analysis";
import { DegenFilterStage } from "./layers/pipeline/stages/degen_filter";
import { DegenStorageStage } from "./layers/pipeline/stages/degen_storage";
import { EthereumWhaleStorageStage } from "./layers/pipeline/stages/ethereum_whale_storage";
import { FBICurrentStage } from "./layers/pipeline/stages/fbi_current";
import { FearGreedCurrentStage } from "./layers/pipeline/stages/fear_greed_current";
import { FearGreedStorageStage } from "./layers/pipeline/stages/fear_greed_storage";
import { GlobalMarketBriefStage } from "./layers/pipeline/stages/global_market_brief";
import { GlobalSnapshotStage } from "./layers/pipeline/stages/global_snapshot";
import { HyperliquidStorageStage } from "./layers/pipeline/stages/hyperliquid_storage";
import { InterpolCurrentStage } from "./layers/pipeline/stages/interpol_current";
import { InterpolDetailsFetcherStage } from "./layers/pipeline/stages/interpol_details_fetcher";
import { MarketDynamicsStage } from "./layers/pipeline/stages/market_dynamics";
import { MarketSentimentStage } from "./layers/pipeline/stages/market_sentiment";
import { MassiveMarketStatusStorageStage } from "./layers/pipeline/stages/massive_market_status_storage";
import { NewsAggregatorStage } from "./layers/pipeline/stages/news_aggregator";
import { NewsApiStorageStage } from "./layers/pipeline/stages/news_api_storage";
import { NewsImpactStorageStage } from "./layers/pipeline/stages/news_impact_storage";
import { OrderBookNormalizationStage } from "./layers/pipeline/stages/normalize";
import { OKLinkStorageStage } from "./layers/pipeline/stages/oklink_storage";
import { OsintStorageStage } from "./layers/pipeline/stages/osint_storage";
import { PizzaMonitorStage } from "./layers/pipeline/stages/pizza_monitor";
import { PolygonMonitorStage } from "./layers/pipeline/stages/polygon_monitor_stage";
import { PolygonStorageStage } from "./layers/pipeline/stages/polygon_monitor_storage";
import { PolymarketFilteredReflectorStage } from "./layers/pipeline/stages/polymarket_filtered"; // New
import { PolymarketGammaStorageStage } from "./layers/pipeline/stages/polymarket_gamma_storage";
import { PolymarketMetricsStage } from "./layers/pipeline/stages/polymarket_metrics";
import { PolymarketPennyWhaleStage } from "./layers/pipeline/stages/polymarket_penny_whale";
import { PolymarketActivityReflectorStage } from "./layers/pipeline/stages/polymarket_reflector";
import { PolymarketStorageStage } from "./layers/pipeline/stages/polymarket_storage";
import { RektNewsStorageStage } from "./layers/pipeline/stages/rekt_news_storage";
import { SmartMoneyEvaluationStage } from "./layers/pipeline/stages/smart_money_evaluation";
import { SmartMoneyHistoryStorageStage } from "./layers/pipeline/stages/smart_money_history_storage";
import { SmartMoneyPredictionStage } from "./layers/pipeline/stages/smart_money_prediction";
import { SmartMoneyStorageStage } from "./layers/pipeline/stages/smart_money_storage";
import { SolanaStorageStage } from "./layers/pipeline/stages/solana_storage";
import { TickTackFilterStage } from "./layers/pipeline/stages/tick_tack_filter";
import { TradeFlowAggregationStage } from "./layers/pipeline/stages/trade_flow_aggregation";
import { TradersUnionStorageStage } from "./layers/pipeline/stages/traders_union_storage";
import { TradingViewTechStorageStage } from "./layers/pipeline/stages/tradingview_tech_storage";
import { Traffic511InCurrentStage } from "./layers/pipeline/stages/traffic_511in_current";
import { Traffic511InStorageStage } from "./layers/pipeline/stages/traffic_511in_storage";
import { UsInflationStorageStage } from "./layers/pipeline/stages/us_inflation_storage";
import { WhalePositionsCurrentStage } from "./layers/pipeline/stages/whale_positions_current";
import { WhalePositionsStorageStage } from "./layers/pipeline/stages/whale_positions_storage";
import { WorldMarketStatusStage } from "./layers/pipeline/stages/world_market_status";
import { WsdotCurrentStage } from "./layers/pipeline/stages/wsdot_current";
import { ProxyLayer } from "./layers/proxy";
import { AggregatorEquityDistributionSource } from "./layers/sources/aggregator_equity_distribution";
import { AggregatorLiquidationsSource } from "./layers/sources/aggregator_liquidations";
import { AggregatorMetricsPerpPositionsSource } from "./layers/sources/aggregator_metrics_perp_positions";
import { AggregatorPerpVolumeSource } from "./layers/sources/aggregator_perp_volume";
import { AggregatorPositionsSource } from "./layers/sources/aggregator_positions";
import type { BaseSource } from "./layers/sources/base";
import { BinanceSource } from "./layers/sources/binance";
import { BinanceAggTradeSource } from "./layers/sources/binance_aggtrade";
import { BinanceLongShortSource } from "./layers/sources/binance_long_short";
import {
  BlueSkyFeedSource,
  BlueSkyTrendingSource,
} from "./layers/sources/bluesky";
import { BybitSource } from "./layers/sources/bybit";
import { CbsNbaSource } from "./layers/sources/cbs_nba";
import { CoinankSource } from "./layers/sources/coinank";
import { EthereumWhaleSource } from "./layers/sources/ethereum_whale";
import { FBISource } from "./layers/sources/fbi";
import { FearGreedSource } from "./layers/sources/fear-greed";
import { HttpObserverSource } from "./layers/sources/http_observer"; // New Source
import { HyperliquidSource } from "./layers/sources/hyperliquid";
import { InterpolSource } from "./layers/sources/interpol";
import { IntervalTickerSource } from "./layers/sources/interval_ticker";
import { LiquidationsSource } from "./layers/sources/liquidations";
import { MassiveMarketStatusSource } from "./layers/sources/massive_market_status";
import { NewsApiSource } from "./layers/sources/news_api";
import { OKLinkSource } from "./layers/sources/oklink"; // Monitor
import { OKXSource } from "./layers/sources/okx";
import { PolygonMonitorSource } from "./layers/sources/polygon_monitor";
import { PolymarketCryptoLeadersSource } from "./layers/sources/polymarket_crypto_leaders";
import { PolymarketMassiveSource } from "./layers/sources/polymarket_massive";
import { PolyscanSource } from "./layers/sources/polyscan";
import { PolyscanWsSource } from "./layers/sources/polyscan_ws";
import { SolanaWatchdogSource } from "./layers/sources/solana_watchdog";
import { TickTackSource } from "./layers/sources/tick_tack";
import { TradersUnionSource } from "./layers/sources/traders_union";
import { TradingViewTechSource } from "./layers/sources/tradingview_tech";
import { Traffic511InSource } from "./layers/sources/traffic_511in";
import { UsInflationSource } from "./layers/sources/us_inflation";
import { WhalePositionsSource } from "./layers/sources/whale_positions";
import { WorldClockSource } from "./layers/sources/world_clock";
import { WsdotSource } from "./layers/sources/wsdot";
import { TransportLayer } from "./layers/transport";
import { CryptoLeadersCard } from "./observableCards/crypto_leaders_card";
import { CryptoPredictionCard } from "./observableCards/crypto_prediction_card";
import { CryptoTreasuriesCard } from "./observableCards/crypto_treasuries_card";
import { FearGreedCard } from "./observableCards/fear_greed_card";
import { GammaMarketsCard } from "./observableCards/gamma_markets_card";
import { InterpolCard } from "./observableCards/interpol_card";
import { MarketSnapshotCard } from "./observableCards/market_snapshot_card";
import { NewsImpactCard } from "./observableCards/news_impact_card";
import { PennyWhaleCard } from "./observableCards/penny_whale_card";
import { Traffic511InCard } from "./observableCards/traffic_511in_card";
import { WhaleMonitorCard } from "./observableCards/whale_monitor_card";
import { WhalePositionsCard } from "./observableCards/whale_positions_card";
import { WorldClockCard } from "./observableCards/world_clock_card";
import { WsdotCard } from "./observableCards/wsdot_card";
import { PizzaIndexSchema } from "./schemas/pizza_index";
import { configManager } from "./services/config_manager"; // New
import { logger } from "./utils/logger";

const TOP_ETH_TOKENS = [
  {
    symbol: "USDT",
    address: "0xdAC17F958D2ee523a2206206994597C13D831ec7" as `0x${string}`,
    decimals: 6,
  },
  {
    symbol: "USDC",
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as `0x${string}`,
    decimals: 6,
  },
  {
    symbol: "WETH",
    address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as `0x${string}`,
    decimals: 18,
  },
  {
    symbol: "DAI",
    address: "0x6B175474E89094C44Da98b954EedeAC495271d0F" as `0x${string}`,
    decimals: 18,
  },
  {
    symbol: "WBTC",
    address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599" as `0x${string}`,
    decimals: 8,
  },
];

export class Application {
  private aggregator: AggregatorLayer;
  private transport: TransportLayer;
  private proxy: ProxyLayer;
  private pipeline: PipelineManager;
  private observableLayer: ObservableDataLayer;
  private sources: BaseSource[] = [];
  private smartMoneyStage: SmartMoneyPredictionStage;
  public dataStudioRuntime: GraphRuntime;

  private readonly ports = [
    { id: "pool-1", port: 4001 },
    { id: "pool-2", port: 4002 },
    { id: "pool-3", port: 4003 },
    { id: "pool-4", port: 4004 },
    { id: "pool-5", port: 4005 },
  ];

  constructor() {
    // Collect all IDs (Ports + Internal Sources)
    const transportIds = this.ports.map((p) => p.id);
    const whaleSourceIds = TOP_ETH_TOKENS.map(
      (t) => `whale-${t.symbol.toLowerCase()}-source`,
    );

    const binanceLSSymbols = ["SOLUSDT", "BTCUSDT", "ETHUSDT", "XRPUSDT"];
    const binanceLSSourceIds = binanceLSSymbols.map(
      (s) => `binance-ls-${s.toLowerCase()}-source`,
    );

    const sourceIds = [
      "binance-source",
      "okx-source",
      "bybit-source",
      "bluesky-feed-source",
      "bluesky-trending-source",
      "cbs-nba-source",
      "binance-aggtrade-source",
      // Coinank Sources
      "coinank-btc-source",
      "coinank-eth-source",
      "coinank-xrp-source",
      "coinank-sol-source",
      "pizzint-source",
      "pizza-index-source",
      "oklink-source",
      "polyscan-source",
      "polyscan-ws-source",
      "fear-greed-source",
      "polymarket-gamma-source",
      "crypto-treasuries-source",
      "traffic-511in-source",
      "wsdot-source",
      "interpol-source",
      "fbi-source",
      "liquidations-source",
      "polygon-monitor-source",
      "tick-tack-source",
      "interval-ticker-source",
      "world-clock-source",
      "rekt-news-source",
      "us-inflation-source",
      "massive-market-status-source",
      "news-api-source",
      "polymarket-crypto-leaders-source",
      "polymarket-massive-source",
      "traders-union-source",
      "tradingview-tech-source",
      "hyperliquid-source",
      "aggregator-positions-source",
      "aggregator-liquidations-source",
      "whale-positions-source",
      ...whaleSourceIds,
      ...binanceLSSourceIds,
    ];

    // Initialize aggregator with all possible emitter IDs
    this.aggregator = new AggregatorLayer([...transportIds, ...sourceIds]);

    // Initialize Proxy Layer
    this.proxy = new ProxyLayer();
    this.proxy.register("binance-source", new BinanceAdapter());
    this.proxy.register("okx-source", new OKXAdapter());
    this.proxy.register("bybit-source", new BybitAdapter());
    this.proxy.register("bluesky-feed-source", new BlueSkyAdapter());
    this.proxy.register("bluesky-trending-source", new BlueSkyAdapter());

    // Coinank Adapters
    const coinankAdapter = new CoinankAdapter();
    this.proxy.register("coinank-btc-source", coinankAdapter);
    this.proxy.register("coinank-eth-source", coinankAdapter);
    this.proxy.register("coinank-xrp-source", coinankAdapter);
    this.proxy.register("coinank-sol-source", coinankAdapter);

    this.proxy.register("pizzint-source", new OsintAdapter());
    this.proxy.register(
      "polymarket-gamma-source",
      new PolymarketGammaAdapter(),
    );
    this.proxy.register("traffic-511in-source", new Traffic511InAdapter());
    this.proxy.register("world-clock-source", new WorldClockAdapter());
    this.proxy.register(
      "tradingview-tech-source",
      new TradingViewTechAdapter(),
    );
    this.proxy.register("traders-union-source", new TradersUnionAdapter());
    this.proxy.register(
      "polymarket-crypto-leaders-source",
      new PolymarketCryptoLeadersAdapter(),
    );

    // Initialize Pipeline Layer
    this.pipeline = new PipelineManager(this.aggregator);

    // Initialize Data Studio Runtime (Auto-start enabled)
    this.dataStudioRuntime = new GraphRuntime(undefined, true);

    // Initialize Observable Data Layer
    this.observableLayer = new ObservableDataLayer(this.aggregator);

    // Register Pipeline Stages
    this.pipeline.register(new OrderBookNormalizationStage());
    this.pipeline.register(new TradeFlowAggregationStage()); // CVD + Large Orders
    this.smartMoneyStage = new SmartMoneyPredictionStage();
    this.pipeline.register(this.smartMoneyStage);
    this.pipeline.register(new SmartMoneyStorageStage());
    this.pipeline.register(new SmartMoneyEvaluationStage());
    this.pipeline.register(new SmartMoneyHistoryStorageStage());
    this.pipeline.register(new CryptoArbitrageStage());
    this.pipeline.register(new GlobalSnapshotStage());
    this.pipeline.register(new ArbitrageCardStage());

    // Export Arbitrage Card to Data Studio
    this.pipeline.register(
      new ExportDataFunction({
        id: "arbitrage-card-channel",
        description: "Arbitrage Opportunities Feed",
        input: "arbitrage-card",
      }),
    );

    this.pipeline.register(new WorldMarketStatusStage());
    this.pipeline.register(new PriceAveragerStage());

    // Export Global Price to Data Studio
    this.pipeline.register(
      new ExportDataFunction({
        id: "global-price-feed",
        description: "Global Average Price Feed",
        input: "global-price",
      }),
    );

    // Export BlueSky Feeds
    this.pipeline.register(
      new ExportDataFunction({
        id: "bluesky-feed-channel",
        description: "BlueSky Feed Firehose",
        input: "bluesky-feed-source",
      }),
    );
    this.pipeline.register(
      new ExportDataFunction({
        id: "bluesky-trends-channel",
        description: "BlueSky Trending Topics",
        input: "bluesky-trending-source",
      }),
    );

    // Export Polyscan Realtime
    this.pipeline.register(
      new ExportDataFunction({
        id: "polyscan-ws-channel",
        description: "Polymarket Realtime Trades",
        input: "polyscan-ws-source",
      }),
    );

    // Export Hyperliquid
    this.pipeline.register(
      new ExportDataFunction({
        id: "hyperliquid-channel",
        description: "Hyperliquid Mid Prices",
        input: "hyperliquid-source",
      }),
    );

    // --- NEWS & SENTIMENT EXPORTS ---
    this.pipeline.register(
      new ExportDataFunction({
        id: "news-api-channel",
        description: "General News Feed",
        input: "news-api-source",
      }),
    );
    this.pipeline.register(
      new ExportDataFunction({
        id: "interpol-channel",
        description: "Interpol Notices",
        input: "interpol-source",
      }),
    );
    this.pipeline.register(
      new ExportDataFunction({
        id: "fbi-channel",
        description: "FBI Wanted List",
        input: "fbi-source",
      }),
    );
    this.pipeline.register(
      new ExportDataFunction({
        id: "fear-greed-channel",
        description: "Fear & Greed Index",
        input: "fear-greed-source",
      }),
    );
    this.pipeline.register(
      new ExportDataFunction({
        id: "massive-market-channel",
        description: "Massive Market Status",
        input: "massive-market-status-source",
      }),
    );
    this.pipeline.register(
      new ExportDataFunction({
        id: "cbs-nba-channel",
        description: "CBS NBA Scores",
        input: "cbs-nba-source",
      }),
    );
    this.pipeline.register(
      new ExportDataFunction({
        id: "rekt-news-channel",
        description: "Rekt News Feed",
        input: "rekt-news-source",
      }),
    );
    this.pipeline.register(
      new ExportDataFunction({
        id: "traders-union-channel",
        description: "Traders Union Analysis",
        input: "traders-union-source",
      }),
    );
    this.pipeline.register(
      new ExportDataFunction({
        id: "pizzint-channel",
        description: "OSINT Data Feed",
        input: "pizzint-source",
      }),
    );
    this.pipeline.register(
      new ExportDataFunction({
        id: "whale-positions-channel",
        description: "Whale Positions (>$300K)",
        input: "whale-positions-active",
      }),
    );

    this.pipeline.register(new OsintStorageStage());
    this.pipeline.register(new NewsAggregatorStage());
    this.pipeline.register(new NewsSummarizerAgent());
    this.pipeline.register(new GlobalMarketBriefStage());
    this.pipeline.register(new NewsVectorizationAgent());
    this.pipeline.register(new NewsImpactAgent());
    this.pipeline.register(new NewsImpactStorageStage());
    this.pipeline.register(new BlueSkyStorageStage());
    this.pipeline.register(new BlueSkyVectorizerStage());
    this.pipeline.register(new TradingViewTechStorageStage());
    this.pipeline.register(new TradersUnionStorageStage());
    this.pipeline.register(new RektNewsStorageStage());
    this.pipeline.register(new PizzaMonitorStage());
    this.pipeline.register(new PolygonMonitorStage());
    this.pipeline.register(new PolygonStorageStage());
    this.pipeline.register(new TickTackFilterStage()); // Demo Pipe
    this.pipeline.register(new OpenAIDemoAgent()); // Demo Agent
    this.pipeline.register(new TickTackRegistratorFunction()); // Demo Function
    this.pipeline.register(new OKLinkStorageStage());
    this.pipeline.register(new FearGreedStorageStage());
    this.pipeline.register(new HyperliquidStorageStage());
    this.pipeline.register(new AggregatorPositionsStorageStage());
    this.pipeline.register(new AggregatorLiquidationsStorageStage());

    this.pipeline.register(new EthereumWhaleStorageStage(whaleSourceIds));
    this.pipeline.register(new FearGreedCurrentStage());
    this.pipeline.register(new PolymarketStorageStage());
    this.pipeline.register(new PolymarketActivityReflectorStage());
    this.pipeline.register(new PolymarketMetricsStage());
    this.pipeline.register(new Traffic511InStorageStage());
    this.pipeline.register(new Traffic511InCurrentStage());
    this.pipeline.register(new WsdotCurrentStage());
    this.pipeline.register(new InterpolCurrentStage());
    this.pipeline.register(new InterpolDetailsFetcherStage());
    this.pipeline.register(new FBICurrentStage());
    this.pipeline.register(new PolymarketPennyWhaleStage());
    this.pipeline.register(new PolymarketGammaStorageStage());
    this.pipeline.register(new CryptoTreasuriesStorageStage());
    this.pipeline.register(new UsInflationStorageStage());
    this.pipeline.register(new MassiveMarketStatusStorageStage());
    this.pipeline.register(new NewsApiStorageStage());
    this.pipeline.register(new BinanceLongShortAggregationStage());
    this.pipeline.register(new BinanceLongShortStorageStage());
    this.pipeline.register(new MarketSentimentStage());
    this.pipeline.register(new CoinankStorageStage());
    this.pipeline.register(new CbsNbaStorageStage());
    this.pipeline.register(new MarketDynamicsStage());

    this.pipeline.register(new AggregatorPerpVolumeStorageStage());
    this.pipeline.register(new AggregatorEquityDistributionStorageStage());
    this.pipeline.register(new AggregatorMetricsPerpPositionsStorageStage());

    // Whale Positions Pipeline (>$300K positions from top traders)
    this.pipeline.register(new WhalePositionsStorageStage());
    this.pipeline.register(new WhalePositionsCurrentStage());

    // Crypto Leaders Pipeline (Polymarket crypto leaderboard tracking)
    this.pipeline.register(new CryptoLeadersCacheStage());
    this.pipeline.register(new CryptoBuyFilterStage());
    this.pipeline.register(new CryptoBuyAggregationStage());
    this.pipeline.register(new CryptoProfitabilityStage());
    this.pipeline.register(new CryptoProfitabilityStorageStage());

    // Degen Pipeline
    this.pipeline.register(new DegenFilterStage());
    this.pipeline.register(new DegenAnalysisStage());
    this.pipeline.register(new DegenStorageStage());
    this.pipeline.register(new DegenNotificationFunction());

    // Filtered Storage Stages
    this.pipeline.register(
      new PolymarketFilteredReflectorStage(
        "polymarket-filter-1k",
        1000,
        "polymarket_activity_1k",
        "polymarket-filtered-1k",
      ),
    );
    this.pipeline.register(
      new PolymarketFilteredReflectorStage(
        "polymarket-filter-300k",
        300000,
        "polymarket_activity_300k",
        "polymarket-filtered-300k",
      ),
    );
    this.pipeline.register(
      new PolymarketFilteredReflectorStage(
        "polymarket-filter-900k",
        900000,
        "polymarket_activity_900k",
        "polymarket-filtered-900k",
      ),
    );

    // Register Observable Cards
    const ethTokenSymbols = TOP_ETH_TOKENS.map((t) => t.symbol);
    this.observableLayer.register(
      new WhaleMonitorCard(this.aggregator, ethTokenSymbols),
    );
    this.observableLayer.register(new PennyWhaleCard(this.aggregator));
    this.observableLayer.register(new GammaMarketsCard(this.aggregator));
    this.observableLayer.register(new CryptoLeadersCard(this.aggregator));
    this.observableLayer.register(new CryptoPredictionCard(this.aggregator));
    this.observableLayer.register(new Traffic511InCard(this.aggregator));
    this.observableLayer.register(new WsdotCard(this.aggregator));
    this.observableLayer.register(new InterpolCard(this.aggregator));
    this.observableLayer.register(new CryptoTreasuriesCard(this.aggregator));
    this.observableLayer.register(new FearGreedCard(this.aggregator));
    this.observableLayer.register(new MarketSnapshotCard(this.aggregator));
    this.observableLayer.register(new NewsImpactCard(this.aggregator));
    this.observableLayer.register(new WorldClockCard(this.aggregator));
    this.observableLayer.register(new WhalePositionsCard(this.aggregator));

    // Initialize layers
    this.transport = new TransportLayer(this.aggregator);

    // Initialize Sources
    const pairs = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "ADAUSDT"];

    // Binance
    const binance = new BinanceSource(
      {
        pairs: pairs,
      },
      this.aggregator,
    );
    binance.setProxy(this.proxy);
    this.sources.push(binance);

    // Binance Long/Short Sources
    binanceLSSymbols.forEach((symbol) => {
      const source = new BinanceLongShortSource(
        {
          symbol: symbol,
          periodMinutes: 1,
          intervalMs: 60000,
        },
        this.aggregator,
      );
      this.sources.push(source);
    });

    // ance.setProxy(this.proxy);
    this.sources.push(binance);

    // World Clock
    const worldClock = new WorldClockSource({}, this.aggregator);
    worldClock.setProxy(this.proxy);
    this.sources.push(worldClock);

    // US Inflation Source
    const usInflation = new UsInflationSource(
      {
        intervalMs: 21600000, // 6 hours
      },
      this.aggregator,
    );
    this.sources.push(usInflation);

    // Massive Market Status Source
    const massiveStatus = new MassiveMarketStatusSource(
      {
        intervalMs: 1800000, // 30 minutes
      },
      this.aggregator,
    );
    this.sources.push(massiveStatus);

    // NewsAPI Source
    const newsApi = new NewsApiSource(
      {
        intervalMs: 900000, // 15 minutes
        query: "trump", // Default query
      },
      this.aggregator,
    );
    this.sources.push(newsApi);

    // BlueSky Sources
    const blueskyFeed = new BlueSkyFeedSource(
      {
        intervalMs: 5 * 60 * 1000,
      },
      this.aggregator,
    );
    blueskyFeed.setProxy(this.proxy);
    this.sources.push(blueskyFeed);

    const blueskyTrends = new BlueSkyTrendingSource(
      {
        intervalMs: 5 * 60 * 1000,
      },
      this.aggregator,
    );
    blueskyTrends.setProxy(this.proxy);
    this.sources.push(blueskyTrends);

    // OKX
    const okx = new OKXSource(
      {
        pairs: pairs,
      },
      this.aggregator,
    );
    okx.setProxy(this.proxy);
    this.sources.push(okx);

    // Bybit
    const bybit = new BybitSource(
      {
        pairs: pairs,
      },
      this.aggregator,
    );
    bybit.setProxy(this.proxy);
    this.sources.push(bybit);

    // CBS NBA Source
    const cbsNba = new CbsNbaSource(
      {
        accessToken: process.env.CBS_SPORTS_ACCESS_TOKEN || "",
      },
      this.aggregator,
    );
    this.sources.push(cbsNba);

    // Coinank Sources
    const coinankApiKey =
      "LWIzMWUtYzU0Ny1kMjk5LWI2ZDA3Yjc2MzFhYmIyZDkwM2RkfDM5OTE3MTE0MzE3NjYzNDc=";
    const coinankCoins = ["BTC", "ETH", "XRP", "SOL"];

    coinankCoins.forEach((coin) => {
      const source = new CoinankSource(
        {
          baseCoin: coin,
          apiKey: coinankApiKey,
        },
        this.aggregator,
      );
      source.setProxy(this.proxy);
      this.sources.push(source);
    });

    // Pizzint HttpObserver
    const pizzint = new HttpObserverSource(
      {
        id: "pizzint-source",
        name: "Pizzint OSINT Feed",
        description: "Monitors Pizzint OSINT feed for breaking news",
        url: () => {
          const today = new Date().toISOString().split("T")[0];
          return `https://www.pizzint.watch/api/osint-feed?includeTruth=1&limit=80&truthLimit=80&since=${today}`;
        },
        intervalMs: 15000, // Check every 15s
        schema: OsintFeedSchema,
      },
      this.aggregator,
    );
    // Note: HttpObserverSource does internal validation with the schema provided in config,
    // but we also registered an adapter in proxy for downstream correctness if it passes through proxy.
    // However, our sources usually emit directly to aggregator.
    // The setProxy is useful if the source was dumb, but HttpObserverSource is smart (validates internally).
    // We can still set it for consistency.
    pizzint.setProxy(this.proxy);
    this.sources.push(pizzint);

    // Rekt News Source
    const rektNews = new HttpObserverSource(
      {
        id: "rekt-news-source",
        name: "Rekt News Feed",
        description: "Monitors Rekt.news leaderboard for new hacks",
        url: "https://rekt.news/_next/data/VtRBjkYcEuAXd75gczHBR/en/leaderboard.json",
        intervalMs: 60 * 60 * 1000, // Check every 1 hour
        schema: RektNewsResponseSchema,
      },
      this.aggregator,
    );
    rektNews.setProxy(this.proxy);
    this.sources.push(rektNews);

    // Pizza Index Source
    const pizzaIndex = new HttpObserverSource(
      {
        id: "pizza-index-source",
        name: "Pizza Index Feed",
        description: "Monitors Pizza Activity near Pentagon",
        url: "https://www.pizzint.watch/api/dashboard-data?nocache=1",
        intervalMs: 15 * 60 * 1000,
        schema: PizzaIndexSchema,
      },
      this.aggregator,
    );
    this.sources.push(pizzaIndex);

    // OKLink NFT Monitor
    const oklink = new OKLinkSource(
      {
        id: "oklink-source",
        name: "OKLink NFT Monitor",
        description: "Monitors OKLink NFT data",
      },
      this.aggregator,
    );
    this.sources.push(oklink);

    // TickTack Demo Source
    const ticktack = new TickTackSource({}, this.aggregator);
    this.sources.push(ticktack);

    const intervalTicker = new IntervalTickerSource({}, this.aggregator);
    this.sources.push(intervalTicker);

    // Binance Aggregated Trades (for CVD / Trade Flow)
    const aggTrade = new BinanceAggTradeSource(
      {
        pairs: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT"],
      },
      this.aggregator,
    );
    this.sources.push(aggTrade);

    // Fear & Greed Index Source
    const fearGreed = new FearGreedSource(
      {
        historyDays: 30, // Fetch 30 days of history
        intervalMs: 60 * 60 * 1000, // Poll every hour
      },
      this.aggregator,
    );
    this.sources.push(fearGreed);

    // Traffic 511IN Source
    const traffic511 = new Traffic511InSource(
      {
        intervalMs: 60000, // Poll every minute
      },
      this.aggregator,
    );
    this.sources.push(traffic511);

    // WSDOT Source (Washington State)
    const wsdot = new WsdotSource(
      {
        intervalMs: 60000, // Poll every minute
      },
      this.aggregator,
    );
    this.sources.push(wsdot);

    // Interpol Notices Source
    const interpol = new InterpolSource(
      {
        resultPerPage: 50,
        intervalMs: 3600000, // Poll every hour
        fetchRed: true,
        fetchYellow: true,
        fetchUN: true,
      },
      this.aggregator,
    );
    this.sources.push(interpol);

    // FBI Wanted Source
    const fbi = new FBISource(
      {
        pageSize: 50,
        intervalMs: 3600000, // Poll every hour
      },
      this.aggregator,
    );
    this.sources.push(fbi);

    // Liquidations Source
    const liqSource = new LiquidationsSource({}, this.aggregator);
    // Since this is a BaseSource, it doesn't need explicit registerTopic if the BaseSource or Aggregator handles it?
    // BaseSource does NOT call registerTopic automatically usually, but let's check.
    // Looking at other sources: `this.aggregator.registerTopic(source.id)` is not always called explicitly for `BaseSource` derivatives if we just push to `this.sources`.
    // Wait, `this.aggregator` passed in constructor usually registers? No.
    // Let's check AggregatorLayer usage.
    // Actually, Application usually iterates sourceIds at start?
    // But `BaseSource` usually just emits to aggregator.
    // The aggregator topic registration is dynamic or static?
    // Let's register typically.
    // Looking at `fearGreed` above: `this.sources.push(fearGreed);` - no registerTopic call here.
    // So Aggregator might auto-register on first emit or we rely on `sourceIds` list being registered?
    // `sourceIds` is defined at the top of constructor usually.
    // Ah, I need to add `liquidations-source` to the `sourceIds` array at the top of the constructor!
    this.sources.push(liqSource);

    // Polyscan Source
    const polyscan = new PolyscanSource(
      {
        id: "polyscan-source",
        users: ["0x2b...8e"], // Example user, replace with real target
        intervalMs: 30000,
      },
      this.aggregator,
    );
    this.sources.push(polyscan);
    // Polyscan Realtime WebSocket
    const polyscanWs = new PolyscanWsSource(
      {
        id: "polyscan-ws-source",
        name: "Blue Whale Watch",
        description: "Streams large Polymarket trades",
        whaleThreshold: 1000, // 1000 shares
        whaleUsdcThreshold: 500, // $500 US
      },
      this.aggregator,
    );
    this.sources.push(polyscanWs);

    // NOTE: PolymarketSnapshotSource disabled - using HTTP polling with SQL filters instead
    // const polymarketSnapshot = new PolymarketSnapshotSource(
    //   { intervalMs: 500, limit: 300 },
    //   this.aggregator,
    // );
    // this.sources.push(polymarketSnapshot);

    // Polygon Monitor (Topology)
    const polygonMonitor = new PolygonMonitorSource(
      {
        addresses: [
          {
            address: "0xf70da97812CB96acDF810712Aa562db8dfA3dbEF",
            label: "Polymarket Relayer",
            type: "relayer",
          },
          {
            address: "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E",
            label: "Polymarket Contract",
            type: "contract",
          },
          {
            address: "0xc2e7800b5af46e6093872b177b7a5e7f0563be51",
            label: "Target Whale",
            type: "whale",
          },
        ],
      },
      this.aggregator,
    );
    this.sources.push(polygonMonitor);

    // Polymarket Gamma Source (via HttpObserver)
    const pmGamma = new HttpObserverSource(
      {
        id: "polymarket-gamma-source",
        name: "Polymarket Radar",
        url: "https://gamma-api.polymarket.com/markets?volume_num_min=1000000&order=volume24hrClob&liquidity_num_min=999&closed=false&ascending=false",
        intervalMs: 15000, // Check every 15 seconds
        schema: GammaResponseSchema,
      },
      this.aggregator,
    );
    // Use the generic HttpObserver, but we can still validate schema
    // The source itself handles validation using the passed schema.
    // Register adapter for completeness? Not strictly needed if Source does it.

    this.sources.push(pmGamma);

    // Crypto Treasuries Source (CoinMarketCap corporate holdings)
    const cryptoTreasuries = new HttpObserverSource(
      {
        id: "crypto-treasuries-source",
        name: "Crypto Treasuries",
        description: "Monitors corporate BTC/ETH holdings",
        url: "https://s3.coinmarketcap.com/treasuries/crypto_treasuries.json",
        intervalMs: 60 * 60 * 1000, // Check every hour
        schema: CryptoTreasuriesResponseSchema,
      },
      this.aggregator,
    );
    this.sources.push(cryptoTreasuries);

    // Polymarket Crypto Leaders Source
    const cryptoLeaders = new PolymarketCryptoLeadersSource(
      {
        intervalMs: 60 * 60 * 1000, // Poll every hour
        limit: 50, // Top 50 crypto traders
      },
      this.aggregator,
    );
    cryptoLeaders.setProxy(this.proxy);
    this.sources.push(cryptoLeaders);

    // Whale Positions Source (tracks large positions >$300K across all categories)
    const whalePositions = new WhalePositionsSource(
      {
        intervalMs: 5 * 60 * 1000, // Poll every 5 minutes
        minValueUsd: 300000, // $300K minimum
        limit: 100, // Top 100 traders per category
        categories: [
          "crypto",
          "sports",
          "politics",
          "pop-culture",
          "business",
          "science",
        ],
      },
      this.aggregator,
    );
    this.sources.push(whalePositions);

    // Polymarket Massive Events Source
    const pmMassive = new PolymarketMassiveSource({}, this.aggregator);
    this.sources.push(pmMassive);

    // TradingView Tech Analysis Source
    const tradingViewTech = new TradingViewTechSource({}, this.aggregator);
    tradingViewTech.setProxy(this.proxy);
    this.sources.push(tradingViewTech);

    // Traders Union Source
    const tradersUnion = new TradersUnionSource({}, this.aggregator);
    tradersUnion.setProxy(this.proxy);
    this.sources.push(tradersUnion);

    // Ethereum Whale Sources
    TOP_ETH_TOKENS.forEach((token) => {
      const source = new EthereumWhaleSource(
        {
          id: `whale-${token.symbol.toLowerCase()}-source`,
          name: `Whale Watch: ${token.symbol}`,
          description: `Monitors large ${token.symbol} transfers`,
          rpcUrl: "wss://ethereum-rpc.publicnode.com",
          tokens: [token],
          minValueUsd: 50000,
        },
        this.aggregator,
      );
      this.sources.push(source);
    });

    // Hyperliquid Source
    const hyperliquid = new HyperliquidSource({}, this.aggregator);
    this.sources.push(hyperliquid);

    // Aggregator Positions
    const aggPositions = new AggregatorPositionsSource({}, this.aggregator);
    this.sources.push(aggPositions);

    // Aggregator Liquidations
    const aggLiquidations = new AggregatorLiquidationsSource(
      {},
      this.aggregator,
    );
    this.sources.push(aggLiquidations);

    // Aggregator Perp Volume
    const aggPerpVolume = new AggregatorPerpVolumeSource({}, this.aggregator);
    this.sources.push(aggPerpVolume);

    // Aggregator Equity Distribution
    const aggEquityDist = new AggregatorEquityDistributionSource(
      {},
      this.aggregator,
    );
    this.sources.push(aggEquityDist);

    // Aggregator Metrics Perp Positions
    const aggMetricsPerp = new AggregatorMetricsPerpPositionsSource(
      {},
      this.aggregator,
    );
    this.sources.push(aggMetricsPerp);

    this.sources.push(polyscanWs);
  }

  public registerPipelineStage(stage: any) {
    this.pipeline.register(stage);
  }

  public async start() {
    logger.info("Starting Application...");

    // Initialize Config
    await configManager.load();
    logger.info("Configuration loaded");

    // Initialize Solana Watchdogs (Dynamic Sources)
    const config = configManager.getConfig();
    if (config.solana?.enabled) {
      const solanaSourceIds: string[] = [];
      const watchdogs = config.solana.watchdog || [];
      const exchangeWallets = Object.values(solanaObjects) as any[];

      logger.info(
        {
          configured: watchdogs.length,
          exchanges: exchangeWallets.length,
        },
        "Initializing Solana Watchdogs",
      );

      for (const dog of watchdogs) {
        const source = new SolanaWatchdogSource(
          {
            name: dog.name,
            address: dog.address,
            description: dog.description || "Solana Watchdog",
            rpcUrl: config.solana.rpc_url,
            commitment: config.solana.commitment,
          },
          this.aggregator,
        );

        // Register Topic in Aggregator
        this.aggregator.registerTopic(source.id);

        // Add to sources
        this.sources.push(source);
        solanaSourceIds.push(source.id);
      }

      // Initialize Exchange Wallets
      for (const wallet of exchangeWallets) {
        const source = new SolanaWatchdogSource(
          {
            name: wallet.account_label,
            address: wallet.account_address,
            description: wallet.account_tags?.join(", ") || "Exchange Wallet",
            rpcUrl: config.solana.rpc_url,
            commitment: config.solana.commitment,
          },
          this.aggregator,
        );

        // Register Topic in Aggregator
        this.aggregator.registerTopic(source.id);

        // Add to sources
        this.sources.push(source);
        solanaSourceIds.push(source.id);
      }

      // Register Storage Stage
      if (solanaSourceIds.length > 0) {
        this.pipeline.register(new SolanaStorageStage(solanaSourceIds));
      }
    }

    // Initialize Storage
    await initClickHouse();
    await initMongoDB();

    // Load Data Flow Nodes
    await loadDataFlowNodes(
      NodeRegistry.getInstance(),
      path.join(process.cwd(), "src/server/dataFlowNodes"),
    );

    // Register Exported Agents as DataStudio Nodes
    registerAgentsToNodeRegistry(NodeRegistry.getInstance());

    // Initialize Data Studio Runtime (now that nodes are loaded)
    await this.dataStudioRuntime.init();

    // Start Pipeline
    this.pipeline.start();
    this.observableLayer.start();

    // Start Transport (Inbound)
    this.transport.start(this.ports);

    // Start Sources (Outbound -> Inbound)
    logger.info("Connecting to data sources...");
    await Promise.all(this.sources.map((s) => s.connect()));

    logger.info("Application ready");

    // Log initial graph
    logger.info(
      { graph: this.pipeline.getGraph() },
      "Dependency Graph Initialized",
    );
  }

  public getGraph() {
    const graph = this.pipeline.getGraph();
    const obsNodes = this.observableLayer.getGraphNodes();

    const nodes = [...graph.nodes, ...obsNodes];
    const edges = [...graph.edges];

    obsNodes.forEach((node) => {
      node.inputs.forEach((input) => {
        edges.push({ from: input, to: node.id });
      });
    });

    return { nodes, edges, stats: graph.stats };
  }

  public getSnapshots() {
    return this.observableLayer.getSnapshots();
  }

  public getSmartMoneyRealTimeState() {
    return this.smartMoneyStage.getRealTimeState();
  }

  public get feed$() {
    return this.aggregator.feed$;
  }
}
