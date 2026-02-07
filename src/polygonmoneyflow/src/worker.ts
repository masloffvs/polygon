import { loadConfig } from "./infra/config";
import { logger } from "./infra/logger";
import { startMonitoring } from "./services/monitoring";

const config = loadConfig();

const main = async () => {
  logger.info({ chains: Object.keys(config.chains) }, "worker booted");
  startMonitoring(config);
  setInterval(() => {
    logger.debug("worker heartbeat");
  }, 15_000);
};

main().catch((err) => {
  logger.error({ err }, "worker crashed");
  process.exit(1);
});
