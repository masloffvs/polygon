/**
 * Withdrawal Processor Service
 * Handles actual blockchain withdrawals via polygonmoneyflow API
 */

import { logger } from "../logger";
import { getWalletApi, normalizeNetwork } from "../wallet-api";
import { dbService } from "./database.service";
import type { WithdrawalRequest } from "./withdrawal.service";

interface RefinanceTransferRequest {
  chain: string;
  to: string;
  amount: string;
  allowSplit: boolean;
  asset?: string;
}

interface RefinanceTransferResponse {
  chain: string;
  asset: string;
  to: string;
  requestedAmount: string;
  transferredAmount: string;
  remainingAmount: string;
  allowSplit: boolean;
  transfers: Array<{
    walletId: string;
    fromAddress: string;
    amount: string;
    feeReserved: string;
    feeCurrency: string;
    txnId: string;
    txHash: string;
    status: string;
  }>;
  txHashes: string[];
  walletsConsidered: number;
  walletsWithHistory: number;
  walletsWithLiquidity: number;
}

const TOKEN_DECIMALS: Record<string, number> = {
  USDT: 6,
  USDC: 6,
  BTC: 8,
  ETH: 18,
  SOL: 9,
  XRP: 6,
  TRX: 6,
  DOGE: 8,
  LTC: 8,
  ADA: 6,
  DOT: 10,
  ATOM: 6,
  LINK: 18,
};

const CHAIN_DECIMALS: Record<string, number> = {
  solana: 9,
  bitcoin: 8,
  xrp: 6,
  trx: 6,
  eth: 18,
  base: 18,
  polygon: 18,
  polkadot: 10,
  atom: 6,
  ada: 6,
  link: 18,
};

export class WithdrawalProcessorService {
  private isProcessableStatus(status: string): boolean {
    return status === "auto_approved" || status === "claimed" || status === "pending";
  }

  private getMaxDecimals(chain: string, symbol: string): number {
    const bySymbol = TOKEN_DECIMALS[symbol.toUpperCase()];
    if (bySymbol !== undefined) {
      return bySymbol;
    }

    const byChain = CHAIN_DECIMALS[chain.toLowerCase()];
    if (byChain !== undefined) {
      return byChain;
    }

    return 8;
  }

  private trimDecimalString(value: string): string {
    if (!value.includes(".")) {
      return value;
    }

    return value.replace(/\.?0+$/, "");
  }

