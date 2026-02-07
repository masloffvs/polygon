/**
 * Wallet Taker Client
 *
 * High-availability client for connecting to the exchange
 * and handling wallet operations.
 */

import * as readline from "readline";
import { TakerClient } from "./client";
import { logger } from "./logger";
import { getSupportedNetworks, initWalletApi } from "./wallet-api";

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

// Load environment variables
const config = {
  wsUrl:
    process.env.TAKER_WS_URL || "ws://localhost:3000/api/ws/tier/takerWallet",
  token: process.env.TAKER_TOKEN || "",
  reconnectDelay: parseInt(process.env.RECONNECT_DELAY || "1000"),
  maxReconnectDelay: parseInt(process.env.MAX_RECONNECT_DELAY || "30000"),
  heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL || "10000"),
  balanceReportIntervalMs: parseInt(
    process.env.BALANCE_REPORT_INTERVAL_MS || "30000",
  ),
  depositNetworks: parseListEnv(
    process.env.TAKER_DEPOSIT_NETWORKS,
    DEFAULT_DEPOSIT_NETWORKS,
  ),
  withdrawNetworks: parseListEnv(
    process.env.TAKER_WITHDRAW_NETWORKS,
    DEFAULT_DEPOSIT_NETWORKS,
  ),
  takerFees: parseJsonEnv<Record<string, string>>(
    process.env.TAKER_FEES_JSON,
    DEFAULT_TAKER_FEES,
  ),
  balanceTargets: parseJsonEnv<
    Array<{ chain: string; idOrAddress: string; symbol?: string; asset?: string }>
  >(process.env.TAKER_BALANCE_TARGETS_JSON, []),
  usdPriceOverrides: parseJsonEnv<Record<string, number>>(
    process.env.TAKER_USD_PRICE_OVERRIDES_JSON,
    {},
  ),
};

// Validate config
if (!config.token) {
  logger.error("TAKER_TOKEN is required. Get it from /operator/takerValidator");
  process.exit(1);
}

// Check wallet API config
if (!process.env.URL_POLYGON_WALLET) {
  logger.warn(
    "URL_POLYGON_WALLET not set - address generation will fail. Set it to polygonmoneyflow service URL.",
  );
}

logger.info({ wsUrl: config.wsUrl }, "Starting Wallet Taker Client");

// Initialize wallet API connection
initWalletApi().catch((err) => {
  logger.error({ error: err.message }, "Failed to initialize wallet API");
});

// Create and start client
const client = new TakerClient(config);

