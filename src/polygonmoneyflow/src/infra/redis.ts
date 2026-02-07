import { createClient } from "redis";
import { logger } from "./logger";

type RedisClient = ReturnType<typeof createClient>;

let clientPromise: Promise<RedisClient | null> | null = null;

const buildRedisUrl = () => {
  if (process.env.REDIS_URL) return process.env.REDIS_URL;
  const host = process.env.REDIS_HOST;
  const port = process.env.REDIS_PORT ?? "6379";
  if (!host) return undefined;
  const password = process.env.REDIS_PASSWORD;
  const auth = password ? `:${encodeURIComponent(password)}@` : "";
  return `redis://${auth}${host}:${port}`;
};

export const getRedis = async (): Promise<RedisClient | null> => {
  if (clientPromise) return clientPromise;
  if (process.env.REDIS_DISABLED === "true") {
    clientPromise = Promise.resolve(null);
    return clientPromise;
  }
  const url = buildRedisUrl();
  if (!url) {
    clientPromise = Promise.resolve(null);
    return clientPromise;
  }
  clientPromise = (async () => {
    try {
      const client = createClient({ url });
      client.on("error", (err) => {
        logger.warn({ err }, "redis connection error");
      });
      await client.connect();
      return client;
    } catch (err) {
      logger.warn({ err }, "redis unavailable, using memory store");
      return null;
    }
  })();
  return clientPromise;
};
