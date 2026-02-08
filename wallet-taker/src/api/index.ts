/**
 * ElysiaJS API Server
 * REST API for wallet taker management
 */

import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { logger } from "../logger";
import { dbService } from "../services/database.service";
import type { TakerClient } from "../client";

export function createApiServer(client: TakerClient) {
  const app = new Elysia()
    .use(cors())
    .use(
      swagger({
        documentation: {
          info: {
            title: "Wallet Taker API",
            version: "2.0.0",
            description: "REST API for managing wallet taker operations",
          },
          tags: [
            { name: "Status", description: "Connection and system status" },
            { name: "Deposits", description: "Deposit operations" },
            { name: "Withdrawals", description: "Withdrawal management" },
            { name: "Monitoring", description: "Deposit monitoring" },
            { name: "Limits", description: "Auto-withdrawal limits" },
          ],
        },
      })
    )
    .get("/", () => ({
      name: "Wallet Taker API",
      version: "2.0.0",
      status: "running",
    }))
    .get(
      "/health",
      () => ({
        status: "ok",
        timestamp: new Date().toISOString(),
      }),
      {
        detail: {
          tags: ["Status"],
          summary: "Health check",
        },
      }
    )
    .get(
      "/status",
      () => {
        const monitor = client.getDepositMonitor();
        const monitorStatus = monitor?.getStatus();

        return {
          connected: client.isReady(),
          websocket: client.getWebSocketStatus(),
          pendingWithdrawals: client.getPendingWithdrawals().length,
          depositMonitor: monitorStatus
            ? {
                running: monitorStatus.running,
                processedCount: monitorStatus.processedCount,
                pollIntervalMs: monitorStatus.pollIntervalMs,
              }
            : null,
        };
      },
      {
        detail: {
          tags: ["Status"],
          summary: "Get connection status",
        },
      }
    )
    .get(
      "/withdrawals",
      () => ({
        withdrawals: client.getPendingWithdrawals(),
        count: client.getPendingWithdrawals().length,
      }),
      {
        detail: {
          tags: ["Withdrawals"],
          summary: "List pending withdrawals",
        },
      }
    )
    .post(
      "/withdrawals/:id/process",
      async ({ params: { id } }) => {
        const withdrawalId = parseInt(id);
        if (isNaN(withdrawalId)) {
          return {
            success: false,
            error: "Invalid withdrawal ID",
          };
        }

        const withdrawal = client.getPendingWithdrawals().find(w => w.id === withdrawalId);
        if (!withdrawal) {
          return {
            success: false,
            error: "Withdrawal not found",
          };
        }

        try {
          const { withdrawalProcessor } = await import("../services/withdrawal-processor.service");
          const result = await withdrawalProcessor.processWithdrawal(withdrawal);

          if (result.success) {
            // Отправляем подтверждение на exchange
            client.completeWithdrawal(withdrawalId, result.txHashes[0]);
            
            return {
              success: true,
              txHashes: result.txHashes,
              message: `Withdrawal processed with ${result.txHashes.length} transaction(s)`,
            };
          } else {
            return {
              success: false,
              error: result.error,
            };
          }
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      },
      {
        detail: {
          tags: ["Withdrawals"],
          summary: "Process withdrawal through blockchain",
        },
      }
    )
    .post(
      "/withdrawals/:id/claim",
      ({ params: { id } }) => {
        const withdrawalId = parseInt(id);
        if (isNaN(withdrawalId)) {
          return {
            success: false,
            error: "Invalid withdrawal ID",
          };
        }

        client.claimWithdrawal(withdrawalId);
        return {
          success: true,
          message: `Claiming withdrawal #${withdrawalId}`,
        };
      },
      {
        detail: {
          tags: ["Withdrawals"],
          summary: "Claim a withdrawal",
        },
      }
    )
    .post(
      "/withdrawals/:id/complete",
      ({ params: { id }, body }) => {
        const withdrawalId = parseInt(id);
        const { txHash } = body as { txHash: string };

        if (isNaN(withdrawalId)) {
          return {
            success: false,
            error: "Invalid withdrawal ID",
          };
        }

        if (!txHash || txHash.length < 10) {
          return {
            success: false,
            error: "Invalid transaction hash",
          };
        }

        client.completeWithdrawal(withdrawalId, txHash);
        return {
          success: true,
          message: `Withdrawal #${withdrawalId} completed`,
          txHash,
        };
      },
      {
        detail: {
          tags: ["Withdrawals"],
          summary: "Complete a withdrawal with transaction hash",
        },
      }
    )
    .post(
      "/withdrawals/:id/fail",
      ({ params: { id }, body }) => {
        const withdrawalId = parseInt(id);
        const { reason } = (body as { reason?: string }) || {};

        if (isNaN(withdrawalId)) {
          return {
            success: false,
            error: "Invalid withdrawal ID",
          };
        }

        client.failWithdrawal(withdrawalId, reason || "Unable to process");
        return {
          success: true,
          message: `Withdrawal #${withdrawalId} marked as failed`,
        };
      },
      {
        detail: {
          tags: ["Withdrawals"],
          summary: "Mark withdrawal as failed",
        },
      }
    )
    .post(
      "/deposits/simulate",
      ({ body }) => {
        const { address, symbol, network, userId, amount } = body as {
          address: string;
          symbol: string;
          network?: string;
          userId?: number;
          amount?: number;
        };

        if (!address || !symbol) {
          return {
            success: false,
            error: "Address and symbol are required",
          };
        }

        client.simulateDeposit(address, symbol, network, userId, amount);
        return {
          success: true,
          message: "Deposit simulation sent",
          data: { address, symbol, network, amount },
        };
      },
      {
        detail: {
          tags: ["Deposits"],
          summary: "Simulate a deposit (for testing)",
        },
      }
    )
    .get(
      "/monitor/status",
      () => {
        const monitor = client.getDepositMonitor();
        if (!monitor) {
          return {
            error: "Deposit monitor not available",
          };
        }

        return monitor.getStatus();
      },
      {
        detail: {
          tags: ["Monitoring"],
          summary: "Get deposit monitor status",
        },
      }
    )
    .get(
      "/monitor/user/:userId",
      async ({ params: { userId } }) => {
        const monitor = client.getDepositMonitor();
        if (!monitor) {
          return {
            error: "Deposit monitor not available",
          };
        }

        const userIdNum = parseInt(userId);
        if (isNaN(userIdNum)) {
          return {
            error: "Invalid user ID",
          };
        }

        try {
          const txs = await monitor.checkUser(userIdNum);
          return {
            userId: userIdNum,
            transactions: txs,
            count: txs.length,
          };
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      },
      {
        detail: {
          tags: ["Monitoring"],
          summary: "Check deposits for specific user",
        },
      }
    )
    .get(
      "/balances",
      async () => {
        try {
          const balances = await client.getBalances();
          return {
            balances,
            count: balances.length,
            totalUsd: balances.reduce((sum, b) => sum + b.usd_value, 0),
          };
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      },
      {
        detail: {
          tags: ["Status"],
          summary: "Get current balances",
        },
      }
    )
    .get(
      "/limits",
      () => {
        const limits = dbService.getAllLimits();
        const stats = dbService.getStats();
        return {
          limits,
          stats,
        };
      },
      {
        detail: {
          tags: ["Limits"],
          summary: "Get all auto-withdrawal limits",
        },
      }
    )
    .post(
      "/limits",
      ({ body }) => {
        const { symbol, maxAmount, enabled } = body as {
          symbol: string;
          maxAmount: number;
          enabled: boolean;
        };

        if (!symbol || maxAmount === undefined) {
          return {
            success: false,
            error: "Symbol and maxAmount are required",
          };
        }

        dbService.updateLimit(symbol, maxAmount, enabled ?? true);
        return {
          success: true,
          message: `Limit for ${symbol} updated`,
        };
      },
      {
        detail: {
          tags: ["Limits"],
          summary: "Update auto-withdrawal limit",
        },
      }
    )
    .get(
      "/withdrawals/:id/history",
      ({ params: { id } }) => {
        const withdrawalId = parseInt(id);
        if (isNaN(withdrawalId)) {
          return {
            error: "Invalid withdrawal ID",
          };
        }

        const logs = dbService.getWithdrawalLogs(withdrawalId);
        return {
          withdrawalId,
          logs,
        };
      },
      {
        detail: {
          tags: ["Withdrawals"],
          summary: "Get withdrawal history logs",
        },
      }
    )
    .get(
      "/address/:address/history",
      ({ params: { address } }) => {
        const history = dbService.getAddressHistory(address, 20);
        return {
          address,
          history,
          count: history.length,
        };
      },
      {
        detail: {
          tags: ["Withdrawals"],
          summary: "Get withdrawal history for address",
        },
      }
    )
    .get(
      "/limits/address-progress",
      ({ query }) => {
        const rawLimit = (query as Record<string, string | undefined>)?.limit;
        const parsedLimit = rawLimit ? parseInt(rawLimit, 10) : 200;
        const rows = dbService.getAddressLimitProgress(Number.isFinite(parsedLimit) ? parsedLimit : 200);

        return {
          rows,
          count: rows.length,
        };
      },
      {
        detail: {
          tags: ["Limits"],
          summary: "Get address withdrawal totals and progress to symbol limit",
        },
      }
    )
    .onError(({ code, error }) => {
      logger.error({ code, error: error.message }, "API error");
      return {
        success: false,
        error: error.message,
        code,
      };
    });

  return app;
}
