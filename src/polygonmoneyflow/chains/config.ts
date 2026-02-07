import fs from "fs";
import path from "path";
import YAML from "yaml";
import { ChainId } from "./common/chain-adapter";

export type ChainRpcConfig = {
  primary: string;
  fallbacks?: string[];
  timeoutMs?: number;
};

export type ChainConfigs = Record<
  ChainId,
  {
    rpc: ChainRpcConfig;
    chainId?: number; // for EVM chains
    ss58Prefix?: number; // for Substrate chains
    tokenAddress?: string; // for token-focused adapters
  }
>;

export type NodeConfigFile = Partial<
  Record<
    ChainId,
    {
      primary: string;
      fallbacks?: string[];
      chainId?: number;
      timeoutMs?: number;
      ss58Prefix?: number;
      tokenAddress?: string;
    }
  >
>;

const DEFAULT_NODES_PATH = path.join(process.cwd(), "nodes.yml");

const readNodesFile = (): NodeConfigFile => {
  const filePath = process.env.NODES_FILE ?? DEFAULT_NODES_PATH;
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const content = fs.readFileSync(filePath, "utf-8");
  const parsed = YAML.parse(content) as NodeConfigFile;
  return parsed ?? {};
};

const mergeRpc = (base: ChainRpcConfig, override?: Partial<ChainRpcConfig>): ChainRpcConfig => ({
  primary: override?.primary ?? base.primary,
  fallbacks: override?.fallbacks ?? base.fallbacks,
  timeoutMs: override?.timeoutMs ?? base.timeoutMs
});

export const loadChainConfigs = (): ChainConfigs => {
  const fileConfig = readNodesFile();

  return {
    solana: {
      rpc: mergeRpc(
        {
          primary: process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com",
          timeoutMs: 8_000
        },
        fileConfig.solana
      )
    },
    eth: {
      rpc: mergeRpc(
        {
          primary: process.env.ETH_RPC_URL ?? "https://cloudflare-eth.com",
          timeoutMs: 8_000
        },
        fileConfig.eth
      ),
      chainId: fileConfig.eth?.chainId ?? Number(process.env.ETH_CHAIN_ID ?? "1")
    },
    base: {
      rpc: mergeRpc(
        {
          primary: process.env.BASE_RPC_URL ?? "https://mainnet.base.org",
          timeoutMs: 8_000
        },
        fileConfig.base
      ),
      chainId: fileConfig.base?.chainId ?? Number(process.env.BASE_CHAIN_ID ?? "8453")
    },
    polygon: {
      rpc: mergeRpc(
        {
          primary: process.env.POLYGON_RPC_URL ?? "https://polygon-rpc.com",
          timeoutMs: 8_000
        },
        fileConfig.polygon
      ),
      chainId: fileConfig.polygon?.chainId ?? Number(process.env.POLYGON_CHAIN_ID ?? "137")
    },
    trx: {
      rpc: mergeRpc(
        {
          primary: process.env.TRX_RPC_URL ?? "https://api.trongrid.io",
          timeoutMs: 8_000
        },
        fileConfig.trx
      )
    },
    xrp: {
      rpc: mergeRpc(
        {
          primary: process.env.XRP_RPC_URL ?? "https://xrplcluster.com",
          timeoutMs: 8_000
        },
        fileConfig.xrp
      )
    },
    polkadot: {
      rpc: mergeRpc(
        {
          primary: process.env.POLKADOT_RPC_URL ?? "wss://rpc.polkadot.io",
          timeoutMs: 8_000
        },
        fileConfig.polkadot
      ),
      ss58Prefix:
        fileConfig.polkadot?.ss58Prefix ?? Number(process.env.POLKADOT_SS58_PREFIX ?? "0")
    },
    ada: {
      rpc: mergeRpc(
        {
          primary: process.env.ADA_RPC_URL ?? "https://api.koios.rest/api/v1",
          timeoutMs: 8_000
        },
        fileConfig.ada
      )
    },
    atom: {
      rpc: mergeRpc(
        {
          primary: process.env.ATOM_RPC_URL ?? "https://rest.cosmos.network",
          timeoutMs: 8_000
        },
        fileConfig.atom
      )
    },
    link: {
      rpc: mergeRpc(
        {
          primary: process.env.LINK_RPC_URL ?? "https://cloudflare-eth.com",
          timeoutMs: 8_000
        },
        fileConfig.link
      ),
      chainId: fileConfig.link?.chainId ?? Number(process.env.LINK_CHAIN_ID ?? "1"),
      tokenAddress:
        fileConfig.link?.tokenAddress ??
        process.env.LINK_TOKEN_ADDRESS ??
        "0x514910771AF9Ca656af840dff83E8264EcF986CA"
    },
    bitcoin: {
      rpc: mergeRpc(
        {
          primary: process.env.BITCOIN_RPC_URL ?? "https://mempool.space/api",
          timeoutMs: 8_000
        },
        fileConfig.bitcoin
      )
    },
    lightning: {
      rpc: mergeRpc(
        {
          primary: process.env.LIGHTNING_RPC_URL ?? "https://mempool.space/api/v1/lightning",
          timeoutMs: 8_000
        },
        fileConfig.lightning
      )
    }
  };
};
