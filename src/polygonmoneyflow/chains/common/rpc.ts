import { ChainRpcConfig } from "../config";

export const withRpcFallback = async <T>(
  rpc: ChainRpcConfig,
  fn: (endpoint: string) => Promise<T>
): Promise<T> => {
  const endpoints = [rpc.primary, ...(rpc.fallbacks ?? [])];
  let lastError: unknown;
  for (const endpoint of endpoints) {
    try {
      return await fn(endpoint);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error("All RPC endpoints failed");
};
