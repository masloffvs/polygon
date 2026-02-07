import { ChainAdapter } from "../common/chain-adapter";
import { createEvmAdapter } from "../common/evm";
import { ChainRpcConfig } from "../config";

export type BaseConfig = {
  rpc: ChainRpcConfig;
  chainId: number;
};

export const createBaseAdapter = (_config: BaseConfig): ChainAdapter => {
  return createEvmAdapter({
    chainName: "Base",
    chainId: _config.chainId,
    symbol: "ETH",
    rpc: _config.rpc,
    keyPrefix: "base"
  });
};
