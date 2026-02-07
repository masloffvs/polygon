import Redis from "ioredis";
import { logger } from "./logger";

const REDIS_URL = process.env.REDIS_URL || "redis://redis:6379";

let redis: Redis | null = null;

export const getRedis = (): Redis => {
	if (!redis) {
		logger.info({ url: REDIS_URL }, "Initializing Redis client...");
		redis = new Redis(REDIS_URL, {
			retryStrategy: (times) => {
				const delay = Math.min(times * 50, 2000);
				return delay;
			},
			reconnectOnError: (err) => {
				const targetError = "READONLY";
				if (err.message.includes(targetError)) {
					// Only reconnect when the error starts with "READONLY"
					return true;
				}
				return false;
			},
		});

		redis.on("error", (err) => {
			logger.error({ err }, "Redis Client Error");
		});

		redis.on("connect", () => {
			logger.info("Redis Client Connected");
		});
	}
	return redis;
};
