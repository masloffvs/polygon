/**
 * Wallet Taker Client v2.0
 *
 * High-availability client with ElysiaJS API
 */

import * as readline from "readline";
import { TakerClient } from "./client";
import { logger } from "./logger";
import { getSupportedNetworks, initWalletApi } from "./wallet-api";
import { loadConfig, validateConfig } from "./config";
import { createApiServer } from "./api";

// Load and validate configuration
const config = loadConfig();

try {
  validateConfig(config);
} catch (error) {
  logger.error({ error: error instanceof Error ? error.message : String(error) }, "Configuration error");
  process.exit(1);
}

logger.info({ wsUrl: config.wsUrl }, "Starting Wallet Taker Client v2.0");

// Initialize wallet API connection
initWalletApi().catch((err) => {
  logger.error({ error: err.message }, "Failed to initialize wallet API");
});

// Create and start client
const client = new TakerClient(config);

// Create and start API server
const apiServer = createApiServer(client);

apiServer.listen(config.apiPort);

logger.info(
  { port: config.apiPort, host: config.apiHost },
  "🚀 API server started"
);
logger.info(
  `📚 Swagger docs: http://localhost:${config.apiPort}/swagger`
);

// Handle graceful shutdown
const shutdown = async () => {
  logger.info("Shutting down...");
  await client.disconnect();
  // ElysiaJS doesn't have a stop method, server will close on process exit
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
console.log("  withdrawals                          - List pending withdrawals");
console.log("  claim <id>                           - Claim a withdrawal");
console.log("  complete <id> <txHash>               - Complete withdrawal with tx hash");
console.log("  fail <id> [reason]                   - Mark withdrawal as failed");
console.log("  networks                             - List supported networks");
console.log("  monitor                              - Show deposit monitor status");
console.log("  checkuser <userId>                   - Check deposits for user");
console.log("  status                               - Show connection status");
console.log("  api                                  - Show API info");
console.log("  exit                                 - Disconnect and exit\n");

rl.on("line", (line) => {
  const parts = line.trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase();

  if (cmd === "deposit" && parts.length >= 4) {
    const address = parts[1]!;
    const symbol = parts[2]!.toUpperCase();
    const amount = parseFloat(parts[3]!);
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
          `  #${w.id}: ${w.amount} ${w.symbol} (${w.network}) → ${w.address}`
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
    console.log(`🔗 Wallet API: ${process.env.URL_POLYGON_WALLET || "NOT SET"}`);
    const monitor = client.getDepositMonitor();
    if (monitor) {
      const monitorStatus = monitor.getStatus();
      console.log(
        `🔍 Deposit monitor: ${monitorStatus.running ? "RUNNING" : "STOPPED"} (${monitorStatus.processedCount} processed)`
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
              `  ${statusIcon} ${tx.amount} ${tx.asset} (${tx.chain}) - ${tx.txHash || "no hash"}`
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
      "\nMapped to chains: solana, eth, base, polygon, trx, xrp, polkadot\n"
    );
  } else if (cmd === "api") {
    console.log("\n🚀 API Server Info:");
    console.log(`  Host: ${config.apiHost}`);
    console.log(`  Port: ${config.apiPort}`);
    console.log(
      `  Swagger: http://${config.apiHost === "0.0.0.0" ? "localhost" : config.apiHost}:${config.apiPort}/swagger`
    );
    console.log(
      `  Health: http://${config.apiHost === "0.0.0.0" ? "localhost" : config.apiHost}:${config.apiPort}/health`
    );
    console.log("");
  } else if (cmd === "exit" || cmd === "quit") {
    shutdown();
  } else if (cmd) {
    console.log("Unknown command. Type 'status' for help.");
  }
});

// Export for programmatic use
export { client, config, TakerClient };
