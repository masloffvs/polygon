import cors from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { Elysia, t } from "elysia";
import { ChainId } from "../chains/common/chain-adapter";
import { loadConfig } from "./infra/config";
import { logger } from "./infra/logger";
import { createIncomingService } from "./services/incoming";
import { createWalletService } from "./services/wallet";
import { AppError, BadRequestError } from "./utils/errors";

const config = loadConfig();
const walletService = createWalletService(config);
const incomingService = createIncomingService();
const supportedChains: ChainId[] = [
  "solana",
  "eth",
  "base",
  "polygon",
  "trx",
  "xrp",
  "polkadot",
  "ada",
  "atom",
  "link",
  "bitcoin",
  "lightning",
];
const chainSchema = t.Union([
  t.Literal("solana"),
  t.Literal("eth"),
  t.Literal("base"),
  t.Literal("polygon"),
  t.Literal("trx"),
  t.Literal("xrp"),
  t.Literal("polkadot"),
  t.Literal("ada"),
  t.Literal("atom"),
  t.Literal("link"),
  t.Literal("bitcoin"),
  t.Literal("lightning"),
]);
const errorResponseSchema = t.Object({
  error: t.String(),
  status: t.Number(),
});
const walletSchema = t.Object({
  id: t.String(),
  address: t.String(),
  chain: chainSchema,
  label: t.Optional(t.String()),
  createdAt: t.Optional(t.String()),
  walletVirtualOwner: t.Optional(t.String()),
  meta: t.Optional(t.Record(t.String(), t.Unknown())),
});
const institutionalWalletCreateSchema = t.Object({
  chain: chainSchema,
  label: t.Optional(t.String()),
  assets: t.Optional(t.Array(t.String())),
});
const balanceSchema = t.Object({
  amount: t.String(),
  decimals: t.Number(),
  symbol: t.String(),
});
const sendResultSchema = t.Object({
  txnId: t.String(),
  txHash: t.Optional(t.String()),
  status: t.Union([
    t.Literal("pending"),
    t.Literal("confirmed"),
    t.Literal("failed"),
    t.Literal("unknown"),
  ]),
});
const refinanceTransferItemSchema = t.Object({
  walletId: t.String(),
  fromAddress: t.String(),
  amount: t.String(),
  feeReserved: t.String(),
  feeCurrency: t.String(),
  txnId: t.String(),
  txHash: t.Optional(t.String()),
  status: t.Union([
    t.Literal("pending"),
    t.Literal("confirmed"),
    t.Literal("failed"),
    t.Literal("unknown"),
  ]),
});
const refinanceTransferResultSchema = t.Object({
  chain: chainSchema,
  asset: t.Optional(t.String()),
  to: t.String(),
  requestedAmount: t.String(),
  transferredAmount: t.String(),
  remainingAmount: t.String(),
  allowSplit: t.Boolean(),
  transfers: t.Array(refinanceTransferItemSchema),
  txHashes: t.Array(t.String()),
  walletsConsidered: t.Number(),
  walletsWithHistory: t.Number(),
  walletsWithLiquidity: t.Number(),
});
const reindexBalanceTargetSchema = t.Object({
  chain: chainSchema,
  idOrAddress: t.String(),
  asset: t.Optional(t.String()),
});
const reindexBalanceItemSchema = t.Object({
  chain: chainSchema,
  idOrAddress: t.String(),
  walletId: t.Optional(t.String()),
  address: t.Optional(t.String()),
  asset: t.Optional(t.String()),
  balance: t.Optional(balanceSchema),
  cachedAt: t.Optional(t.String()),
  status: t.Union([t.Literal("ok"), t.Literal("error")]),
  error: t.Optional(t.String()),
});
const reindexBalanceResultSchema = t.Object({
  items: t.Array(reindexBalanceItemSchema),
  total: t.Number(),
  success: t.Number(),
  failed: t.Number(),
});
const txStatusSchema = t.Object({
  txnId: t.String(),
  status: t.Union([
    t.Literal("pending"),
    t.Literal("confirmed"),
    t.Literal("failed"),
    t.Literal("unknown"),
  ]),
  txHash: t.Optional(t.String()),
  error: t.Optional(t.String()),
});
const incomingTxSchema = t.Object({
  id: t.String(),
  chain: chainSchema,
  address: t.String(),
  amount: t.String(),
  asset: t.String(),
  status: t.Union([
    t.Literal("pending"),
    t.Literal("confirmed"),
    t.Literal("failed"),
    t.Literal("unknown"),
  ]),
  walletId: t.Optional(t.String()),
  walletVirtualOwner: t.Optional(t.String()),
  txHash: t.Optional(t.String()),
  from: t.Optional(t.String()),
  blockNumber: t.Optional(t.Number()),
  timestamp: t.Optional(t.String()),
});
const virtualOwnedWalletSchema = t.Object({
  id: t.String(),
  address: t.String(),
  chain: chainSchema,
  label: t.Optional(t.String()),
  createdAt: t.Optional(t.String()),
  walletVirtualOwner: t.Optional(t.String()),
  meta: t.Optional(t.Record(t.String(), t.Unknown())),
  created: t.Boolean(),
});
const capabilityStatusSchema = t.Union([
  t.Literal("full"),
  t.Literal("partial"),
  t.Literal("placeholder"),
  t.Literal("not_implemented"),
]);
const probeCheckSchema = t.Union([
  t.Literal("ok"),
  t.Literal("failed"),
  t.Literal("skipped"),
]);
const chainStatusSchema = t.Object({
  chain: chainSchema,
  mode: t.Union([t.Literal("full"), t.Literal("partial"), t.Literal("placeholder")]),
  institutionalEnabled: t.Boolean(),
  rpc: t.Object({
    primary: t.String(),
    fallbacks: t.Number(),
    timeoutMs: t.Number(),
  }),
  capabilities: t.Object({
    createWallet: capabilityStatusSchema,
    getBalance: capabilityStatusSchema,
    estimateFee: capabilityStatusSchema,
    sendTransaction: capabilityStatusSchema,
    getStatus: capabilityStatusSchema,
    incomingMonitoring: capabilityStatusSchema,
  }),
  limitations: t.Array(t.String()),
  live: t.Object({
    status: t.Union([
      t.Literal("healthy"),
      t.Literal("degraded"),
      t.Literal("down"),
      t.Literal("unknown"),
    ]),
    latencyMs: t.Optional(t.Number()),
    checks: t.Object({
      createWallet: probeCheckSchema,
      getBalance: probeCheckSchema,
      estimateFee: probeCheckSchema,
    }),
    error: t.Optional(t.String()),
  }),
});

