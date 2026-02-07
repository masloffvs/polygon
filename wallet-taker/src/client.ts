/**
 * Wallet Taker Client
 *
 * Manages WebSocket connection to the exchange with:
 * - Auto-reconnection with exponential backoff
 * - Token-based authentication
 * - Heartbeat management
 * - Message handling
 * - Deposit monitoring
 */

import WebSocket from "ws";
import { type DepositMonitor, getDepositMonitor } from "./deposit-monitor";
import { handleDepositRequest } from "./handlers";
import { logger } from "./logger";
import { getWalletApi, type ChainId } from "./wallet-api";

export interface BalanceTarget {
  chain: string;
  idOrAddress: string;
  symbol?: string;
  asset?: string;
}

export interface TakerConfig {
  wsUrl: string;
  token: string;
  reconnectDelay: number;
  maxReconnectDelay: number;
  heartbeatInterval: number;
  balanceReportIntervalMs: number;
  depositNetworks: string[];
  withdrawNetworks: string[];
  takerFees: Record<string, string>;
  balanceTargets: BalanceTarget[];
  usdPriceOverrides: Record<string, number>;
}

export interface TakerMessage {
  type: string;
  [key: string]: unknown;
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

const DEFAULT_WITHDRAW_NETWORKS = [...DEFAULT_DEPOSIT_NETWORKS];

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

const STABLE_USD_SYMBOLS = new Set(["USD", "USDT", "USDC", "BUSD", "TUSD", "DAI"]);

export class TakerClient {
  private config: TakerConfig;
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private balanceReportTimer: ReturnType<typeof setInterval> | null = null;
  private balanceReportInFlight = false;
  private isConnected = false;
  private isAuthenticated = false;
  private shouldReconnect = true;
  private depositMonitor: DepositMonitor | null = null;
  private usdPriceCache = new Map<string, { price: number; expiresAt: number }>();

  constructor(config: TakerConfig) {
    this.config = config;
  }

  /**
   * Start deposit monitoring after authentication
   */
  private startDepositMonitoring(): void {
    if (this.depositMonitor) {
      return; // Already running
    }

    this.depositMonitor = getDepositMonitor();

    // Set callback to report deposits to exchange
    this.depositMonitor.setDepositCallback((deposit) => {
      this.reportDeposit(deposit);
    });

    this.depositMonitor.start();
    logger.info("Deposit monitoring started");
  }

  /**
   * Stop deposit monitoring
   */
  private stopDepositMonitoring(): void {
    if (this.depositMonitor) {
      this.depositMonitor.stop();
      this.depositMonitor = null;
    }
  }

  /**
   * Report a detected deposit to the exchange
   */
  reportDeposit(deposit: {
    txHash: string;
    address: string;
    chain: ChainId;
    symbol: string;
    amount: string;
    userId: number;
    walletId?: string;
    timestamp?: string;
  }): boolean {
    if (!this.isReady()) {
      logger.warn(
        { txHash: deposit.txHash },
        "Cannot report deposit - not connected",
      );
      return false;
    }

    logger.info(
      {
        txHash: deposit.txHash,
        userId: deposit.userId,
        amount: deposit.amount,
        symbol: deposit.symbol,
      },
      "📤 Reporting deposit to exchange",
    );

    // Use deposit_confirmed - same format as simulateDeposit
    return this.send({
      type: "deposit_confirmed",
      txHash: deposit.txHash,
      address: deposit.address,
      network: deposit.chain,
      symbol: deposit.symbol,
      amount: parseFloat(deposit.amount),
      confirmations: 10, // Already confirmed on-chain
    });
  }

  /**
   * Get deposit monitor for manual operations
   */
  getDepositMonitor(): DepositMonitor | null {
    return this.depositMonitor;
  }

  /**
   * Connect to the exchange WebSocket
   */
  connect(): void {
    if (this.ws) {
      logger.warn("Already connecting/connected");
      return;
    }

    logger.info({ url: this.config.wsUrl }, "Connecting to exchange...");

    try {
      this.ws = new WebSocket(this.config.wsUrl);
      this.setupEventHandlers();
    } catch (error) {
      logger.error({ error }, "Failed to create WebSocket");
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from the exchange
   */
  async disconnect(): Promise<void> {
    this.shouldReconnect = false;

    // Stop deposit monitoring
    this.stopDepositMonitoring();

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    this.stopBalanceReporting();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close(1000, "Client shutdown");
      this.ws = null;
    }

    this.isConnected = false;
    this.isAuthenticated = false;

    logger.info("Disconnected from exchange");
  }

  /**
   * Send message to the exchange
   */
  send(message: TakerMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn({ type: message.type }, "Cannot send - not connected");
      return false;
    }

    try {
      this.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      logger.error({ error, type: message.type }, "Failed to send message");
      return false;
    }
  }

