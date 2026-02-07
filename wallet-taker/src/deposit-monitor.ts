/**
 * Deposit Monitor
 *
 * Polls the wallet service for incoming transactions
 * and reports confirmed deposits to the exchange.
 */

import { logger } from "./logger";
import { type ChainId, getWalletApi, type IncomingTx } from "./wallet-api";

export interface DepositMonitorConfig {
  /** Poll interval in milliseconds */
  pollIntervalMs: number;
  /** Limit of transactions to fetch per poll */
  limitPerPoll: number;
}

export interface DepositCallback {
  (deposit: {
    txHash: string;
    address: string;
    chain: ChainId;
    symbol: string;
    amount: string;
    userId: number;
    walletId?: string;
    timestamp?: string;
  }): void;
}

/**
 * Extract user ID from virtual owner key
 * Format: "user_{userId}"
 */
function parseUserId(walletVirtualOwner: string | undefined): number | null {
  if (!walletVirtualOwner) return null;
  const match = walletVirtualOwner.match(/^user_(\d+)$/);
  if (!match || !match[1]) return null;
  return parseInt(match[1], 10);
}

/**
 * Map chain to common asset symbol
 */
function getChainSymbol(chain: ChainId, asset?: string): string {
  if (asset && asset !== "native") return asset;

  const symbols: Record<ChainId, string> = {
    solana: "SOL",
    eth: "ETH",
    base: "ETH",
    polygon: "MATIC",
    trx: "TRX",
    xrp: "XRP",
    polkadot: "DOT",
    bitcoin: "BTC",
    atom: "ATOM",
    ada: "ADA",
    link: "LINK",
  };
  return symbols[chain] ?? chain.toUpperCase();
}

export class DepositMonitor {
  private config: DepositMonitorConfig;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private onDeposit: DepositCallback | null = null;

  /** Track processed transaction IDs to avoid duplicates */
  private processedTxs = new Set<string>();

  /** Maximum size of processed set before cleanup */
  private maxProcessedSize = 10000;

  constructor(config: Partial<DepositMonitorConfig> = {}) {
    this.config = {
      pollIntervalMs: parseInt(
        process.env.DEPOSIT_POLL_INTERVAL_MS || "15000",
        10,
      ),
      limitPerPoll: parseInt(process.env.DEPOSIT_POLL_LIMIT || "50", 10),
      ...config,
    };
  }

  /**
   * Set callback for new deposits
   */
  setDepositCallback(callback: DepositCallback): void {
    this.onDeposit = callback;
  }

  /**
   * Start monitoring for deposits
   */
  start(): void {
    if (this.timer) {
      logger.warn("Deposit monitor already running");
      return;
    }

    logger.info(
      { intervalMs: this.config.pollIntervalMs },
      "🔍 Starting deposit monitor",
    );

    // Initial poll
    this.pollOnce();

    // Schedule recurring polls
    this.timer = setInterval(() => {
      this.pollOnce();
    }, this.config.pollIntervalMs);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info("Deposit monitor stopped");
  }

  /**
   * Single poll iteration
   */
  private async pollOnce(): Promise<void> {
    if (this.running) {
      logger.debug("Poll already in progress, skipping");
      return;
    }

    this.running = true;

    try {
      const api = getWalletApi();

      // Get all wallets with virtual owners (users)
      const { items: wallets } = await api.listWallets({
        limit: 1000, // Get all user wallets
      });

      // Group by owner to batch requests
      const ownerSet = new Set<string>();
      for (const wallet of wallets) {
        if (wallet.walletVirtualOwner) {
          ownerSet.add(wallet.walletVirtualOwner);
        }
      }

      if (ownerSet.size === 0) {
        logger.debug("No virtual-owned wallets to monitor");
        return;
      }

      logger.debug({ owners: ownerSet.size }, "Polling incoming transactions");

      // Poll each owner's transactions
      for (const owner of ownerSet) {
        try {
          const txs = await api.getIncomingByOwner(
            owner,
            this.config.limitPerPoll,
          );
          await this.processTransactions(txs);
        } catch (err) {
          logger.error(
            { owner, error: err instanceof Error ? err.message : String(err) },
            "Failed to poll owner transactions",
          );
        }
      }
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err) },
        "Deposit poll failed",
      );
    } finally {
      this.running = false;
    }
  }

  /**
   * Process incoming transactions and emit new deposits
   */
  private async processTransactions(txs: IncomingTx[]): Promise<void> {
    for (const tx of txs) {
      // Skip if already processed
      if (this.processedTxs.has(tx.id)) {
        continue;
      }

      // Only process confirmed transactions
      if (tx.status !== "confirmed") {
        continue;
      }

      // Must have txHash
      if (!tx.txHash) {
        continue;
      }

      // Parse user ID from virtual owner
      const userId = parseUserId(tx.walletVirtualOwner);
      if (userId === null) {
        logger.debug(
          { txId: tx.id, owner: tx.walletVirtualOwner },
          "Transaction has no valid user owner, skipping",
        );
        continue;
      }

      // Mark as processed
      this.processedTxs.add(tx.id);

      // Cleanup old entries if set is too large
      if (this.processedTxs.size > this.maxProcessedSize) {
        const entries = Array.from(this.processedTxs);
        const toRemove = entries.slice(
          0,
          entries.length - this.maxProcessedSize / 2,
        );
        for (const id of toRemove) {
          this.processedTxs.delete(id);
        }
      }

      const symbol = getChainSymbol(tx.chain, tx.asset);

      logger.info(
        {
          txHash: tx.txHash,
          chain: tx.chain,
          symbol,
          amount: tx.amount,
          userId,
          address: tx.address,
        },
        "💰 New deposit detected",
      );

      // Emit deposit event
      if (this.onDeposit) {
        this.onDeposit({
          txHash: tx.txHash,
          address: tx.address,
          chain: tx.chain,
          symbol,
          amount: tx.amount,
          userId,
          walletId: tx.walletId,
          timestamp: tx.timestamp,
        });
      }
    }
  }

  /**
   * Manual check for a specific user
   */
  async checkUser(userId: number): Promise<IncomingTx[]> {
    const api = getWalletApi();
    const owner = `user_${userId}`;
    return api.getIncomingByOwner(owner, this.config.limitPerPoll);
  }

  /**
   * Get monitor status
   */
  getStatus(): {
    running: boolean;
    processedCount: number;
    pollIntervalMs: number;
  } {
    return {
      running: this.timer !== null,
      processedCount: this.processedTxs.size,
      pollIntervalMs: this.config.pollIntervalMs,
    };
  }
}

// Singleton instance
let monitorInstance: DepositMonitor | null = null;

export function getDepositMonitor(): DepositMonitor {
  if (!monitorInstance) {
    monitorInstance = new DepositMonitor();
  }
  return monitorInstance;
}
