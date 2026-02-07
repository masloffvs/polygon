import { ChainAdapter } from "../common/chain-adapter";
import { createEvmAdapter } from "../common/evm";
import { ChainRpcConfig } from "../config";

export type EthConfig = {
  rpc: ChainRpcConfig;
  chainId: number;
};

export const createEthAdapter = (_config: EthConfig): ChainAdapter => {
  return createEvmAdapter({
    chainName: "Ethereum",
    chainId: _config.chainId,
    symbol: "ETH",
    rpc: _config.rpc,
    keyPrefix: "eth"
  });
};
