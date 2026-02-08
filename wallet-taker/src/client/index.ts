/**
 * Taker Client
 * Main orchestrator for wallet taker operations
 */

import { logger } from "../logger";
import type { AppConfig } from "../config";
import { WebSocketService } from "../services/websocket.service";
import { BalanceService, type ReportBalance } from "../services/balance.service";
import { WithdrawalService } from "../services/withdrawal.service";
import { type DepositMonitor, getDepositMonitor } from "../deposit-monitor";
import { handleDepositRequest, handleAddressGeneration } from "../handlers";
import type { ChainId } from "../wallet-api";

export class TakerClient {
  private wsService: WebSocketService;
  private balanceService: BalanceService;
  private withdrawalService: WithdrawalService;
  private depositMonitor: DepositMonitor | null = null;
  private balanceReportTimer: ReturnType<typeof setInterval> | null = null;
  private balanceReportInFlight = false;
  private autoProcessingWithdrawals = new Set<number>();

  constructor(private config: AppConfig) {
    this.wsService = new WebSocketService(config);
    this.balanceService = new BalanceService(config);
    this.withdrawalService = new WithdrawalService();

    this.setupMessageHandlers();
  }

  /**
   * Setup WebSocket message handlers
   */
  private setupMessageHandlers(): void {
    // Authentication complete - start services
    this.wsService.on("authenticated", () => {
      this.onAuthenticated();
    });

    // Deposit requests
    this.wsService.on("deposit_request", async (message) => {
      await this.handleDepositRequest(message);
    });

    // Withdrawal requests
    this.wsService.on("withdrawal_request", (message) => {
      this.handleWithdrawalBroadcast(message);
    });

    this.wsService.on("withdrawal_claim_result", (message) => {
      this.handleWithdrawalClaimResult(message);
    });

    this.wsService.on("withdrawal_completed_ack", (message) => {
      if (message.success) {
        logger.info(
          { withdrawalId: message.withdrawalId },
          "✅ Withdrawal completion acknowledged"
        );
      } else {
        logger.error(
          { withdrawalId: message.withdrawalId, error: message.message },
          "❌ Withdrawal completion failed"
        );
      }
    });

    this.wsService.on("withdrawal_failed_ack", (message) => {
      logger.info(
        { withdrawalId: message.withdrawalId },
        "Withdrawal failure acknowledged - returned to queue"
      );
    });

    // Address generation
    this.wsService.on("address_request", (message) => {
      this.handleAddressRequest(message);
    });

    this.wsService.on("address_request_assigned", async (message) => {
      await this.handleAddressRequestAssigned(message);
    });

    this.wsService.on("address_claim_result", (message) => {
      logger.info(
        { requestId: message.requestId, success: message.success },
        "Address claim result"
      );
    });

    this.wsService.on("address_generated_ack", (message) => {
      logger.info(
        { requestId: message.requestId },
        "Address generation acknowledged"
      );
    });

    // Deposit confirmations
    this.wsService.on("deposit_confirmed_ack", (message) => {
      if (message.success) {
        logger.info(
          {
            txHash: message.txHash,
            userId: message.userId,
            credited: message.credited,
          },
          "✅ Deposit confirmed and processed by server"
        );
      } else {
        logger.error(
          { txHash: message.txHash, error: message.error },
          "❌ Deposit confirmation failed"
        );
      }
    });

    // Capabilities acknowledgment
    this.wsService.on("capabilities_ack", (message) => {
      if (message.success === false) {
        logger.warn({ message }, "Capabilities rejected by server");
      } else {
        logger.info("Capabilities acknowledged by server");
      }
    });

    // Balance report acknowledgment
    this.wsService.on("balance_report_ack", (message) => {
      if (message.success === false) {
        logger.warn({ message }, "Balance report rejected by server");
      } else {
        logger.debug("Balance report acknowledged");
      }
    });

    // Token management
    this.wsService.on("token_revoked", () => {
      logger.error("Token has been revoked! Shutting down...");
      this.disconnect();
      process.exit(1);
    });

    this.wsService.on("token_regenerated", () => {
      logger.warn("Token regenerated. Need to update TAKER_TOKEN and restart.");
      this.disconnect();
    });
  }