const parseChain = (chain?: string): ChainId => {
  if (!chain || !supportedChains.includes(chain as ChainId)) {
    throw new BadRequestError(`Unsupported chain: ${chain ?? "missing"}`);
  }
  return chain as ChainId;
};

const handleVirtualOwnedCreate = async ({ body }: { body: unknown }) => {
  const { owner, chains } = body as { owner?: string; chains?: ChainId[] };
  if (!owner) throw new BadRequestError("owner is required");
  const targetChains = (chains && chains.length ? chains : supportedChains).map(
    (chain) => parseChain(chain),
  );
  return walletService.createVirtualOwnedWallets(owner, targetChains);
};

const handleRefinanceTransfer = async ({ body }: { body: unknown }) => {
  const { chain, to, amount, allowSplit, asset } = body as {
    chain?: string;
    to?: string;
    amount?: string;
    allowSplit?: boolean;
    asset?: string;
  };
  const parsedChain = parseChain(chain);
  if (!to || !amount) {
    throw new BadRequestError("to and amount are required");
  }
  return walletService.refinanceTransfer(parsedChain, {
    to,
    amount,
    allowSplit,
    asset,
  });
};

const handleReindexBalances = async ({ body }: { body: unknown }) => {
  const { wallets } = body as {
    wallets?: Array<{ chain?: string; idOrAddress?: string; asset?: string }>;
  };
  if (!Array.isArray(wallets) || wallets.length === 0) {
    throw new BadRequestError("wallets array is required");
  }
  return walletService.reindexBalances({
    wallets: wallets.map((item) => {
      const chain = parseChain(item.chain);
      const idOrAddress = item.idOrAddress?.trim();
      if (!idOrAddress) throw new BadRequestError("idOrAddress is required");
      return {
        chain,
        idOrAddress,
        asset: item.asset,
      };
    }),
  });
};