  /**
   * Check if authenticated and connected
   */
  isReady(): boolean {
    return this.isConnected && this.isAuthenticated;
  }

  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      logger.info("WebSocket connected, waiting for handshake init...");
    };

    this.ws.onmessage = (event) => {
      this.handleMessage(event.data.toString());
    };

    this.ws.onclose = (event) => {
      logger.info(
        { code: event.code, reason: event.reason },
        "WebSocket closed",
      );
      this.handleDisconnect();
    };

    this.ws.onerror = (error) => {
      logger.error({ error }, "WebSocket error");
    };
  }

  private handleMessage(raw: string): void {
    try {
      const message: TakerMessage = JSON.parse(raw);
      const type = message.type;

      logger.debug({ type }, "Received message");

      switch (type) {
        case "handshake_init":
          this.handleHandshakeInit();
          break;

        case "handshake_complete":
          this.handleHandshakeComplete(message);
          break;

        case "handshake_error":
          this.handleHandshakeError(message);
          break;

        case "ping":
          this.handlePing();
          break;

        case "heartbeat_ack":
          logger.debug("Heartbeat acknowledged");
          break;

        case "capabilities_ack":
          if (message.success === false) {
            logger.warn({ message }, "Capabilities rejected by server");
          } else {
            logger.info("Capabilities acknowledged by server");
          }
          break;

        case "balance_report_ack":
          if (message.success === false) {
            logger.warn({ message }, "Balance report rejected by server");
          } else {
            logger.debug("Balance report acknowledged");
          }
          break;

        case "deposit_request":
          this.handleDepositRequest(message);
          break;

        case "withdrawal_request":
          this.handleWithdrawalBroadcast(message);
          break;

        case "withdrawal_claim_result":
          this.handleWithdrawalClaimResult(message);
          break;

        case "withdrawal_completed_ack":
          if (message.success) {
            logger.info(
              { withdrawalId: message.withdrawalId },
              "✅ Withdrawal completion acknowledged",
            );
          } else {
            logger.error(
              { withdrawalId: message.withdrawalId, error: message.message },
              "❌ Withdrawal completion failed",
            );
          }
          break;

        case "withdrawal_failed_ack":
          logger.info(
            { withdrawalId: message.withdrawalId },
            "Withdrawal failure acknowledged - returned to queue",
          );
          break;

        case "address_request":
          this.handleAddressRequest(message);
          break;

        case "address_request_assigned":
          this.handleAddressRequestAssigned(message);
          break;

        case "address_claim_result":
          logger.info(
            { requestId: message.requestId, success: message.success },
            "Address claim result",
          );
          break;

        case "address_generated_ack":
          logger.info(
            { requestId: message.requestId },
            "Address generation acknowledged",
          );
          break;

        case "deposit_confirmed_ack":
          if (message.success) {
            logger.info(
              {
                txHash: message.txHash,
                userId: message.userId,
                credited: message.credited,
              },
              "✅ Deposit confirmed and processed by server",
            );
          } else {
            logger.error(
              { txHash: message.txHash, error: message.error },
              "❌ Deposit confirmation failed",
            );
          }
          break;

        case "token_revoked":
          logger.error("Token has been revoked! Shutting down...");
          this.shouldReconnect = false;
          this.disconnect();
          process.exit(1);
          break;

        case "token_regenerated":
          logger.warn(
            "Token regenerated. Need to update TAKER_TOKEN and restart.",
          );
          this.shouldReconnect = false;
          this.disconnect();
          break;

        default:
          logger.debug({ type, message }, "Unknown message type");
      }
    } catch (error) {
      logger.error(
        { error, raw: raw.slice(0, 200) },
        "Failed to parse message",
      );
    }
  }

  private handleHandshakeInit(): void {
    logger.info("Received handshake init, authenticating...");

    this.send({
      type: "handshake",
      token: this.config.token,
    });
  }

  private handleHandshakeComplete(message: TakerMessage): void {
    this.isAuthenticated = true;

    logger.info(
      {
        tokenId: message.tokenId,
        tokenName: message.tokenName,
      },
      "🎉 Handshake complete! Connected and authenticated.",
    );

    // Start heartbeat
    this.startHeartbeat();

    // Share supported networks/fees right after handshake
    this.sendCapabilitiesReport();

    // Start periodic balance reporting
    this.startBalanceReporting();

    // Start deposit monitoring
    this.startDepositMonitoring();
  }

  private handleHandshakeError(message: TakerMessage): void {
    logger.error({ message: message.message }, "Handshake failed");
    this.isAuthenticated = false;

    // Don't reconnect on auth failure - token is probably invalid
    if (
      String(message.message).includes("Invalid") ||
      String(message.message).includes("inactive")
    ) {
      logger.error(
        "Token appears invalid. Check TAKER_TOKEN in .env or generate new token.",
      );
      this.shouldReconnect = false;
      this.disconnect();
    }
  }

  private handlePing(): void {
    this.send({ type: "pong", ts: Date.now() });
  }

  private async handleDepositRequest(message: TakerMessage): Promise<void> {
    logger.info(
      {
        depositId: message.depositId,
        symbol: message.symbol,
        amount: message.amount,
        address: message.address,
      },
      "Processing deposit request",
    );

    try {
      const result = await handleDepositRequest({
        depositId: message.depositId as number,
        symbol: message.symbol as string,
        amount: message.amount as number,
        address: message.address as string,
        userId: message.userId as number,
      });

      this.send({
        type: "deposit_confirmed",
        depositId: message.depositId,
        txHash: result.txHash,
        status: result.status,
      });
    } catch (error) {
      logger.error({ error, depositId: message.depositId }, "Deposit failed");
      this.send({
        type: "deposit_error",
        depositId: message.depositId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Pending withdrawals queue (for interactive processing)
   */
  private pendingWithdrawals = new Map<
    number,
    {
      id: number;
      symbol: string;
      network: string;
      amount: string;
      address: string;
      tag: string | null;
      created_at: string;
    }
  >();

  /**
   * Handle withdrawal request broadcast from server
   * Stores in queue for operator to manually claim/process
   */
  private handleWithdrawalBroadcast(message: TakerMessage): void {
    const withdrawal = message.withdrawal as {
      id: number;
      symbol: string;
      network: string;
      amount: string;
      address: string;
      tag: string | null;
      created_at: string;
    };

    // Store in pending queue
    this.pendingWithdrawals.set(withdrawal.id, withdrawal);

    logger.info(
      {
        withdrawalId: withdrawal.id,
        symbol: withdrawal.symbol,
        network: withdrawal.network,
        amount: withdrawal.amount,
        address: withdrawal.address,
      },
      "💰 Withdrawal request received",
    );

    console.log(
      `\n💰 WITHDRAWAL REQUEST #${withdrawal.id}: ${withdrawal.amount} ${withdrawal.symbol} (${withdrawal.network})`,
    );
    console.log(`   To: ${withdrawal.address}`);
    if (withdrawal.tag) console.log(`   Tag/Memo: ${withdrawal.tag}`);
    console.log(`   Type 'claim ${withdrawal.id}' to accept this withdrawal\n`);
  }

  /**
   * Handle withdrawal claim result
   */
  private handleWithdrawalClaimResult(message: TakerMessage): void {
    if (message.success) {
      logger.info(
        { withdrawalId: message.withdrawalId },
        "✅ Withdrawal claimed successfully",
      );
      console.log(
        `\n✅ Withdrawal #${message.withdrawalId} claimed! Now process it and run:`,
      );
      console.log(
        `   complete ${message.withdrawalId} <tx_hash>  - when successfully sent`,
      );
      console.log(
        `   fail ${message.withdrawalId}              - if unable to process\n`,
      );
    } else {
      logger.warn(
        { withdrawalId: message.withdrawalId, message: message.message },
        "❌ Withdrawal claim failed",
      );
      console.log(
        `\n❌ Failed to claim withdrawal #${message.withdrawalId}: ${message.message}\n`,
      );
      this.pendingWithdrawals.delete(message.withdrawalId as number);
    }
  }

  /**
   * Claim a pending withdrawal
   */
  claimWithdrawal(withdrawalId: number): void {
    logger.info({ withdrawalId }, "Claiming withdrawal...");
    this.send({
      type: "withdrawal_claim",
      withdrawalId,
    });
  }

  /**
   * Mark withdrawal as completed with transaction hash
   */
  completeWithdrawal(withdrawalId: number, txHash: string): void {
    logger.info({ withdrawalId, txHash }, "Completing withdrawal...");
    this.send({
      type: "withdrawal_completed",
      withdrawalId,
      txHash,
    });
    this.pendingWithdrawals.delete(withdrawalId);
  }

  /**
   * Mark withdrawal as failed (returns to queue)
   */
  failWithdrawal(
    withdrawalId: number,
    reason: string = "Unable to process",
  ): void {
    logger.info({ withdrawalId, reason }, "Failing withdrawal...");
    this.send({
      type: "withdrawal_failed",
      withdrawalId,
      reason,
    });
    this.pendingWithdrawals.delete(withdrawalId);
  }

  /**
   * Get list of pending withdrawals
   */
  getPendingWithdrawals(): Array<{
    id: number;
    symbol: string;
    network: string;
    amount: string;
    address: string;
    tag: string | null;
  }> {
    return Array.from(this.pendingWithdrawals.values());
  }

  /**
   * Handle address generation request broadcast
   * Immediately claim it (first come first served)
   */
  private handleAddressRequest(message: TakerMessage): void {
    const requestId = message.requestId as number;
    const symbol = message.symbol as string;
    const network = message.network as string;
    const userId = message.userId as number;

    logger.info(
      { requestId, userId, symbol, network },
      "📨 Address request received - claiming...",
    );

    // Immediately claim this request
    this.send({
      type: "address_claim",
      requestId,
    });
  }

  /**
   * Handle when our claim is accepted and we need to generate the address
   */
  private async handleAddressRequestAssigned(
    message: TakerMessage,
  ): Promise<void> {
    const requestId = message.requestId as number;
    const symbol = message.symbol as string;
    const network = message.network as string;
    const userId = message.userId as number;

    logger.info(
      { requestId, userId, symbol, network },
      "🎯 Request assigned to us - generating address...",
    );

    try {
      const { handleAddressGeneration } = await import("./handlers");
      const result = await handleAddressGeneration({
        requestId,
        userId,
        symbol,
        network,
      });

      logger.info(
        { requestId, address: result.address, memo: result.memo },
        "✅ Address generated successfully",
      );

      this.send({
        type: "address_generated",
        requestId,
        address: result.address,
        memo: result.memo,
      });

      // Auto-simulate deposit for testing (after 3 seconds)
      if (process.env.AUTO_SIMULATE_DEPOSIT === "true") {
        setTimeout(() => {
          this.simulateDeposit(result.address, symbol, network, userId);
        }, 3000);
      }
    } catch (error) {
      logger.error({ error, requestId }, "❌ Address generation failed");
      this.send({
        type: "address_error",
        requestId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Simulate a deposit confirmation (for testing)
   */
  simulateDeposit(
    address: string,
    symbol: string,
    network?: string,
    userId?: number,
    amount?: number,
  ): void {
    const depositAmount = amount || this.getRandomDepositAmount(symbol);
    const txHash = `0x${Date.now().toString(16)}${Math.random().toString(16).slice(2, 18)}`;

    logger.info(
      {
        address,
        symbol,
        network: network || "(auto)",
        amount: depositAmount,
        txHash,
      },
      "🎭 Simulating deposit confirmation",
    );

    const msg: Record<string, unknown> = {
      type: "deposit_confirmed",
      address,
      symbol: symbol.toUpperCase(),
      amount: depositAmount,
      txHash,
      confirmations: 10, // Enough for any network
    };

    // Only include network if provided - server will lookup from address
    if (network) {
      msg.network = network;
    }

    this.send(msg as TakerMessage);
  }

  /**
   * Get random realistic deposit amount based on symbol
   */
  private getRandomDepositAmount(symbol: string): number {
    const ranges: Record<string, [number, number]> = {
      BTC: [0.001, 0.1],
      ETH: [0.01, 1],
      SOL: [1, 50],
      USDT: [100, 5000],
      USDC: [100, 5000],
      XRP: [50, 1000],
      DOGE: [100, 10000],
    };
    const [min, max] = ranges[symbol.toUpperCase()] || [1, 100];
    return Number((min + Math.random() * (max - min)).toFixed(6));
  }

  private sendCapabilitiesReport(): void {
    const depositNetworks =
      this.config.depositNetworks.length > 0
        ? this.config.depositNetworks
        : DEFAULT_DEPOSIT_NETWORKS;
    const withdrawNetworks =
      this.config.withdrawNetworks.length > 0
        ? this.config.withdrawNetworks
        : DEFAULT_WITHDRAW_NETWORKS;
    const takerFees =
      Object.keys(this.config.takerFees).length > 0
        ? this.config.takerFees
        : DEFAULT_TAKER_FEES;

    const sent = this.send({
      type: "capabilities",
      deposit_networks: depositNetworks,
      withdraw_networks: withdrawNetworks,
      taker_fees: takerFees,
    });

    if (sent) {
      logger.info(
        {
          depositNetworks: depositNetworks.length,
          withdrawNetworks: withdrawNetworks.length,
          feeEntries: Object.keys(takerFees).length,
        },
        "Capabilities sent",
      );
    }
  }

  private startBalanceReporting(): void {
    this.stopBalanceReporting();

    // Send first report immediately after handshake
    this.sendBalanceReport().catch((error) => {
      logger.error({ error }, "Initial balance report failed");
    });

    this.balanceReportTimer = setInterval(() => {
      this.sendBalanceReport().catch((error) => {
        logger.error({ error }, "Balance report failed");
      });
    }, this.config.balanceReportIntervalMs);

    logger.info(
      { intervalMs: this.config.balanceReportIntervalMs },
      "Balance reporting started",
    );
  }

  private stopBalanceReporting(): void {
    if (this.balanceReportTimer) {
      clearInterval(this.balanceReportTimer);
      this.balanceReportTimer = null;
    }
    this.balanceReportInFlight = false;
  }

  private async sendBalanceReport(): Promise<void> {
    if (!this.isReady()) return;
    if (this.balanceReportInFlight) return;

    this.balanceReportInFlight = true;
    try {
      const balances = await this.collectBalances();
      const sent = this.send({
        type: "balance_report",
        balances,
      });

      if (sent) {
        logger.debug({ assets: balances.length }, "Balance report sent");
      }
    } finally {
      this.balanceReportInFlight = false;
    }
  }

  private async collectBalances(): Promise<
    Array<{ symbol: string; amount: number; usd_value: number }>
  > {
    if (this.config.balanceTargets.length === 0) {
      logger.debug("No balance targets configured, sending empty balance report");
      return [];
    }

    const walletApi = getWalletApi();
    const aggregated = new Map<string, { amount: number; usdValue: number }>();

    for (const target of this.config.balanceTargets) {
      try {
        const balance = await walletApi.getBalance(
          target.chain,
          target.idOrAddress,
          target.asset,
        );

        const amount = Number.parseFloat(balance.amount);
        if (!Number.isFinite(amount)) {
          logger.warn(
            { target, rawAmount: balance.amount },
            "Skipping invalid balance amount",
          );
          continue;
        }

        const symbol = (
          target.symbol ||
          balance.symbol ||
          target.chain
        ).toUpperCase();
        const usdPrice = await this.resolveUsdPrice(symbol);
        const usdValue = usdPrice !== null ? amount * usdPrice : 0;

        const prev = aggregated.get(symbol) ?? { amount: 0, usdValue: 0 };
        aggregated.set(symbol, {
          amount: prev.amount + amount,
          usdValue: prev.usdValue + usdValue,
        });
      } catch (error) {
        logger.warn(
          {
            chain: target.chain,
            idOrAddress: target.idOrAddress,
            error: error instanceof Error ? error.message : String(error),
          },
          "Failed to fetch balance target",
        );
      }
    }

    return Array.from(aggregated.entries())
      .map(([symbol, value]) => ({
        symbol,
        amount: Number(value.amount.toFixed(8)),
        usd_value: Number(value.usdValue.toFixed(2)),
      }))
      .sort((a, b) => b.usd_value - a.usd_value);
  }

  private async resolveUsdPrice(symbol: string): Promise<number | null> {
    const normalized = symbol.toUpperCase();

    const override = this.config.usdPriceOverrides[normalized];
    if (Number.isFinite(override)) {
      return override;
    }

    if (STABLE_USD_SYMBOLS.has(normalized)) {
      return 1;
    }

    const cached = this.usdPriceCache.get(normalized);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return cached.price;
    }

    try {
      const response = await fetch(
        `https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(normalized)}USDT`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (!response.ok) {
        return null;
      }
      const payload = (await response.json()) as { price?: string };
      const price = Number.parseFloat(payload.price ?? "");
      if (!Number.isFinite(price) || price <= 0) {
        return null;
      }
      this.usdPriceCache.set(normalized, {
        price,
        expiresAt: now + 60_000,
      });
      return price;
    } catch {
      return null;
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(() => {
      if (this.isReady()) {
        this.send({ type: "heartbeat", ts: Date.now() });
      }
    }, this.config.heartbeatInterval);

    logger.debug(
      { interval: this.config.heartbeatInterval },
      "Heartbeat started",
    );
  }

  private handleDisconnect(): void {
    this.isConnected = false;
    this.isAuthenticated = false;
    this.ws = null;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    this.stopBalanceReporting();

    if (this.shouldReconnect) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) return;

    this.reconnectAttempts++;

    // Exponential backoff with jitter
    const baseDelay = Math.min(
      this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.config.maxReconnectDelay,
    );
    const jitter = Math.random() * 1000;
    const delay = baseDelay + jitter;

    logger.info(
      { attempt: this.reconnectAttempts, delay: Math.round(delay) },
      "Scheduling reconnect...",
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}
