/**
 * Configuration Management
 */

import { logger } from "../logger";

export interface BalanceTarget {
  chain: string;
  idOrAddress: string;
  symbol?: string;
  asset?: string;
}

export interface AppConfig {
  // WebSocket
  wsUrl: string;
  token: string;
  reconnectDelay: number;
  maxReconnectDelay: number;
  heartbeatInterval: number;

  // Balance Reporting
  balanceReportIntervalMs: number;
  balanceTargets: BalanceTarget[];
  balanceFallbackIncomingLimit: number;
  balanceFallbackCacheTtlMs: number;
  balanceFallbackWalletPageLimit: number;
  balanceFallbackWalletMax: number;
  usdPriceOverrides: Record<string, number>;

  // Networks & Fees
  depositNetworks: string[];
  withdrawNetworks: string[];
  takerFees: Record<string, string>;

  // API Server
  apiPort: number;
  apiHost: string;
}

const DEFAULT_DEPOSIT_NETWORKS = [
  "erc20",
  "trc20",
  "bep20",
  "solana",
  "bitcoin",
  "xrp",
  "doge",
  "ltc",
  "polygon",
  "arbitrum",
];

const DEFAULT_TAKER_FEES: Record<string, string> = {
  btc: "0.0001",
  erc20: "0.0005",
  trc20: "1",
  bep20: "0.5",
  solana: "0.01",
  xrp: "0.1",
  doge: "1",
  ltc: "0.001",
  polygon: "0.1",
  arbitrum: "0.0003",
};

const parseListEnv = (value: string | undefined, fallback: string[]): string[] => {
  if (!value || !value.trim()) return fallback;
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

const parseJsonEnv = <T>(value: string | undefined, fallback: T): T => {
  if (!value || !value.trim()) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    logger.warn(
      { value, error: error instanceof Error ? error.message : String(error) },
      "Invalid JSON in env var, using fallback",
    );
    return fallback;
  }
};

export function loadConfig(): AppConfig {
  return {
    // WebSocket
    wsUrl: process.env.TAKER_WS_URL || "ws://localhost:3000/api/ws/tier/takerWallet",
    token: process.env.TAKER_TOKEN || "",
    reconnectDelay: parseInt(process.env.RECONNECT_DELAY || "1000"),
    maxReconnectDelay: parseInt(process.env.MAX_RECONNECT_DELAY || "30000"),
    heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL || "10000"),

    // Balance Reporting
    balanceReportIntervalMs: parseInt(process.env.BALANCE_REPORT_INTERVAL_MS || "30000"),
    balanceTargets: parseJsonEnv<BalanceTarget[]>(
      process.env.TAKER_BALANCE_TARGETS_JSON,
      []
    ),
    balanceFallbackIncomingLimit: parseInt(
      process.env.TAKER_BALANCE_FALLBACK_INCOMING_LIMIT || "200",
      10
    ),
    balanceFallbackCacheTtlMs: parseInt(
      process.env.TAKER_BALANCE_FALLBACK_CACHE_TTL_MS || "120000",
      10
    ),
    balanceFallbackWalletPageLimit: parseInt(
      process.env.TAKER_BALANCE_FALLBACK_WALLET_PAGE_LIMIT || "1000",
      10
    ),
    balanceFallbackWalletMax: parseInt(
      process.env.TAKER_BALANCE_FALLBACK_WALLET_MAX || "5000",
      10
    ),
    usdPriceOverrides: parseJsonEnv<Record<string, number>>(
      process.env.TAKER_USD_PRICE_OVERRIDES_JSON,
      {}
    ),

    // Networks & Fees
    depositNetworks: parseListEnv(
      process.env.TAKER_DEPOSIT_NETWORKS,
      DEFAULT_DEPOSIT_NETWORKS
    ),
    withdrawNetworks: parseListEnv(
      process.env.TAKER_WITHDRAW_NETWORKS,
      DEFAULT_DEPOSIT_NETWORKS
    ),
    takerFees: parseJsonEnv<Record<string, string>>(
      process.env.TAKER_FEES_JSON,
      DEFAULT_TAKER_FEES
    ),

    // API Server
    apiPort: parseInt(process.env.API_PORT || "3001"),
    apiHost: process.env.API_HOST || "0.0.0.0",
  };
}

export function validateConfig(config: AppConfig): void {
  if (!config.token) {
    throw new Error("TAKER_TOKEN is required. Get it from /operator/takerValidator");
  }

  if (!process.env.URL_POLYGON_WALLET) {
    logger.warn(
      "URL_POLYGON_WALLET not set - address generation will fail. Set it to polygonmoneyflow service URL."
    );
  }
}
