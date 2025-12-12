import Redis from "ioredis";
import { env } from "./config.ts";

// Redis client for job status and pub/sub
export const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD,
  db: env.REDIS_DB,
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false,
});

redis.on("connect", () => {
  console.log("✅ Redis connected");
});

redis.on("error", (err) => {
  console.error("❌ Redis error:", err);
});

// Close Redis connection
export const closeRedis = async (): Promise<void> => {
  await redis.quit();
  console.log("Redis connection closed");
};