  /**
   * Called when authentication is complete
   */
  private onAuthenticated(): void {
    // Send capabilities
    this.sendCapabilitiesReport();

    // Start balance reporting
    this.startBalanceReporting();

    // Start deposit monitoring
    this.startDepositMonitoring();
  }

  /**
   * Connect to exchange
   */
  connect(): void {
    this.wsService.connect();
  }

  /**
   * Disconnect from exchange
   */
  async disconnect(): Promise<void> {
    this.stopBalanceReporting();
    this.stopDepositMonitoring();
    await this.wsService.disconnect();
  }

  /**
   * Check if ready
   */
  isReady(): boolean {
    return this.wsService.isReady();
  }

  /**
   * Get WebSocket status
   */
  getWebSocketStatus() {
    return this.wsService.getStatus();
  }

  /**
   * Send capabilities report
   */
  private sendCapabilitiesReport(): void {
    this.wsService.send({
      type: "capabilities",
      deposit_networks: this.config.depositNetworks,
      withdraw_networks: this.config.withdrawNetworks,
      taker_fees: this.config.takerFees,
    });

    logger.info(
      {
        depositNetworks: this.config.depositNetworks.length,
        withdrawNetworks: this.config.withdrawNetworks.length,
        feeEntries: Object.keys(this.config.takerFees).length,
      },
      "Capabilities sent"
    );
  }

