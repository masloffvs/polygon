/**
 * Wallet API Client
 *
 * Communicates with the polygonmoneyflow service
 * to generate real wallet addresses.
 */

import { logger } from "./logger";

export type ChainId =
  | "solana"
  | "eth"
  | "base"
  | "polygon"
  | "trx"
  | "xrp"
  | "polkadot";

export interface WalletResponse {
  id: string;
  address: string;
  chain: ChainId;
  label?: string;
  createdAt?: string;
  walletVirtualOwner?: string;
  meta?: Record<string, unknown>;
}

export interface VirtualOwnedResponse {
  owner: string;
  wallets: Array<WalletResponse & { created: boolean }>;
}

/**
 * Incoming transaction from blockchain
 */
export interface IncomingTx {
  id: string;
  chain: ChainId;
  address: string;
  amount: string;
  asset: string;
  status: "pending" | "confirmed" | "failed" | "unknown";
  walletId?: string;
  walletVirtualOwner?: string;
  txHash?: string;
  from?: string;
  blockNumber?: number;
  timestamp?: string;
}

export interface WalletApiConfig {
  baseUrl: string;
  timeoutMs?: number;
}

export interface WalletBalance {
  amount: string;
  decimals: number;
  symbol: string;
}

/**
 * Network name mapping from exchange format to our chain IDs
 * Exchange might use different names like "ERC20", "TRC20", etc.
 */
const NETWORK_TO_CHAIN: Record<string, ChainId> = {
  // Solana
  solana: "solana",
  sol: "solana",

  // Ethereum
  eth: "eth",
  ethereum: "eth",
  erc20: "eth",

  // Base
  base: "base",

  // Polygon
  polygon: "polygon",
  matic: "polygon",

  // Tron
  trx: "trx",
  tron: "trx",
  trc20: "trx",

  // XRP
  xrp: "xrp",
  ripple: "xrp",

  // Polkadot
  polkadot: "polkadot",
  dot: "polkadot",

  // Arbitrum, Optimism -> map to ETH for now (same address format)
  arbitrum: "eth",
  optimism: "eth",
  op: "eth",
  arb: "eth",

  // BSC -> also EVM compatible, map to ETH
  bsc: "eth",
  bep20: "eth",
  bnb: "eth",
};

/**
 * Normalize network name to our chain ID
 */
export function normalizeNetwork(network: string): ChainId | null {
  const normalized = network.toLowerCase().trim();
  return NETWORK_TO_CHAIN[normalized] ?? null;
}

/**
 * Get supported networks list
 */
export function getSupportedNetworks(): string[] {
  return Object.keys(NETWORK_TO_CHAIN);
}

export class WalletApiClient {
  private config: WalletApiConfig;

  constructor(config: WalletApiConfig) {
    this.config = {
      timeoutMs: 10000,
      ...config,
    };
  }

