import fs from "fs/promises";
import path from "path";
import { logger } from "../src/infra/logger";
import { requirePostgres } from "../src/infra/postgres";

type WalletSecretRow = {
  wallet_id: string;
  chain: string;
  address: string;
  wallet: unknown;
  secrets: unknown;
  created_at: string;
  updated_at: string;
};

const pad = (value: number) => value.toString().padStart(2, "0");

const defaultOutputPath = () => {
  const now = new Date();
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours()
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return path.resolve("backups", `wallet-secrets-${stamp}.json`);
};

const parseOutputArg = (args: string[]): string | undefined => {
  const direct = args.find((arg) => arg.startsWith("--out="));
  if (direct) return direct.slice("--out=".length);
  const index = args.findIndex((arg) => arg === "--out" || arg === "-o");
  if (index !== -1 && args[index + 1]) return args[index + 1];
  return undefined;
};

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const outPath =
    parseOutputArg(args) ?? process.env.BACKUP_FILE ?? defaultOutputPath();
  const output = path.resolve(outPath);
  const client = await requirePostgres();
  const rows = await client<WalletSecretRow[]>`
    SELECT wallet_id, chain, address, wallet, secrets, created_at, updated_at
    FROM wallet_secrets
    ORDER BY created_at ASC
  `;
  const payload = {
    exportedAt: new Date().toISOString(),
    count: rows.length,
    items: rows
  };
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(payload, null, 2), "utf8");
  await client.end({ timeout: 5 });
  logger.info({ count: rows.length, file: output }, "wallet secrets backup written");
};

main().catch((err) => {
  logger.error({ err }, "wallet secrets backup failed");
  process.exit(1);
});