// Handle graceful shutdown
const shutdown = async () => {
  logger.info("Shutting down...");
  await client.disconnect();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Start the client
client.connect();

// Interactive console for testing
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log("\n📋 Commands:");
console.log("  deposit <address> <symbol> <amount>  - Simulate deposit");
console.log(
  "  withdrawals                          - List pending withdrawals",
);
console.log("  claim <id>                           - Claim a withdrawal");
console.log(
  "  complete <id> <txHash>               - Complete withdrawal with tx hash",
);
console.log(
  "  fail <id> [reason]                   - Mark withdrawal as failed",
);
console.log("  networks                             - List supported networks");
console.log(
  "  monitor                              - Show deposit monitor status",
);
console.log("  checkuser <userId>                   - Check deposits for user");
console.log("  status                               - Show connection status");
console.log("  exit                                 - Disconnect and exit\n");

rl.on("line", (line) => {
  const parts = line.trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase();

  if (cmd === "deposit" && parts.length >= 4) {
    const address = parts[1]!;
    const symbol = parts[2]!.toUpperCase();
    const amount = parseFloat(parts[3]!);
    // Network is optional - server will use address lookup if not provided
    const network = parts[4] || undefined;

    if (isNaN(amount) || amount <= 0) {
      console.log("❌ Invalid amount");
      return;
    }

    client.simulateDeposit(address, symbol, network, undefined, amount);
    console.log(`💰 Simulating deposit: ${amount} ${symbol} to ${address}`);
    console.log("⏳ Waiting for server confirmation...");
  } else if (cmd === "withdrawals" || cmd === "w") {
    const pending = client.getPendingWithdrawals();
    if (pending.length === 0) {
      console.log("📭 No pending withdrawals");
    } else {
      console.log(`\n📋 Pending withdrawals (${pending.length}):`);
      for (const w of pending) {
        console.log(
          `  #${w.id}: ${w.amount} ${w.symbol} (${w.network}) → ${w.address}`,
        );
      }
      console.log("");
    }
  } else if (cmd === "claim" && parts.length >= 2) {
    const id = parseInt(parts[1]!);
    if (isNaN(id)) {
      console.log("❌ Invalid withdrawal ID");
      return;
    }
    client.claimWithdrawal(id);
    console.log(`🎯 Claiming withdrawal #${id}...`);
  } else if (cmd === "complete" && parts.length >= 3) {
    const id = parseInt(parts[1]!);
    const txHash = parts[2]!;
    if (isNaN(id)) {
      console.log("❌ Invalid withdrawal ID");
      return;
    }
    if (!txHash || txHash.length < 10) {
      console.log("❌ Invalid transaction hash");
      return;
    }
    client.completeWithdrawal(id, txHash);
    console.log(`✅ Completing withdrawal #${id} with tx: ${txHash}`);
  } else if (cmd === "fail" && parts.length >= 2) {
    const id = parseInt(parts[1]!);
    const reason = parts.slice(2).join(" ") || "Unable to process";
    if (isNaN(id)) {
      console.log("❌ Invalid withdrawal ID");
      return;
    }
    client.failWithdrawal(id, reason);
    console.log(`❌ Marking withdrawal #${id} as failed: ${reason}`);
  } else if (cmd === "status") {
    console.log(`📡 Connected: ${client.isReady()}`);
    const pending = client.getPendingWithdrawals();
    console.log(`📋 Pending withdrawals: ${pending.length}`);
    console.log(
      `🔗 Wallet API: ${process.env.URL_POLYGON_WALLET || "NOT SET"}`,
    );
    const monitor = client.getDepositMonitor();
    if (monitor) {
      const monitorStatus = monitor.getStatus();
      console.log(
        `🔍 Deposit monitor: ${monitorStatus.running ? "RUNNING" : "STOPPED"} (${monitorStatus.processedCount} processed)`,
      );
    }
  } else if (cmd === "monitor") {
    const monitor = client.getDepositMonitor();
    if (!monitor) {
      console.log("❌ Deposit monitor not started (not authenticated yet?)");
    } else {
      const status = monitor.getStatus();
      console.log("\n🔍 Deposit Monitor Status:");
      console.log(`  Running: ${status.running ? "✅ YES" : "❌ NO"}`);
      console.log(`  Poll interval: ${status.pollIntervalMs}ms`);
      console.log(`  Transactions processed: ${status.processedCount}`);
      console.log("");
    }
  } else if (cmd === "checkuser" && parts.length >= 2) {
    const userId = parseInt(parts[1]!);
    if (isNaN(userId)) {
      console.log("❌ Invalid user ID");
      return;
    }
    const monitor = client.getDepositMonitor();
    if (!monitor) {
      console.log("❌ Deposit monitor not available");
      return;
    }
    console.log(`🔍 Checking deposits for user ${userId}...`);
    monitor
      .checkUser(userId)
      .then((txs) => {
        if (txs.length === 0) {
          console.log("📭 No deposits found for this user");
        } else {
          console.log(`\n📋 Found ${txs.length} transactions:`);
          for (const tx of txs) {
            const statusIcon =
              tx.status === "confirmed"
                ? "✅"
                : tx.status === "pending"
                  ? "⏳"
                  : "❌";
            console.log(
              `  ${statusIcon} ${tx.amount} ${tx.asset} (${tx.chain}) - ${tx.txHash || "no hash"}`,
            );
          }
          console.log("");
        }
      })
      .catch((err) => {
        console.log(`❌ Error: ${err.message}`);
      });
  } else if (cmd === "networks") {
    const networks = getSupportedNetworks();
    console.log(`\n🌐 Supported networks (${networks.length}):`);
    console.log(`  ${networks.join(", ")}`);
    console.log(
      "\nMapped to chains: solana, eth, base, polygon, trx, xrp, polkadot\n",
    );
  } else if (cmd === "exit" || cmd === "quit") {
    shutdown();
  } else if (cmd) {
    console.log("Unknown command. Type 'status' for help.");
  }
});

// Export for programmatic use
export { client, config, TakerClient };