  /**
   * Create a new wallet for a specific chain
   */
  async createWallet(chain: ChainId, label?: string): Promise<WalletResponse> {
    const url = `${this.config.baseUrl}/wallets`;

    logger.debug({ chain, label, url }, "Creating wallet via API");

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chain, label }),
      signal: AbortSignal.timeout(this.config.timeoutMs!),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Wallet API error: ${response.status} - ${error}`);
    }

    const wallet = (await response.json()) as WalletResponse;
    logger.info({ chain, address: wallet.address }, "Wallet created");
    return wallet;
  }

  /**
   * Create or fetch virtual-owned wallets for a user
   * This ensures each user gets consistent addresses across chains
   */
  async createVirtualOwnedWallets(
    owner: string,
    chains?: ChainId[],
  ): Promise<VirtualOwnedResponse> {
    const url = `${this.config.baseUrl}/virtualOwned/wallets/create`;

    logger.debug({ owner, chains, url }, "Creating virtual-owned wallets");

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner, chains }),
      signal: AbortSignal.timeout(this.config.timeoutMs!),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Wallet API error: ${response.status} - ${error}`);
    }

    const result = (await response.json()) as VirtualOwnedResponse;
    logger.info(
      {
        owner,
        walletsCount: result.wallets.length,
        created: result.wallets.filter((w) => w.created).length,
      },
      "Virtual-owned wallets ready",
    );
    return result;
  }

  /**
   * Get wallet by address lookup
   */
  async findWalletByAddress(
    chain: ChainId,
    address: string,
  ): Promise<WalletResponse | null> {
    const url = `${this.config.baseUrl}/wallets?chain=${chain}&address=${encodeURIComponent(address)}&limit=1`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(this.config.timeoutMs!),
    });

    if (!response.ok) {
      return null;
    }

    const result = (await response.json()) as {
      items: WalletResponse[];
      total: number;
    };
    return result.items[0] ?? null;
  }

  /**
   * Get incoming transactions for a virtual owner (user)
   * This returns all deposits across all chains for a user
   */
  async getIncomingByOwner(owner: string, limit = 50): Promise<IncomingTx[]> {
    const url = `${this.config.baseUrl}/virtualOwned/transactions/incoming?owner=${encodeURIComponent(owner)}&limit=${limit}`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(this.config.timeoutMs!),
    });

    if (!response.ok) {
      if (response.status === 404) {
        return []; // Owner not found = no transactions
      }
      const error = await response.text();
      throw new Error(`Wallet API error: ${response.status} - ${error}`);
    }

    return (await response.json()) as IncomingTx[];
  }

  /**
   * Get incoming transactions for a specific address
   */
  async getIncomingByAddress(
    chain: ChainId,
    address: string,
    limit = 50,
  ): Promise<IncomingTx[]> {
    const url = `${this.config.baseUrl}/transactions/incoming?chain=${chain}&address=${encodeURIComponent(address)}&limit=${limit}`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(this.config.timeoutMs!),
    });

    if (!response.ok) {
      if (response.status === 404) {
        return [];
      }
      const error = await response.text();
      throw new Error(`Wallet API error: ${response.status} - ${error}`);
    }

    return (await response.json()) as IncomingTx[];
  }

  /**
   * List all wallets (with optional filters)
   */
  async listWallets(params?: {
    chain?: ChainId;
    walletVirtualOwner?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: WalletResponse[]; total: number }> {
    const searchParams = new URLSearchParams();
    if (params?.chain) searchParams.set("chain", params.chain);
    if (params?.walletVirtualOwner)
      searchParams.set("walletVirtualOwner", params.walletVirtualOwner);
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.offset) searchParams.set("offset", String(params.offset));

    const url = `${this.config.baseUrl}/wallets?${searchParams.toString()}`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(this.config.timeoutMs!),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Wallet API error: ${response.status} - ${error}`);
    }

    return (await response.json()) as {
      items: WalletResponse[];
      total: number;
    };
  }

  /**
   * Get wallet balance by chain and wallet id/address
   */
  async getBalance(
    chain: string,
    idOrAddress: string,
    asset?: string,
  ): Promise<WalletBalance> {
    const searchParams = new URLSearchParams();
    if (asset) searchParams.set("asset", asset);
    const query = searchParams.toString();
    const url = `${this.config.baseUrl}/wallets/${encodeURIComponent(chain)}/${encodeURIComponent(idOrAddress)}/balance${query ? `?${query}` : ""}`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(this.config.timeoutMs!),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Wallet API error: ${response.status} - ${error}`);
    }

    return (await response.json()) as WalletBalance;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// Singleton instance (initialized lazily)
let walletApiInstance: WalletApiClient | null = null;

export function getWalletApi(): WalletApiClient {
  if (!walletApiInstance) {
    const baseUrl = process.env.URL_POLYGON_WALLET;
    if (!baseUrl) {
      throw new Error(
        "URL_POLYGON_WALLET environment variable is required for wallet operations",
      );
    }
    walletApiInstance = new WalletApiClient({ baseUrl });
  }
  return walletApiInstance;
}

/**
 * Initialize wallet API and verify connection
 */
export async function initWalletApi(): Promise<WalletApiClient> {
  const api = getWalletApi();
  const healthy = await api.healthCheck();
  if (!healthy) {
    logger.warn(
      { url: process.env.URL_POLYGON_WALLET },
      "Wallet API health check failed - service may be unavailable",
    );
  } else {
    logger.info(
      { url: process.env.URL_POLYGON_WALLET },
      "Wallet API connected",
    );
  }
  return api;
}