  private expandScientificNotation(value: string): string | null {
    const match = value.match(/^([+-]?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/);
    if (!match) {
      return null;
    }

    const sign = match[1] ?? "";
    const intPart = match[2] ?? "0";
    const fracPart = match[3] ?? "";
    const exponent = Number.parseInt(match[4] ?? "0", 10);

    if (!Number.isFinite(exponent)) {
      return null;
    }

    const digits = `${intPart}${fracPart}`;
    const decimalIndex = intPart.length + exponent;

    if (decimalIndex <= 0) {
      return `${sign}0.${"0".repeat(Math.abs(decimalIndex))}${digits}`;
    }

    if (decimalIndex >= digits.length) {
      return `${sign}${digits}${"0".repeat(decimalIndex - digits.length)}`;
    }

    return `${sign}${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
  }

  private normalizeAmountToPrecision(rawAmount: string, maxDecimals: number): { amount: string; changed: boolean } {
    const input = rawAmount.trim();
    const expanded = this.expandScientificNotation(input);
    const normalizedInput = expanded ?? input;
    const match = normalizedInput.match(/^(\d+)(?:\.(\d+))?$/);

    if (!match) {
      throw new Error(`Invalid amount format: ${rawAmount}`);
    }

    const integerPart = match[1]!.replace(/^0+(?=\d)/, "");
    const fractionPart = match[2] ?? "";
    const normalizedInt = integerPart.length > 0 ? integerPart : "0";

    if (maxDecimals < 0) {
      throw new Error(`Invalid precision configuration: ${maxDecimals}`);
    }

    if (maxDecimals === 0) {
      const amount = normalizedInt;
      return { amount, changed: amount !== input };
    }

    const croppedFraction = fractionPart.slice(0, maxDecimals);
    const combined = croppedFraction.length > 0
      ? `${normalizedInt}.${croppedFraction}`
      : normalizedInt;
    const amount = this.trimDecimalString(combined);

    return { amount, changed: amount !== input };
  }

  /**
   * Process withdrawal through polygonmoneyflow API
   */
  async processWithdrawal(withdrawal: WithdrawalRequest): Promise<{
    success: boolean;
    txHashes: string[];
    error?: string;
  }> {
    const withdrawalId = withdrawal.id;

    try {
      // Проверяем текущий статус, чтобы не откатывать ручные решения и не обрабатывать повторно
      const record = dbService.getWithdrawalRecord(withdrawalId);
      if (record && !this.isProcessableStatus(record.status)) {
        const error = record.status === "manual_review"
          ? "Withdrawal requires manual claim before processing"
          : `Withdrawal cannot be processed from status: ${record.status}`;

        logger.warn({ withdrawalId, status: record.status, error }, "❌ Withdrawal not processable");

        return {
          success: false,
          txHashes: [],
          error,
        };
      }

      // 1. Нормализация сети
      const chainId = normalizeNetwork(withdrawal.network);
      if (!chainId) {
        const error = `Unsupported network: ${withdrawal.network}`;
        logger.error({ withdrawalId, network: withdrawal.network }, error);
        dbService.updateStatus(withdrawalId, 'failed', undefined, error);
        return { success: false, txHashes: [], error };
      }

      const maxDecimals = this.getMaxDecimals(chainId, withdrawal.symbol);
      const normalizedAmount = this.normalizeAmountToPrecision(withdrawal.amount, maxDecimals);
      const normalizedAmountValue = Number.parseFloat(normalizedAmount.amount);

      if (!Number.isFinite(normalizedAmountValue) || normalizedAmountValue <= 0) {
        const error = `Amount ${withdrawal.amount} becomes invalid after precision normalization (${maxDecimals} decimals)`;
        logger.error({ withdrawalId, amount: withdrawal.amount, maxDecimals }, error);
        dbService.updateStatus(withdrawalId, 'failed', undefined, error);
        return { success: false, txHashes: [], error };
      }

      if (normalizedAmount.changed) {
        logger.info(
          {
            withdrawalId,
            originalAmount: withdrawal.amount,
            normalizedAmount: normalizedAmount.amount,
            symbol: withdrawal.symbol,
            chain: chainId,
            maxDecimals,
          },
          "Amount normalized to supported precision"
        );
      }

      logger.info(
        {
          withdrawalId,
          chain: chainId,
          to: withdrawal.address,
          amount: normalizedAmount.amount,
          symbol: withdrawal.symbol,
        },
        "🚀 Processing withdrawal via refinanceTransfer"
      );

      // 2. Вызов API refinanceTransfer
      const walletApi = getWalletApi();
      const response = await this.callRefinanceTransfer(walletApi, {
        chain: chainId,
        to: withdrawal.address,
        amount: normalizedAmount.amount,
        allowSplit: true,
        asset: withdrawal.symbol === 'SOL' || withdrawal.symbol === 'ETH' || withdrawal.symbol === 'BTC' 
          ? '' 
          : withdrawal.symbol, // Native coin = empty string
      });

      // 3. Проверка результата
      if (response.txHashes.length === 0) {
        const error = 'No transactions created';
        logger.error({ withdrawalId, response }, error);
        dbService.updateStatus(withdrawalId, 'failed', undefined, error);
        return { success: false, txHashes: [], error };
      }

      // 4. Логирование всех txHash
      const combinedTxHash = response.txHashes.join(',');
      dbService.setTxHash(withdrawalId, combinedTxHash);

      // Логируем детали каждого трансфера
      for (const transfer of response.transfers) {
        dbService.log(
          withdrawalId,
          'transfer_executed',
          `Transfer from ${transfer.fromAddress}: ${transfer.amount} ${response.asset || chainId.toUpperCase()} | TxHash: ${transfer.txHash} | Status: ${transfer.status}`
        );
      }

      logger.info(
        {
          withdrawalId,
          txHashes: response.txHashes,
          transferredAmount: response.transferredAmount,
          walletsUsed: response.transfers.length,
        },
        "✅ Withdrawal processed successfully"
      );

      // 5. Обновление статуса
      dbService.updateStatus(withdrawalId, 'completed');

      // 6. Проверка баланса (fire-and-forget)
      this.checkBalanceAsync(chainId, response.transfers[0].fromAddress).catch((err) => {
        logger.warn({ error: err.message }, "Balance check failed (non-critical)");
      });

      return {
        success: true,
        txHashes: response.txHashes,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error(
        {
          withdrawalId,
          error: errorMessage,
        },
        "❌ Withdrawal processing failed"
      );

      dbService.updateStatus(withdrawalId, 'failed', undefined, errorMessage);
      dbService.log(withdrawalId, 'error', `Processing failed: ${errorMessage}`);

      return {
        success: false,
        txHashes: [],
        error: errorMessage,
      };
    }
  }

  /**
   * Call refinanceTransfer API
   */
  private async callRefinanceTransfer(
    walletApi: any,
    request: RefinanceTransferRequest
  ): Promise<RefinanceTransferResponse> {
    const url = `${walletApi.config.baseUrl}/transactions/refinanceTransfer`;

    logger.debug({ url, request }, "Calling refinanceTransfer API");

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(30000), // 30 seconds timeout
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`refinanceTransfer API error: ${response.status} - ${error}`);
    }

    const result = (await response.json()) as RefinanceTransferResponse;

    logger.info(
      {
        chain: result.chain,
        transferred: result.transferredAmount,
        remaining: result.remainingAmount,
        txCount: result.txHashes.length,
      },
      "refinanceTransfer API response"
    );

    return result;
  }

  /**
   * Check balance after withdrawal (fire-and-forget)
   */
  private async checkBalanceAsync(chain: string, address: string): Promise<void> {
    try {
      const walletApi = getWalletApi();
      const url = `${walletApi.config.baseUrl}/wallets/${chain}/${address}/balance`;

      logger.debug({ chain, address, url }, "Checking balance (fire-and-forget)");

      // Fire-and-forget - не ждем ответа
      fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      }).catch(() => {
        // Игнорируем ошибки
      });
    } catch (error) {
      // Игнорируем ошибки
    }
  }
}

export const withdrawalProcessor = new WithdrawalProcessorService();
