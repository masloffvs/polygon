/**
 * Wallet Operation Handlers
 *
 * Handles real wallet operations by communicating
 * with the polygonmoneyflow wallet service.
 */

import { logger } from "./logger";
import {
  type ChainId,
  getSupportedNetworks,
  getWalletApi,
  normalizeNetwork,
} from "./wallet-api";

export interface DepositRequest {
  depositId: number;
  symbol: string;
  amount: number;
  address: string;
  userId: number;
}

export interface DepositResult {
  txHash: string;
  status: "confirmed" | "pending" | "failed";
}

export interface WithdrawalRequest {
  withdrawalId: number;
  symbol: string;
  amount: number;
  toAddress: string;
  userId: number;
}

export interface WithdrawalResult {
  txHash: string;
  status: "processed" | "pending" | "failed";
}

export interface AddressGenerationRequest {
  requestId: number;
  userId: number;
  symbol: string;
  network: string;
}

export interface AddressGenerationResult {
  address: string;
  memo?: string;
}

/**
 * Coins that require a memo/tag for deposits
 */
const MEMO_COINS = ["XRP", "XLM", "ATOM", "EOS", "BNB", "HBAR", "TON"];

/**
 * Check if a coin requires memo/tag
 */
function needsMemo(symbol: string): boolean {
  return MEMO_COINS.includes(symbol.toUpperCase());
}

/**
 * Generate a deterministic memo for a user
 * Using userId ensures the same user always gets the same memo
 */
function generateMemoForUser(userId: number): string {
  // Create a deterministic memo based on userId
  // This ensures deposits can be attributed to the correct user
  return String(100000000 + (userId % 900000000));
}

/**
 * Generate deposit address for user
 *
 * Uses the polygonmoneyflow wallet service to create real addresses.
 * Each user gets consistent addresses via virtual-owned wallets.
 */
export async function handleAddressGeneration(
  request: AddressGenerationRequest,
): Promise<AddressGenerationResult> {
  logger.info(
    {
      requestId: request.requestId,
      userId: request.userId,
      symbol: request.symbol,
      network: request.network,
    },
    "Generating deposit address",
  );

  // Normalize network name to our chain ID
  const chainId = normalizeNetwork(request.network);

  if (!chainId) {
    logger.error(
      {
        network: request.network,
        supported: getSupportedNetworks(),
      },
      "Unsupported network requested",
    );
    throw new Error(
      `Unsupported network: ${request.network}. Supported: ${getSupportedNetworks().join(", ")}`,
    );
  }

  try {
    const walletApi = getWalletApi();

    // Use virtual-owned wallets to ensure consistent addresses per user
    // The owner ID format: "user_{userId}" ensures each user gets their own set
    const ownerKey = `user_${request.userId}`;

    const result = await walletApi.createVirtualOwnedWallets(ownerKey, [
      chainId,
    ]);

    // Find the wallet for the requested chain
    const wallet = result.wallets.find((w) => w.chain === chainId);

    if (!wallet) {
      throw new Error(`Failed to create wallet for chain: ${chainId}`);
    }

    // Generate memo if needed (for XRP, XLM, etc.)
    const memo = needsMemo(request.symbol)
      ? generateMemoForUser(request.userId)
      : undefined;

    logger.info(
      {
        requestId: request.requestId,
        userId: request.userId,
        chain: chainId,
        address: wallet.address,
        memo,
        walletId: wallet.id,
        created: wallet.created,
      },
      "✅ Real deposit address generated",
    );

    return { address: wallet.address, memo };
  } catch (error) {
    logger.error(
      {
        requestId: request.requestId,
        userId: request.userId,
        network: request.network,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to generate address",
    );
    throw error;
  }
}

/**
 * Get all deposit addresses for a user across all supported chains
 */
export async function getAllAddressesForUser(
  userId: number,
): Promise<Map<ChainId, string>> {
  const walletApi = getWalletApi();
  const ownerKey = `user_${userId}`;

  const result = await walletApi.createVirtualOwnedWallets(ownerKey);
  const addresses = new Map<ChainId, string>();

  for (const wallet of result.wallets) {
    addresses.set(wallet.chain, wallet.address);
  }

  return addresses;
}

/**
 * Handle deposit confirmation
 *
 * This is called when the exchange notifies about a deposit
 * that needs to be verified on-chain.
 *
 * TODO: Implement your blockchain verification logic
 */
export async function handleDepositRequest(
  request: DepositRequest,
): Promise<DepositResult> {
  logger.info(
    {
      depositId: request.depositId,
      symbol: request.symbol,
      amount: request.amount,
    },
    "Handling deposit request",
  );

  // TODO: Implement your actual deposit verification logic
  // Example:
  // 1. Check blockchain for the transaction
  // 2. Verify amount and destination address
  // 3. Return confirmation with txHash

  // Placeholder - simulates processing time
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Placeholder response
  return {
    txHash: `0x${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`,
    status: "confirmed",
  };
}

/**
 * Handle withdrawal request
 *
 * This is called when the exchange needs to process a withdrawal.
 * Uses polygonmoneyflow refinanceTransfer API for actual blockchain sending.
 */
export async function handleWithdrawalRequest(
  request: WithdrawalRequest,
): Promise<WithdrawalResult> {
  logger.info(
    {
      withdrawalId: request.withdrawalId,
      symbol: request.symbol,
      amount: request.amount,
      toAddress: request.toAddress,
    },
    "Handling withdrawal request",
  );

  // Import withdrawal processor
  const { withdrawalProcessor } = await import("./services/withdrawal-processor.service");

  // Process through polygonmoneyflow API
  const result = await withdrawalProcessor.processWithdrawal({
    id: request.withdrawalId,
    symbol: request.symbol,
    network: "auto", // Will be normalized based on symbol
    amount: request.amount.toString(),
    address: request.toAddress,
    tag: null,
    created_at: new Date().toISOString(),
  });

  if (result.success && result.txHashes.length > 0) {
    return {
      txHash: result.txHashes[0], // Primary hash
      status: "processed",
    };
  } else {
    return {
      txHash: "",
      status: "failed",
    };
  }
}
