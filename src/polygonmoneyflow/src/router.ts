import { AppConfig } from "./infra/config";
import { NotImplementedError } from "./utils/errors";
import { ChainAdapter, ChainId } from "../chains/common/chain-adapter";
import { createBaseAdapter } from "../chains/base";
import { createEthAdapter } from "../chains/eth";
import { createPolygonAdapter } from "../chains/polygon";
import { createSolanaAdapter } from "../chains/solana";
import { createTrxAdapter } from "../chains/trx";
import { createXrpAdapter } from "../chains/xrp";
import { createPolkadotAdapter } from "../chains/polkadot";
import { createAdaAdapter } from "../chains/ada";
import { createAtomAdapter } from "../chains/atom";
import { createLinkAdapter } from "../chains/link";
import { createBitcoinAdapter } from "../chains/bitcoin";
import { createLightningAdapter } from "../chains/lightning";

export const createChainRouter = (chainConfig: AppConfig["chains"]) => {
  const adapters: Record<ChainId, ChainAdapter> = {
    solana: createSolanaAdapter(chainConfig.solana),
    eth: createEthAdapter({
      rpc: chainConfig.eth.rpc,
      chainId: chainConfig.eth.chainId ?? 1
    }),
    base: createBaseAdapter({
      rpc: chainConfig.base.rpc,
      chainId: chainConfig.base.chainId ?? 8453
    }),
    polygon: createPolygonAdapter({
      rpc: chainConfig.polygon.rpc,
      chainId: chainConfig.polygon.chainId ?? 137
    }),
    trx: createTrxAdapter(chainConfig.trx),
    xrp: createXrpAdapter(chainConfig.xrp),
    polkadot: createPolkadotAdapter(chainConfig.polkadot),
    ada: createAdaAdapter(chainConfig.ada),
    atom: createAtomAdapter(chainConfig.atom),
    link: createLinkAdapter({
      rpc: chainConfig.link.rpc,
      chainId: chainConfig.link.chainId ?? 1,
      tokenAddress: chainConfig.link.tokenAddress
    }),
    bitcoin: createBitcoinAdapter(chainConfig.bitcoin),
    lightning: createLightningAdapter(chainConfig.lightning)
  };

  const get = (chain: ChainId): ChainAdapter => {
    const adapter = adapters[chain];
    if (!adapter) {
      throw new NotImplementedError(`Chain ${chain} is not supported`);
    }
    return adapter;
  };

  return { get };
};