const app = new Elysia({ serve: { reusePort: true } })
  .use(cors())
  .use(
    openapi({
      path: "/docs",
      documentation: {
        info: {
          title: "Wallet Gateway",
          version: "0.1.0",
        },
      },
    }),
  )
  .get("/health", () => ({ status: "ok", uptime: process.uptime() }), {
    response: {
      200: t.Object({
        status: t.String(),
        uptime: t.Number(),
      }),
    },
    detail: {
      summary: "Health check",
      tags: ["System"],
    },
  })
  .get(
    "/chains/status",
    async ({ query }) => {
      const { live, timeoutMs } = query as {
        live?: string;
        timeoutMs?: string | number;
      };
      const includeLive = (live ?? "true").toLowerCase() !== "false";
      const parsedTimeout =
        timeoutMs !== undefined && timeoutMs !== null && timeoutMs !== ""
          ? Number(timeoutMs)
          : undefined;

      return walletService.getChainsStatus({
        includeLive,
        timeoutMs: Number.isNaN(parsedTimeout) ? undefined : parsedTimeout,
      });
    },
    {
      query: t.Object({
        live: t.Optional(t.String()),
        timeoutMs: t.Optional(t.String()),
      }),
      response: {
        200: t.Array(chainStatusSchema),
        400: errorResponseSchema,
        500: errorResponseSchema,
      },
      detail: {
        summary: "List chain statuses and implemented capabilities",
        tags: ["System"],
      },
    },
  )
  .post(
    "/wallets",
    async ({ body }) => {
      const { chain, label } = body as { chain?: string; label?: string };
      const parsedChain = parseChain(chain);
      return walletService.createWallet(parsedChain, label);
    },
    {
      body: t.Object({
        chain: chainSchema,
        label: t.Optional(t.String()),
      }),
      response: {
        200: walletSchema,
        400: errorResponseSchema,
        500: errorResponseSchema,
      },
      detail: {
        summary: "Create wallet",
        tags: ["Wallets"],
      },
    },
  )
  .get(
    "/wallets",
    async ({ query }) => {
      const { chain, address, label, walletVirtualOwner, limit, offset } =
        query as {
          chain?: string;
          address?: string;
          label?: string;
          walletVirtualOwner?: string;
          limit?: string | number;
          offset?: string | number;
        };
      const parsedChain = chain ? parseChain(chain) : undefined;
      const parsedLimit =
        limit !== undefined && limit !== null && limit !== ""
          ? Number(limit)
          : undefined;
      const parsedOffset =
        offset !== undefined && offset !== null && offset !== ""
          ? Number(offset)
          : undefined;
      return walletService.listWallets({
        chain: parsedChain,
        address,
        label,
        walletVirtualOwner,
        limit: Number.isNaN(parsedLimit) ? undefined : parsedLimit,
        offset: Number.isNaN(parsedOffset) ? undefined : parsedOffset,
      });
    },
    {
      query: t.Object({
        chain: t.Optional(chainSchema),
        address: t.Optional(t.String()),
        label: t.Optional(t.String()),
        walletVirtualOwner: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        offset: t.Optional(t.String()),
      }),
      response: {
        200: t.Object({
          items: t.Array(walletSchema),
          total: t.Number(),
          limit: t.Number(),
          offset: t.Number(),
        }),
        400: errorResponseSchema,
        500: errorResponseSchema,
      },
      detail: {
        summary: "List wallets",
        tags: ["Wallets"],
      },
    },
  )
  .post(
    "/institutional/wallets",
    async ({ body }) => {
      const { chain, label, assets } = body as {
        chain?: string;
        label?: string;
        assets?: string[];
      };
      const parsedChain = parseChain(chain);
      return walletService.createInstitutionalWallet(parsedChain, label, assets);
    },
    {
      body: institutionalWalletCreateSchema,
      response: {
        200: walletSchema,
        400: errorResponseSchema,
        500: errorResponseSchema,
      },
      detail: {
        summary: "Create institutional wallet",
        tags: ["Institutional"],
      },
    },
  )
  .get(
    "/institutional/wallets",
    async ({ query }) => {
      const { chain, address, label, limit, offset } = query as {
        chain?: string;
        address?: string;
        label?: string;
        limit?: string | number;
        offset?: string | number;
      };
      const parsedChain = chain ? parseChain(chain) : undefined;
      const parsedLimit =
        limit !== undefined && limit !== null && limit !== ""
          ? Number(limit)
          : undefined;
      const parsedOffset =
        offset !== undefined && offset !== null && offset !== ""
          ? Number(offset)
          : undefined;
      return walletService.listInstitutionalWallets({
        chain: parsedChain,
        address,
        label,
        limit: Number.isNaN(parsedLimit) ? undefined : parsedLimit,
        offset: Number.isNaN(parsedOffset) ? undefined : parsedOffset,
      });
    },
    {
      query: t.Object({
        chain: t.Optional(chainSchema),
        address: t.Optional(t.String()),
        label: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        offset: t.Optional(t.String()),
      }),
      response: {
        200: t.Object({
          items: t.Array(walletSchema),
          total: t.Number(),
          limit: t.Number(),
          offset: t.Number(),
        }),
        400: errorResponseSchema,
        500: errorResponseSchema,
      },
      detail: {
        summary: "List institutional wallets",
        tags: ["Institutional"],
      },
    },
  )
  .post("/virtualOwned/wallets/create", handleVirtualOwnedCreate, {
    body: t.Object({
      owner: t.String(),
      chains: t.Optional(t.Array(chainSchema)),
    }),
    response: {
      200: t.Object({
        owner: t.String(),
        wallets: t.Array(virtualOwnedWalletSchema),
      }),
      400: errorResponseSchema,
      500: errorResponseSchema,
    },
    detail: {
      summary: "Create or fetch virtual-owned wallets",
      tags: ["Wallets"],
    },
  })
  .post("/virualOwned/wallets/create", handleVirtualOwnedCreate, {
    body: t.Object({
      owner: t.String(),
      chains: t.Optional(t.Array(chainSchema)),
    }),
    response: {
      200: t.Object({
        owner: t.String(),
        wallets: t.Array(virtualOwnedWalletSchema),
      }),
      400: errorResponseSchema,
      500: errorResponseSchema,
    },
    detail: {
      summary: "Create or fetch virtual-owned wallets (alias)",
      tags: ["Wallets"],
    },
  })
  .get(
    "/virtualOwned/transactions/incoming",
    async ({ query }) => {
      const { owner, limit } = query as {
        owner?: string;
        limit?: string | number;
      };
      if (!owner) throw new BadRequestError("owner is required");
      const parsedLimit =
        limit !== undefined && limit !== null && limit !== ""
          ? Number(limit)
          : undefined;
      return incomingService.listIncomingByOwner(
        owner,
        Number.isNaN(parsedLimit) ? undefined : parsedLimit,
      );
    },
    {
      query: t.Object({
        owner: t.String(),
        limit: t.Optional(t.String()),
      }),
      response: {
        200: t.Array(incomingTxSchema),
        400: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema,
      },
      detail: {
        summary: "List incoming transactions for owner",
        tags: ["Transactions"],
      },
    },
  )
  .get(
    "/virualOwned/transactions/incoming",
    async ({ query }) => {
      const { owner, limit } = query as {
        owner?: string;
        limit?: string | number;
      };
      if (!owner) throw new BadRequestError("owner is required");
      const parsedLimit =
        limit !== undefined && limit !== null && limit !== ""
          ? Number(limit)
          : undefined;
      return incomingService.listIncomingByOwner(
        owner,
        Number.isNaN(parsedLimit) ? undefined : parsedLimit,
      );
    },
    {
      query: t.Object({
        owner: t.String(),
        limit: t.Optional(t.String()),
      }),
      response: {
        200: t.Array(incomingTxSchema),
        400: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema,
      },
      detail: {
        summary: "List incoming transactions for owner (alias)",
        tags: ["Transactions"],
      },
    },
  )
  .get(
    "/wallets/:chain/:idOrAddress/balance",
    async ({ params, query }) => {
      const parsedChain = parseChain(params.chain);
      const asset = (query?.asset as string | undefined) ?? undefined;
      return walletService.getBalance(parsedChain, params.idOrAddress, asset);
    },
    {
      params: t.Object({
        chain: chainSchema,
        idOrAddress: t.String(),
      }),
      query: t.Object({
        asset: t.Optional(t.String()),
      }),
      response: {
        200: balanceSchema,
        400: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema,
      },
      detail: {
        summary: "Get wallet balance",
        tags: ["Wallets"],
      },
    },
  )
  .post("/balances/reindex", handleReindexBalances, {
    body: t.Object({
      wallets: t.Array(reindexBalanceTargetSchema),
    }),
    response: {
      200: reindexBalanceResultSchema,
      400: errorResponseSchema,
      500: errorResponseSchema,
    },
    detail: {
      summary: "Reindex balances and refresh cache for selected wallets",
      tags: ["Wallets"],
    },
  })
  .post("/reindexBalances", handleReindexBalances, {
    body: t.Object({
      wallets: t.Array(reindexBalanceTargetSchema),
    }),
    response: {
      200: reindexBalanceResultSchema,
      400: errorResponseSchema,
      500: errorResponseSchema,
    },
    detail: {
      summary: "Reindex balances and refresh cache for selected wallets (alias)",
      tags: ["Wallets"],
    },
  })
  .post(
    "/transactions",
    async ({ body }) => {
      const {
        chain,
        fromWalletId,
        fromAddress,
        fromPrivateKey,
        to,
        amount,
        asset,
        rawTx,
        clientTxnId,
      } = body as Record<string, string | undefined>;
      const parsedChain = parseChain(chain);
      const hasRawTx = Boolean(rawTx?.trim());
      if (!hasRawTx && (!to || !amount)) {
        throw new BadRequestError("to and amount are required unless rawTx is provided");
      }
      if (!fromWalletId && !fromAddress && !rawTx) {
        throw new BadRequestError("fromWalletId or fromAddress is required");
      }
      return walletService.sendTransaction(parsedChain, {
        walletId: fromWalletId,
        address: fromAddress,
        to: to ?? "",
        amount: amount ?? "0",
        asset,
        rawTx,
        clientTxnId,
        secrets: fromPrivateKey ? { privateKey: fromPrivateKey } : undefined,
      });
    },
    {
      body: t.Object({
        chain: chainSchema,
        fromWalletId: t.Optional(t.String()),
        fromAddress: t.Optional(t.String()),
        fromPrivateKey: t.Optional(t.String()),
        to: t.Optional(t.String()),
        amount: t.Optional(t.String()),
        asset: t.Optional(t.String()),
        rawTx: t.Optional(t.String()),
        clientTxnId: t.Optional(t.String()),
      }),
      response: {
        200: sendResultSchema,
        400: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema,
      },
      detail: {
        summary: "Send transaction",
        tags: ["Transactions"],
      },
    },
  )
  .post(
    "/transactions/refinanceTransfer",
    handleRefinanceTransfer,
    {
      body: t.Object({
        chain: chainSchema,
        to: t.String(),
        amount: t.String(),
        allowSplit: t.Optional(t.Boolean()),
        asset: t.Optional(t.String()),
      }),
      response: {
        200: refinanceTransferResultSchema,
        400: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema,
      },
      detail: {
        summary: "Refinance transfer from funded wallets",
        tags: ["Transactions"],
      },
    },
  )
  .post(
    "/transactions/refinance",
    handleRefinanceTransfer,
    {
      body: t.Object({
        chain: chainSchema,
        to: t.String(),
        amount: t.String(),
        allowSplit: t.Optional(t.Boolean()),
        asset: t.Optional(t.String()),
      }),
      response: {
        200: refinanceTransferResultSchema,
        400: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema,
      },
      detail: {
        summary: "Refinance transfer from funded wallets (alias)",
        tags: ["Transactions"],
      },
    },
  )
  .get(
    "/transactions/:chain/:txnId",
    async ({ params }) => {
      const parsedChain = parseChain(params.chain);
      return walletService.getStatus(parsedChain, params.txnId);
    },
    {
      params: t.Object({
        chain: chainSchema,
        txnId: t.String(),
      }),
      response: {
        200: txStatusSchema,
        400: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema,
      },
      detail: {
        summary: "Get transaction status",
        tags: ["Transactions"],
      },
    },
  )
  .get(
    "/transactions/incoming",
    async ({ query }) => {
      const { chain, walletId, address, limit } = query as {
        chain?: string;
        walletId?: string;
        address?: string;
        limit?: string | number;
      };
      const parsedChain = chain ? parseChain(chain) : undefined;
      const parsedLimit =
        limit !== undefined && limit !== null && limit !== ""
          ? Number(limit)
          : undefined;
      return incomingService.listIncoming({
        chain: parsedChain,
        walletId,
        address,
        limit: Number.isNaN(parsedLimit) ? undefined : parsedLimit,
      });
    },
    {
      query: t.Object({
        chain: t.Optional(chainSchema),
        walletId: t.Optional(t.String()),
        address: t.Optional(t.String()),
        limit: t.Optional(t.String()),
      }),
      response: {
        200: t.Array(incomingTxSchema),
        400: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema,
      },
      detail: {
        summary: "List incoming transactions",
        tags: ["Transactions"],
      },
    },
  )
  .onError(({ error, set }) => {
    const status = error instanceof AppError ? error.status : 500;
    set.status = status;
    logger.error({ err: error }, "request failed");
    return { error: error.message, status };
  });

const start = (): typeof app => {
  const server = app.listen(config.port);
  const bunServer = server.server ?? undefined;
  const addressProp = (bunServer as { address?: unknown } | undefined)?.address;
  const addressInfo =
    typeof addressProp === "function"
      ? (addressProp as () => unknown)()
      : addressProp;

  if (typeof addressInfo === "string") {
    logger.info({ address: addressInfo }, "wallet gateway started");
  } else if (addressInfo && typeof addressInfo === "object") {
    logger.info(
      { port: addressInfo.port, address: addressInfo.address },
      "wallet gateway started",
    );
  } else if (bunServer && "port" in bunServer) {
    const hostname = (bunServer as { hostname?: string }).hostname;
    const url = (bunServer as { url?: string }).url;
    const port = (bunServer as { port?: number }).port;
    logger.info({ port, address: hostname ?? url }, "wallet gateway started");
  } else {
    logger.info({ port: config.port }, "wallet gateway started");
  }

  return server;
};

if (import.meta.main) {
  start();
}

export type AppServer = ReturnType<typeof start>;
export { app, start };
