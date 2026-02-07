import { loadChainConfigs } from "../../chains/config";
import { ChainId } from "../../chains/common/chain-adapter";

const parseInstitutionalChains = (value?: string): ChainId[] => {
  const supported: ChainId[] = [
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
    "lightning"
  ];
  const normalized = (value ?? "solana")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  const allowed = normalized.filter((entry) => supported.includes(entry as ChainId));
  return allowed.length ? (allowed as ChainId[]) : ["solana"];
};

export type AppConfig = {
  port: number;
  logLevel: "info" | "debug" | "warn" | "error";
  chains: ReturnType<typeof loadChainConfigs>;
  institutional: {
    chains: ChainId[];
  };
};

export const loadConfig = (): AppConfig => ({
  port: Number(process.env.PORT ?? "3000"),
  logLevel: (process.env.LOG_LEVEL as AppConfig["logLevel"]) ?? "info",
  chains: loadChainConfigs(),
  institutional: {
    chains: parseInstitutionalChains(process.env.INSTITUTIONAL_CHAINS)
  }
});
