import { logger } from "@/server/utils/logger";
import { createClient } from "@clickhouse/client";
export const clickhouse = createClient({
  url: process.env.CLICKHOUSE_URL || "http://localhost:8123",
  username: process.env.CLICKHOUSE_USER || "default",
  password: process.env.CLICKHOUSE_PASSWORD || "",
  database: process.env.CLICKHOUSE_DB || "default",
  keep_alive: { enabled: false }, // Disable keep-alive to avoid stale connection issues on startup
  request_timeout: 30000,
});

export const initClickHouse = async () => {
  // Retry logic for ClickHouse connection
  const maxRetries = 20;
  const retryDelayMs = 5000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const connected = await clickhouse.ping();
      if (connected) {
        // Validate with a real query to ensure query handler is active
        await clickhouse.query({ query: "SELECT 1" });

        logger.info("ClickHouse connection verified (Ping + Select)");

        // Add a small initial delay to allow server to fully settle
        await new Promise((r) => setTimeout(r, 1000));

        await runSystemCleanup();
        await runMigrations();
        return;
      } else {
        throw new Error("Ping returned false");
      }
    } catch (err) {
      logger.warn(
        { attempt, maxRetries, err },
        "ClickHouse not ready, retrying...",
      );
      if (attempt === maxRetries) {
        logger.error({ err }, "Failed to connect to ClickHouse after retries");
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
};

/**
 * Helper to safely execute a migration query.
 * Catches errors and logs them without crashing the app.
 */
async function safeExec(query: string, label: string) {
  try {
    await clickhouse.exec({ query });
    logger.info(`ClickHouse schema: ${label} verified`);
  } catch (err: any) {
    // Critical connection error - rethrow to trigger global retry
    if (
      err?.code === "ECONNREFUSED" ||
      err?.message?.includes("ECONNREFUSED") ||
      err?.message?.includes("socket hang up")
    ) {
      throw err;
    }

    // Ignore "already exists" errors for columns
    if (err?.message?.includes("already exists")) {
      logger.debug(`ClickHouse schema: ${label} already up to date`);
    } else {
      logger.error(
        { err: err?.message || err, label },
        `Failed to apply migration: ${label}`,
      );
    }
  }
}

/**
 * Helper to add a column if it doesn't exist.
 * ClickHouse doesn't have "ADD COLUMN IF NOT EXISTS" so we catch the error.
 */
async function _addColumnIfNotExists(
  table: string,
  column: string,
  type: string,
  defaultValue?: string,
) {
  const defaultClause = defaultValue ? ` DEFAULT ${defaultValue}` : "";
  const query = `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${type}${defaultClause}`;
  try {
    await clickhouse.exec({ query });
  } catch (err: any) {
    // Column already exists - that's fine
    if (!err?.message?.includes("already exists")) {
      logger.warn({ table, column, err }, "Failed to add column");
    }
  }
}

/**
 * Cleans up heavy system log tables to free```typescript
/**
 * Cleans up heavy system log tables to free disk space.
 * These tables can grow indefinitely if not managed.
 */
async function runSystemCleanup() {
  const tablesToDrop = [
    "system.text_log",
    "system.trace_log",
    "system.query_log",
    "system.processors_profile_log",
    "system.part_log",
    "system.metric_log",
    "system.asynchronous_metric_log",
  ];

  logger.info("Running system log cleanup...");
  for (const table of tablesToDrop) {
    try {
      await clickhouse.exec({ query: `DROP TABLE IF EXISTS ${table}` });
      logger.info({ table }, "Dropped system table");
    } catch (err: any) {
      if (
        err?.code === "ECONNREFUSED" ||
        err?.message?.includes("ECONNREFUSED") ||
        err?.message?.includes("socket hang up")
      ) {
        throw err;
      }

      // Ignore errors if table doesn't exist or other issues
      logger.debug(
        { table, err },
        "Failed to drop system table (might be disabled or protected)",
      );
    }
  }
}

const runMigrations = async () => {
  logger.info("Checking ClickHouse schemas...");

  // Table: osint_tweets
  const osintQuery = `
    CREATE TABLE IF NOT EXISTS osint_tweets (
      id String,
      text String,
      url String,
      timestamp DateTime,
      handle String,
      is_alert UInt8,
      ingested_at DateTime DEFAULT now()
    )
    ENGINE = ReplacingMergeTree()
    ORDER BY (id, timestamp)
  `;
  await safeExec(osintQuery, "osint_tweets");

  // Table: us_inflation_events
  const usInflationQuery = `
    CREATE TABLE IF NOT EXISTS us_inflation_events (
      date Date,
      cpi Nullable(Float64),
      cpi_core Nullable(Float64),
      cpi_yoy Nullable(Float64),
      pce Nullable(Float64),
      pce_core Nullable(Float64),
      pce_spending Nullable(Float64),
      ingested_at DateTime DEFAULT now()
    )
    ENGINE = ReplacingMergeTree()
    ORDER BY date
  `;
  await safeExec(usInflationQuery, "us_inflation_events");

  // Table: binance_ls_ratio
  const binanceLSQuery = `
    CREATE TABLE IF NOT EXISTS binance_ls_ratio (
        symbol String,
        ratio Float64,
        long_acc Float64,
        short_acc Float64,
        timestamp DateTime,
        ingested_at DateTime DEFAULT now()
    )
    ENGINE = ReplacingMergeTree()
    ORDER BY (symbol, timestamp)
  `;
  await safeExec(binanceLSQuery, "binance_ls_ratio");

  // Table: news_market_impact
  const newsImpactQuery = `
    CREATE TABLE IF NOT EXISTS news_market_impact (
        market_id String,
        title String,
        ticker String,
        volume_24hr Float64,
        relevance Float64,
        impact_score Float64,
        prob Float64,
        timestamp DateTime,
        ingested_at DateTime DEFAULT now()
    )
    ENGINE = MergeTree()
    ORDER BY (market_id, timestamp)
  `;
  await safeExec(newsImpactQuery, "news_market_impact");

  // Table: massive_market_status_events
  const massiveMarketStatusQuery = `
    CREATE TABLE IF NOT EXISTS massive_market_status_events (
      timestamp DateTime,
      market String,
      crypto_status String,
      fx_status String,
      nasdaq_status String,
      nyse_status String,
      otc_status String,
      server_time String,
      ingested_at DateTime DEFAULT now()
    )
    ENGINE = ReplacingMergeTree()
    ORDER BY timestamp
  `;
  await safeExec(massiveMarketStatusQuery, "massive_market_status_events");

  // Table: news_api_articles
  const newsApiQuery = `
    CREATE TABLE IF NOT EXISTS news_api_articles (
      id String,
      source_id Nullable(String),
      source_name String,
      author Nullable(String),
      title String,
      description Nullable(String),
      url String,
      image_url Nullable(String),
      published_at DateTime,
      content Nullable(String),
      ingested_at DateTime DEFAULT now()
    )
    ENGINE = ReplacingMergeTree()
    ORDER BY (id, published_at)
  `;
  await safeExec(newsApiQuery, "news_api_articles");

  // Table: degen_trades
  const degenTradesQuery = `
    CREATE TABLE IF NOT EXISTS degen_trades (
      tx_hash String,
      timestamp DateTime,
      asset_id String,
      title String,
      outcome String,
      side String,
      price Float64,
      size Float64,
      value_usd Float64,
      wallet String,
      degen_type String,
      rule_triggered String,
      ingested_at DateTime DEFAULT now()
    )
    ENGINE = ReplacingMergeTree()
    ORDER BY (tx_hash, timestamp)
  `;
  await safeExec(degenTradesQuery, "degen_trades");

  // Table: traffic_events_511in
  const traffic511Query = `
    CREATE TABLE IF NOT EXISTS traffic_events_511in (
      id String,
      title String,
      headline String,
      description String,
      route String,
      width_limit String,
      begin_time DateTime,
      updated_time DateTime,
      ingested_at DateTime DEFAULT now()
    )
    ENGINE = ReplacingMergeTree()
    ORDER BY (id, updated_time)
  `;
  await safeExec(traffic511Query, "traffic_events_511in");

  // Table: hyperliquid_mids
  const hlMidsQuery = `
    CREATE TABLE IF NOT EXISTS hyperliquid_mids (
      symbol String,
      price Float64,
      timestamp DateTime64(3),
      ingested_at DateTime DEFAULT now()
    )
    ENGINE = ReplacingMergeTree()
    ORDER BY (symbol, timestamp)
    TTL timestamp + INTERVAL 7 DAY
  `;
  await safeExec(hlMidsQuery, "hyperliquid_mids");

  // Table: aggregator_perp_volume
  const aggPerpVolQuery = `
    CREATE TABLE IF NOT EXISTS aggregator_perp_volume (
      timestamp DateTime,
      volume_24h Float64,
      ingested_at DateTime DEFAULT now()
    )
    ENGINE = ReplacingMergeTree()
    ORDER BY timestamp
    TTL timestamp + INTERVAL 7 DAY
  `;
  await safeExec(aggPerpVolQuery, "aggregator_perp_volume");

  // Table: aggregator_equity_distribution
  const aggEquityDistQuery = `
    CREATE TABLE IF NOT EXISTS aggregator_equity_distribution (
      timestamp DateTime,
      total_equity Float64,
      total_wallets UInt64,
      buckets_json String,
      ingested_at DateTime DEFAULT now()
    )
    ENGINE = ReplacingMergeTree()
    ORDER BY timestamp
    TTL timestamp + INTERVAL 7 DAY
  `;
  await safeExec(aggEquityDistQuery, "aggregator_equity_distribution");

  // Table: aggregator_metrics_perp_positions
  const aggMetricsPerpQuery = `
    CREATE TABLE IF NOT EXISTS aggregator_metrics_perp_positions (
      timestamp DateTime,
      total_open_interest Float64,
      total_open_positions UInt64,
      perp_equity Float64,
      count_in_profit UInt64,
      ingested_at DateTime DEFAULT now()
    )
    ENGINE = ReplacingMergeTree()
    ORDER BY timestamp
    TTL timestamp + INTERVAL 7 DAY
  `;
  await safeExec(aggMetricsPerpQuery, "aggregator_metrics_perp_positions");

  // Table: aggregator_positions
  const aggPosQuery = `
    CREATE TABLE IF NOT EXISTS aggregator_positions (
      coin String,
      position_count Float64,
      position_count_long Float64,
      total_value Float64,
      total_value_long Float64,
      timestamp DateTime64(3),
      ingested_at DateTime DEFAULT now()
    )
    ENGINE = ReplacingMergeTree()
    ORDER BY (coin, timestamp)
  `;
  await safeExec(aggPosQuery, "aggregator_positions");

  // Table: aggregator_liquidations
  const aggLiqQuery = `
    CREATE TABLE IF NOT EXISTS aggregator_liquidations (
      coin String,
      price_bin_start Float64,
      price_bin_end Float64,
      liquidation_value Float64,
      positions_count Float64,
      timestamp DateTime64(3),
      ingested_at DateTime DEFAULT now()
    )
    ENGINE = ReplacingMergeTree()
    ORDER BY (coin, price_bin_start, timestamp)
    TTL timestamp + INTERVAL 3 DAY
  `;
  await safeExec(aggLiqQuery, "aggregator_liquidations");

  // Table: news_feed
  const newsQuery = `
    CREATE TABLE IF NOT EXISTS news_feed (
      uuid String,
      original_id String,
      source String,
      content String,
      url String,
      author String,
      score Float32,
      published_at DateTime,
      created_at DateTime DEFAULT now()
    )
    ENGINE = ReplacingMergeTree()
    ORDER BY (published_at, uuid)
  `;
  await safeExec(newsQuery, "news_feed");

  // Table: pizza_index_places
  const pizzaQuery = `
    CREATE TABLE IF NOT EXISTS pizza_index_places (
      place_id String,
      date Date,
      name String,
      address String,
      current_popularity Nullable(Int32),
      percentage_of_usual Nullable(Float32),
      is_spike UInt8,
      spike_magnitude Nullable(Float32),
      data_source String,
      recorded_at DateTime,
      data_freshness String,
      ingested_at DateTime DEFAULT now()
    )
    ENGINE = ReplacingMergeTree()
    ORDER BY (date, place_id, recorded_at)
  `;
  await safeExec(pizzaQuery, "pizza_index_places");

  // Table: polygon_transfers
  const polygonQuery = `
    CREATE TABLE IF NOT EXISTS polygon_transfers (
       hash String,
       from_address String,
       to_address String,
       value Float64,
       symbol String,
       from_label Nullable(String),
       to_label Nullable(String),
       relayer Nullable(String),
       timestamp DateTime,
       ingested_at DateTime DEFAULT now()
    )
    ENGINE = MergeTree()
    ORDER BY (timestamp, from_address, to_address)
  `;
  await safeExec(polygonQuery, "polygon_transfers");

  // Table: polymarket_positions
  const polyQuery = `
    CREATE TABLE IF NOT EXISTS polymarket_positions (
      user String,
      conditionId String,
      asset String,
      title String,
      size Float64,
      price Float64,
      value Float64,
      symbol String,
      outcomeIndex UInt8,
      timestamp DateTime,
      ingested_at DateTime DEFAULT now()
    )
    ENGINE = MergeTree()
    ORDER BY (timestamp, user, conditionId)
  `;
  await safeExec(polyQuery, "polymarket_positions");

  // Table: polymarket_activity
  const polyActivityQuery = `
    CREATE TABLE IF NOT EXISTS polymarket_activity (
      transactionHash String,
      timestamp DateTime,
      side String,
      asset String,
      title String,
      size Float64,
      price Float64,
      usdcValue Float64,
      proxyWallet String,
      outcome String,
      eventSlug String,
      ingested_at DateTime DEFAULT now()
    )
    ENGINE = MergeTree()
    ORDER BY (timestamp, transactionHash)
  `;
  await safeExec(polyActivityQuery, "polymarket_activity");

  // Table: polymarket_penny_whales
  const polyPennyWhalesQuery = `
    CREATE TABLE IF NOT EXISTS polymarket_penny_whales (
      transactionHash String,
      asset String,
      title String,
      outcome String,
      side String,
      price Float64,
      size Float64,
      value Float64,
      timestamp DateTime,
      user String,
      ingested_at DateTime DEFAULT now()
    )
    ENGINE = MergeTree()
    ORDER BY (timestamp, transactionHash)
  `;
  await safeExec(polyPennyWhalesQuery, "polymarket_penny_whales");

  // Filtered Tables
  const levels = ["1k", "300k", "900k"];
  for (const level of levels) {
    const query = `
      CREATE TABLE IF NOT EXISTS polymarket_activity_${level} (
        transactionHash String,
        timestamp DateTime,
        side String,
        asset String,
        title String,
        size Float64,
        price Float64,
        usdcValue Float64,
        proxyWallet String,
        outcome String,
        eventSlug String,
        ingested_at DateTime DEFAULT now()
      )
      ENGINE = MergeTree()
      ORDER BY (timestamp, transactionHash)
    `;
    await safeExec(query, `polymarket_activity_${level}`);
  }

  // Table: oklink_nft_transfers
  const oklinkQuery = `
    CREATE TABLE IF NOT EXISTS oklink_nft_transfers (
      txhash String,
      blockHeight UInt64,
      blocktime DateTime,
      from String,
      to String,
      tokenContractAddress String,
      tokenId String,
      action String DEFAULT 'transfer',
      value Float64, 
      chain String,
      alias String,
      symbol String,
      realValue Float64,
      ingested_at DateTime DEFAULT now()
    )
    ENGINE = ReplacingMergeTree()
    ORDER BY (chain, blocktime, txhash, tokenId)
  `;
  await safeExec(oklinkQuery, "oklink_nft_transfers");

  // Table: fear_greed_index
  const fearGreedQuery = `
    CREATE TABLE IF NOT EXISTS fear_greed_index (
      date Date,
      score UInt8,
      sentiment String,
      btc_price Float64,
      btc_volume Float64,
      timestamp UInt64,
      ingested_at DateTime DEFAULT now()
    )
    ENGINE = ReplacingMergeTree()
    ORDER BY (date)
  `;
  await safeExec(fearGreedQuery, "fear_greed_index");

  // Table: ethereum_whales
  const ethereumWhaleQuery = `
    CREATE TABLE IF NOT EXISTS ethereum_whales (
      transactionHash String,
      blockNumber UInt64,
      timestamp DateTime,
      from String,
      to String,
      value Float64,
      symbol String,
      tokenAddress String,
      ingested_at DateTime DEFAULT now()
    )
    ENGINE = MergeTree()
    ORDER BY (timestamp, transactionHash)
  `;
  await safeExec(ethereumWhaleQuery, "ethereum_whales");

  // Table: polymarket_gamma_events
  const gammaQuery = `
    CREATE TABLE IF NOT EXISTS polymarket_gamma_events (
      marketId String,
      eventType String, 
      question String,
      slug String,
      volume Float64,
      liquidity Float64,
      timestamp DateTime,
      ingested_at DateTime DEFAULT now()
    )
    ENGINE = MergeTree()
    ORDER BY (timestamp, marketId)
  `;
  await safeExec(gammaQuery, "polymarket_gamma_events");

  // Table: crypto_treasuries
  const treasuriesQuery = `
    CREATE TABLE IF NOT EXISTS crypto_treasuries (
      company_name String,
      ticker String,
      coin String,
      holdings Float64,
      holdings_change Float64,
      latest_acquisitions Float64,
      cost_basis Float64,
      data_as_of Nullable(String),
      timestamp DateTime,
      ingested_at DateTime DEFAULT now()
    )
    ENGINE = MergeTree()
    ORDER BY (timestamp, ticker, coin)
  `;
  await safeExec(treasuriesQuery, "crypto_treasuries");

  // Table: solana_account_updates
  const solanaQuery = `
    CREATE TABLE IF NOT EXISTS solana_account_updates (
      source String,
      timestamp UInt64,
      address String,
      slot UInt64,
      lamports UInt64,
      owner String,
      executable UInt8,
      rentEpoch UInt64,
      data_base64 String,
      ingested_at DateTime DEFAULT now()
    )
    ENGINE = MergeTree()
    ORDER BY (timestamp, address)
  `;
  await safeExec(solanaQuery, "solana_account_updates");

  // Table: polygon_graph_positions
  const graphPosQuery = `
    CREATE TABLE IF NOT EXISTS polygon_graph_positions (
      node_id String,
      x Float64,
      y Float64,
      updated_at DateTime DEFAULT now()
    )
    ENGINE = ReplacingMergeTree()
    ORDER BY node_id
  `;
  await safeExec(graphPosQuery, "polygon_graph_positions");

  // Table: monitored_addresses
  const monitorQuery = `
    CREATE TABLE IF NOT EXISTS monitored_addresses (
      address String,
      label String,
      is_active UInt8 DEFAULT 1,
      added_at DateTime DEFAULT now()
    )
    ENGINE = ReplacingMergeTree()
    ORDER BY address
  `;
  await safeExec(monitorQuery, "monitored_addresses");

  // Table: rekt_news_events
  const rektQuery = `
    CREATE TABLE IF NOT EXISTS rekt_news_events (
      slug String,
      title String,
      date String,
      amount Float64,
      audit_status String,
      incident_date String,
      tags Array(String),
      excerpt String,
      banner_url String,
      ingested_at DateTime DEFAULT now()
    )
    ENGINE = ReplacingMergeTree()
    ORDER BY (slug)
  `;
  await safeExec(rektQuery, "rekt_news_events");

  // Table: crypto_leaders_buys_15m - aggregated crypto buys by Polymarket leaders
  const cryptoLeadersBuysQuery = `
    CREATE TABLE IF NOT EXISTS crypto_leaders_buys_15m (
      window_start DateTime,
      window_end DateTime,
      symbol String,
      buy_count UInt32,
      total_amount Float64,
      total_usd Float64,
      unique_traders UInt32,
      avg_buy_size Float64,
      ingested_at DateTime DEFAULT now()
    )
    ENGINE = ReplacingMergeTree()
    ORDER BY (window_start, symbol)
  `;
  await safeExec(cryptoLeadersBuysQuery, "crypto_leaders_buys_15m");

  // Table: crypto_trader_performance_snapshots
  const cryptoPerfQuery = `
    CREATE TABLE IF NOT EXISTS crypto_trader_performance_snapshots (
      window_start DateTime,
      window_end DateTime,
      user_address String,
      user_name String,
      user_rank UInt32 DEFAULT 100,
      asset String,
      outcome String,
      avg_entry_price Float64,
      price_to_beat Nullable(Float64),
      current_spot_price Float64,
      price_change_percent Float64,
      distance_to_beat Nullable(Float64),
      is_profitable UInt8,
      total_size Float64,
      ingested_at DateTime DEFAULT now()
    )
    ENGINE = MergeTree()
    ORDER BY (window_start, user_address, asset)
  `;
  await safeExec(cryptoPerfQuery, "crypto_trader_performance_snapshots");

  // Migration: Add is_visible to polygon_graph_positions if not exists
  try {
    await clickhouse.exec({
      query:
        "ALTER TABLE polygon_graph_positions ADD COLUMN IF NOT EXISTS is_visible UInt8 DEFAULT 1",
    });
    logger.info("Migrated polygon_graph_positions with is_visible");
  } catch (err) {
    logger.warn(
      { err },
      "Failed to add is_visible column (might already exist)",
    );
  }

  // Migration: Add user_rank, price_to_beat, distance_to_beat to crypto_trader_performance_snapshots
  try {
    await clickhouse.exec({
      query: `
        ALTER TABLE crypto_trader_performance_snapshots 
        ADD COLUMN IF NOT EXISTS user_rank UInt32 DEFAULT 100,
        ADD COLUMN IF NOT EXISTS price_to_beat Nullable(Float64),
        ADD COLUMN IF NOT EXISTS distance_to_beat Nullable(Float64)
      `,
    });
    logger.info(
      "Migrated crypto_trader_performance_snapshots with rank and price_to_beat",
    );
  } catch (err) {
    logger.warn(
      { err },
      "Failed to add new columns to crypto_trader_performance_snapshots (might already exist)",
    );
  }

  // Table: tradingview_tech_analysis
  const tvTechQuery = `
    CREATE TABLE IF NOT EXISTS tradingview_tech_analysis (
      symbol String,
      rank UInt32,
      tech_rating String,
      ma_rating String,
      os_rating String,
      rsi Nullable(Float64),
      mom Nullable(Float64),
      ao Nullable(Float64),
      cci20 Nullable(Float64),
      stoch_k Nullable(Float64),
      stoch_d Nullable(Float64),
      candle_3_black_crows UInt8,
      candle_3_white_soldiers UInt8,
      candle_engulfing_bearish UInt8,
      candle_engulfing_bullish UInt8,
      candle_morning_star UInt8,
      candle_evening_star UInt8,
      candle_doji UInt8,
      candle_hammer UInt8,
      candle_shooting_star UInt8,
      ingested_at DateTime DEFAULT now()
    )
    ENGINE = MergeTree()
    ORDER BY (ingested_at, symbol)
  `;
  await safeExec(tvTechQuery, "tradingview_tech_analysis");

  // Table: traders_union_analysis
  const tuQuery = `
    CREATE TABLE IF NOT EXISTS traders_union_analysis (
      ticker_id UInt32,
      forecast String,
      direction String,
      ta_buy UInt8,
      ta_sell UInt8,
      ta_neutral UInt8,
      ma_buy UInt8,
      ma_sell UInt8,
      ma_neutral UInt8,
      macd_value Nullable(Float64),
      macd_forecast Nullable(String),
      momentum_value Nullable(Float64),
      momentum_forecast Nullable(String),
      ao_value Nullable(Float64),
      ao_forecast Nullable(String),
      cci_value Nullable(Float64),
      cci_forecast Nullable(String),
      ingested_at DateTime DEFAULT now()
    )
    ENGINE = MergeTree()
    ORDER BY (ingested_at, ticker_id)
  `;
  await safeExec(tuQuery, "traders_union_analysis");

  // Table: coinank_long_short
  const coinankQuery = `
    CREATE TABLE IF NOT EXISTS coinank_long_short (
      base_coin String,
      exchange String,
      long_ratio Float64,
      short_ratio Float64,
      buy_volume Float64,
      sell_volume Float64,
      timestamp DateTime,
      ingested_at DateTime DEFAULT now()
    )
    ENGINE = MergeTree()
    ORDER BY (timestamp, base_coin, exchange)
  `;
  await safeExec(coinankQuery, "coinank_long_short");

  // Table: smart_money_predictions
  const smartMoneyQuery = `
    CREATE TABLE IF NOT EXISTS smart_money_predictions (
      symbol String,
      window_start DateTime,
      phase UInt8,
      direction Enum8('UP' = 1, 'DOWN' = -1, 'NEUTRAL' = 0),
      confidence Float64,
      score Float64,
      open_price Float64,
      entry_price Float64,
      
      -- Raw signal values
      ls_ratio Nullable(Float64),
      ls_freshness Nullable(Float64),
      orderbook_imbalance Nullable(Float64),
      orderbook_freshness Nullable(Float64),
      tv_tech_rating Nullable(Float64),
      tv_freshness Nullable(Float64),
      tu_score Nullable(Float64),
      tu_freshness Nullable(Float64),
      
      -- Metadata
      data_completeness Float64,
      
      -- Outcome tracking (filled after 15min)
      exit_price Nullable(Float64),
      actual_direction Nullable(Enum8('UP' = 1, 'DOWN' = -1, 'NEUTRAL' = 0)),
      outcome Nullable(Enum8('WIN' = 1, 'LOSS' = -1, 'NEUTRAL' = 0)),
      return_pct Nullable(Float64),
      
      -- Timestamps
      predicted_at DateTime,
      evaluated_at Nullable(DateTime),
      ingested_at DateTime DEFAULT now()
    )
    ENGINE = ReplacingMergeTree(ingested_at)
    ORDER BY (window_start, symbol)
  `;
  await safeExec(smartMoneyQuery, "smart_money_predictions");

  // Table: smart_money_weights (for storing learned weights)
  const weightsQuery = `
    CREATE TABLE IF NOT EXISTS smart_money_weights (
      version UInt32,
      source_id String,
      symbol String,
      weight Float64,
      updated_at DateTime DEFAULT now()
    )
    ENGINE = ReplacingMergeTree(updated_at)
    ORDER BY (version, source_id, symbol)
  `;
  await safeExec(weightsQuery, "smart_money_weights");

  // Table: smart_money_performance (History/Outcome)
  const smartMoneyPerformanceQuery = `
    CREATE TABLE IF NOT EXISTS smart_money_performance (
      window_start DateTime,
      symbol String,
      phase UInt8,
      direction String,
      entry_price Float64,
      close_price Float64,
      max_price Float64,
      min_price Float64,
      pnl_percent Float64,
      is_win UInt8,
      score Float64,
      confidence Float64,
      analyzed_at DateTime DEFAULT now()
    )
    ENGINE = MergeTree()
    ORDER BY (window_start, symbol)
  `;
  await safeExec(smartMoneyPerformanceQuery, "smart_money_performance");

  // Migration: Add confidence column if missing
  await safeExec(
    `ALTER TABLE smart_money_performance ADD COLUMN IF NOT EXISTS confidence Float64`,
    "smart_money_performance_migration_confidence",
  );

  // Table: bluesky_posts
  const blueSkyPostsQuery = `
    CREATE TABLE IF NOT EXISTS bluesky_posts (
      uri String,
      cid String,
      author_did String,
      author_handle String,
      author_name String,
      content String,
      posted_at DateTime,
      reply_count UInt32,
      repost_count UInt32,
      like_count UInt32,
      indexed_at DateTime,
      source_feed Nullable(String),
      ingested_at DateTime DEFAULT now()
    )
    ENGINE = ReplacingMergeTree()
    ORDER BY (uri, posted_at)
  `;
  await safeExec(blueSkyPostsQuery, "bluesky_posts");

  // Migration for existing table
  await safeExec(
    `ALTER TABLE bluesky_posts ADD COLUMN IF NOT EXISTS source_feed Nullable(String)`,
    "bluesky_posts_migration_source_feed",
  );

  // Table: bluesky_trends
  const blueSkyTrendsQuery = `
    CREATE TABLE IF NOT EXISTS bluesky_trends (
      topic String,
      display_name String,
      link String,
      rank UInt32,
      timestamp DateTime,
      ingested_at DateTime DEFAULT now()
    )
    ENGINE = MergeTree()
    ORDER BY (timestamp, rank)
  `;
  await safeExec(blueSkyTrendsQuery, "bluesky_trends");

  // Table: wanted_notices - unified Interpol + FBI wanted persons
  const wantedNoticesQuery = `
    CREATE TABLE IF NOT EXISTS wanted_notices (
      id String,
      source String,
      notice_type String,
      name String,
      forename String,
      title String,
      description String,
      date_of_birth String,
      sex String,
      nationalities Array(String),
      thumbnail_url String,
      detail_url String,
      reward Float64,
      reward_text String,
      caution String,
      subjects Array(String),
      field_offices Array(String),
      aliases Array(String),
      fetched_at DateTime,
      ingested_at DateTime DEFAULT now()
    )
    ENGINE = ReplacingMergeTree(ingested_at)
    ORDER BY (source, notice_type, id)
  `;
  await safeExec(wantedNoticesQuery, "wanted_notices");

  // Table: interpol_details - detailed Interpol notice information
  const interpolDetailsQuery = `
    CREATE TABLE IF NOT EXISTS interpol_details (
      entity_id String,
      notice_type String,
      forename String,
      name String,
      date_of_birth String,
      sex_id String,
      nationalities Array(String),
      country_of_birth_id String,
      place_of_birth String,
      height Float64,
      weight Float64,
      eyes_colors Array(String),
      hairs Array(String),
      languages_spoken Array(String),
      distinguishing_marks String,
      arrest_warrants_json String,
      thumbnail_url String,
      detail_url String,
      fetched_at DateTime,
      ingested_at DateTime DEFAULT now()
    )
    ENGINE = ReplacingMergeTree()
    ORDER BY (entity_id, notice_type)
  `;
  await safeExec(interpolDetailsQuery, "interpol_details");

  // Table: cbs_nba_games
  const cbsNbaQuery = `
    CREATE TABLE IF NOT EXISTS cbs_nba_games (
      game_id String,
      period String,
      time_remaining String,
      description String,
      raw_data String,
      timestamp DateTime,
      ingested_at DateTime DEFAULT now()
    )
    ENGINE = MergeTree()
    ORDER BY (timestamp, game_id)
  `;
  await safeExec(cbsNbaQuery, "cbs_nba_games");

  // Table: whale_positions - large positions (>$300K) from top traders
  const whalePositionsQuery = `
    CREATE TABLE IF NOT EXISTS whale_positions (
      user_address String,
      username String,
      profile_image String,
      category String,
      asset String,
      title String,
      outcome String,
      side String,
      size Float64,
      avg_price Float64,
      current_price Float64,
      value_usd Float64,
      pnl Float64,
      pnl_percent Float64,
      timestamp DateTime,
      ingested_at DateTime DEFAULT now()
    )
    ENGINE = MergeTree()
    ORDER BY (timestamp, user_address, asset)
  `;
  await safeExec(whalePositionsQuery, "whale_positions");

  logger.info("All ClickHouse migrations completed");
};
