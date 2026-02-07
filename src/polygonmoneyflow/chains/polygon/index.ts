import { ChainAdapter } from "../common/chain-adapter";
import { createEvmAdapter } from "../common/evm";
import { ChainRpcConfig } from "../config";

export type PolygonConfig = {
  rpc: ChainRpcConfig;
  chainId: number;
};

export const createPolygonAdapter = (_config: PolygonConfig): ChainAdapter => {
  return createEvmAdapter({
    chainName: "Polygon",
    chainId: _config.chainId,
    symbol: "MATIC",
    rpc: _config.rpc,
    keyPrefix: "polygon"
  });
};