  /**
   * Start balance reporting
   */
  private startBalanceReporting(): void {
    this.stopBalanceReporting();

    // Send first report immediately
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
      "Balance reporting started"
    );
  }

  /**
   * Stop balance reporting
   */
  private stopBalanceReporting(): void {
    if (this.balanceReportTimer) {
      clearInterval(this.balanceReportTimer);
      this.balanceReportTimer = null;
    }
    this.balanceReportInFlight = false;
  }

  /**
   * Send balance report
   */
  private async sendBalanceReport(): Promise<void> {
    if (!this.isReady()) return;
    if (this.balanceReportInFlight) return;

    this.balanceReportInFlight = true;
    try {
      const balances = await this.balanceService.collectBalances();
      const sent = this.wsService.send({
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

  /**
   * Get current balances
   */
  async getBalances(): Promise<ReportBalance[]> {
    return this.balanceService.collectBalances();
  }

  /**
   * Start deposit monitoring
   */
  private startDepositMonitoring(): void {
    if (this.depositMonitor) {
      return;
    }

    this.depositMonitor = getDepositMonitor();

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
   * Report deposit to exchange
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
      logger.warn({ txHash: deposit.txHash }, "Cannot report deposit - not connected");
      return false;
    }

    logger.info(
      {
        txHash: deposit.txHash,
        userId: deposit.userId,
        amount: deposit.amount,
        symbol: deposit.symbol,
      },
      "📤 Reporting deposit to exchange"
    );

    return this.wsService.send({
      type: "deposit_confirmed",
      txHash: deposit.txHash,
      address: deposit.address,
      network: deposit.chain,
      symbol: deposit.symbol,
      amount: parseFloat(deposit.amount),
      confirmations: 10,
    });
  }

  /**
   * Get deposit monitor
   */
  getDepositMonitor(): DepositMonitor | null {
    return this.depositMonitor;
  }

  /**
   * Handle deposit request
   */
  private async handleDepositRequest(message: any): Promise<void> {
    logger.info(
      {
        depositId: message.depositId,
        symbol: message.symbol,
        amount: message.amount,
        address: message.address,
      },
      "Processing deposit request"
    );

    try {
      const result = await handleDepositRequest({
        depositId: message.depositId as number,
        symbol: message.symbol as string,
        amount: message.amount as number,
        address: message.address as string,
        userId: message.userId as number,
      });

      this.wsService.send({
        type: "deposit_confirmed",
        depositId: message.depositId,
        txHash: result.txHash,
        status: result.status,
      });
    } catch (error) {
      logger.error({ error, depositId: message.depositId }, "Deposit failed");
      this.wsService.send({
        type: "deposit_error",
        depositId: message.depositId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Handle withdrawal broadcast
   */
  private handleWithdrawalBroadcast(message: any): void {
    const withdrawal = message.withdrawal as {
      id: number;
      symbol: string;
      network: string;
      amount: string;
      address: string;
      tag: string | null;
      created_at: string;
      auto_approved?: boolean;
      rejection_reason?: string;
    };

    this.withdrawalService.addPending(withdrawal);
    this.startAutoProcessingIfNeeded(withdrawal.id);

    console.log(
      `\n💰 WITHDRAWAL REQUEST #${withdrawal.id}: ${withdrawal.amount} ${withdrawal.symbol} (${withdrawal.network})`
    );
    console.log(`   To: ${withdrawal.address}`);
    if (withdrawal.tag) console.log(`   Tag/Memo: ${withdrawal.tag}`);

    if (withdrawal.auto_approved) {
      console.log(`   ✅ Auto-approved: claiming and processing automatically\n`);
      return;
    }

    console.log(`   Type 'claim ${withdrawal.id}' to accept this withdrawal\n`);
  }

  /**
   * Handle withdrawal claim result
   */
  private handleWithdrawalClaimResult(message: any): void {
    const withdrawalId = message.withdrawalId as number;

    if (message.success) {
      const isAuto = this.autoProcessingWithdrawals.has(withdrawalId);

      logger.info(
        { withdrawalId },
        "✅ Withdrawal claimed successfully"
      );
      if (isAuto) {
        console.log(`\n✅ Withdrawal #${withdrawalId} claimed. Auto-processing now...\n`);
        this.processAutoApprovedWithdrawal(withdrawalId).catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          logger.error({ withdrawalId, error: message }, "Auto-processing failed unexpectedly");
          this.failWithdrawal(withdrawalId, `Auto-processing failed: ${message}`);
          this.autoProcessingWithdrawals.delete(withdrawalId);
        });
      } else {
        console.log(
          `\n✅ Withdrawal #${withdrawalId} claimed! Now process it and run:`
        );
        console.log(
          `   complete ${withdrawalId} <tx_hash>  - when successfully sent`
        );
        console.log(
          `   fail ${withdrawalId}              - if unable to process\n`
        );
      }
    } else {
      logger.warn(
        { withdrawalId, message: message.message },
        "❌ Withdrawal claim failed"
      );
      console.log(
        `\n❌ Failed to claim withdrawal #${withdrawalId}: ${message.message}\n`
      );
      this.autoProcessingWithdrawals.delete(withdrawalId);
      this.withdrawalService.remove(withdrawalId);
    }
  }

  private startAutoProcessingIfNeeded(withdrawalId: number): void {
    const withdrawal = this.withdrawalService.getById(withdrawalId);
    if (!withdrawal?.auto_approved) {
      return;
    }

    if (this.autoProcessingWithdrawals.has(withdrawalId)) {
      return;
    }

    this.autoProcessingWithdrawals.add(withdrawalId);
    logger.info({ withdrawalId }, "🤖 Auto-approved withdrawal detected, claiming automatically");
    this.claimWithdrawal(withdrawalId);
  }

  private async processAutoApprovedWithdrawal(withdrawalId: number): Promise<void> {
    const withdrawal = this.withdrawalService.getById(withdrawalId);
    if (!withdrawal) {
      this.autoProcessingWithdrawals.delete(withdrawalId);
      return;
    }

    logger.info({ withdrawalId }, "🚀 Processing auto-approved withdrawal");

    try {
      const { withdrawalProcessor } = await import("../services/withdrawal-processor.service");
      const result = await withdrawalProcessor.processWithdrawal(withdrawal);

      if (result.success && result.txHashes.length > 0) {
        this.completeWithdrawal(withdrawalId, result.txHashes[0]!);
        logger.info({ withdrawalId, txHashes: result.txHashes }, "✅ Auto-approved withdrawal completed");
      } else {
        const reason = result.error || "Unknown processing error";
        logger.warn({ withdrawalId, reason }, "❌ Auto-approved withdrawal processing failed");
        this.failWithdrawal(withdrawalId, `Auto-processing failed: ${reason}`);
      }
    } finally {
      this.autoProcessingWithdrawals.delete(withdrawalId);
    }
  }

  /**
   * Claim withdrawal
   */
  claimWithdrawal(withdrawalId: number): void {
    this.withdrawalService.claim(withdrawalId);
    logger.info({ withdrawalId }, "Claiming withdrawal...");
    this.wsService.send({
      type: "withdrawal_claim",
      withdrawalId,
    });
  }

  /**
   * Complete withdrawal
   */
  completeWithdrawal(withdrawalId: number, txHash: string): void {
    this.withdrawalService.complete(withdrawalId, txHash);
    logger.info({ withdrawalId, txHash }, "Completing withdrawal...");
    this.wsService.send({
      type: "withdrawal_completed",
      withdrawalId,
      txHash,
    });
  }

  /**
   * Fail withdrawal
   */
  failWithdrawal(withdrawalId: number, reason: string = "Unable to process"): void {
    this.withdrawalService.fail(withdrawalId, reason);
    logger.info({ withdrawalId, reason }, "Failing withdrawal...");
    this.wsService.send({
      type: "withdrawal_failed",
      withdrawalId,
      reason,
    });
  }

  /**
   * Get pending withdrawals
   */
  getPendingWithdrawals() {
    return this.withdrawalService.getPending();
  }

  /**
   * Handle address request
   */
  private handleAddressRequest(message: any): void {
    const requestId = message.requestId as number;
    const symbol = message.symbol as string;
    const network = message.network as string;
    const userId = message.userId as number;

    logger.info(
      { requestId, userId, symbol, network },
      "📨 Address request received - claiming..."
    );

    this.wsService.send({
      type: "address_claim",
      requestId,
    });
  }

  /**
   * Handle address request assigned
   */
  private async handleAddressRequestAssigned(message: any): Promise<void> {
    const requestId = message.requestId as number;
    const symbol = message.symbol as string;
    const network = message.network as string;
    const userId = message.userId as number;

    logger.info(
      { requestId, userId, symbol, network },
      "🎯 Request assigned to us - generating address..."
    );

    try {
      const result = await handleAddressGeneration({
        requestId,
        userId,
        symbol,
        network,
      });

      logger.info(
        { requestId, address: result.address, memo: result.memo },
        "✅ Address generated successfully"
      );

      this.wsService.send({
        type: "address_generated",
        requestId,
        address: result.address,
        memo: result.memo,
      });

      // Auto-simulate deposit for testing
      if (process.env.AUTO_SIMULATE_DEPOSIT === "true") {
        setTimeout(() => {
          this.simulateDeposit(result.address, symbol, network, userId);
        }, 3000);
      }
    } catch (error) {
      logger.error({ error, requestId }, "❌ Address generation failed");
      this.wsService.send({
        type: "address_error",
        requestId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Simulate deposit (for testing)
   */
  simulateDeposit(
    address: string,
    symbol: string,
    network?: string,
    userId?: number,
    amount?: number
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
      "🎭 Simulating deposit confirmation"
    );

    const msg: Record<string, unknown> = {
      type: "deposit_confirmed",
      address,
      symbol: symbol.toUpperCase(),
      amount: depositAmount,
      txHash,
      confirmations: 10,
    };

    if (network) {
      msg.network = network;
    }

    this.wsService.send(msg as any);
  }

  /**
   * Get random deposit amount
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
}
