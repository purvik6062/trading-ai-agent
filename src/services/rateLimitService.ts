import Redis from "ioredis";
import { logger } from "../utils/logger";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: Date;
  retryAfter?: number; // seconds until retry allowed
  totalHits: number;
}

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests in window
  keyPrefix?: string; // Redis key prefix
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export class RateLimitService {
  private redis: Redis;
  private static instance: RateLimitService;

  constructor(redisUrl?: string) {
    this.redis = new Redis(
      redisUrl || process.env.REDIS_URL || "redis://localhost:6379",
      {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        connectionName: "rate-limiter",
      }
    );

    this.redis.on("connect", () => {
      logger.info("✅ Connected to Redis for rate limiting");
    });

    this.redis.on("error", (error) => {
      logger.error("❌ Redis connection error:", error);
    });
  }

  static async initialize(redisUrl?: string): Promise<RateLimitService> {
    if (!RateLimitService.instance) {
      RateLimitService.instance = new RateLimitService(redisUrl);
      await RateLimitService.instance.redis.connect();
    }
    return RateLimitService.instance;
  }

  static getInstance(): RateLimitService {
    if (!RateLimitService.instance) {
      throw new Error(
        "RateLimitService not initialized. Call initialize() first."
      );
    }
    return RateLimitService.instance;
  }

  /**
   * Check and increment rate limit for a key using sliding window
   */
  async checkLimit(
    identifier: string,
    config: RateLimitConfig
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - config.windowMs;
    const key = `${config.keyPrefix || "ratelimit"}:${identifier}`;

    try {
      // Use sliding window with Redis sorted sets
      const pipeline = this.redis.pipeline();

      // Remove expired entries
      pipeline.zremrangebyscore(key, 0, windowStart);

      // Count current requests in window
      pipeline.zcard(key);

      // Add current request
      pipeline.zadd(key, now, `${now}-${Math.random()}`);

      // Set expiration for cleanup
      pipeline.expire(key, Math.ceil(config.windowMs / 1000));

      const results = await pipeline.exec();

      if (!results) {
        throw new Error("Redis pipeline failed");
      }

      const currentCount = (results[1][1] as number) + 1; // +1 for the request we just added
      const allowed = currentCount <= config.maxRequests;

      if (!allowed) {
        // Remove the request we just added since it's not allowed
        await this.redis.zrem(key, `${now}-${Math.random()}`);
      }

      const resetTime = new Date(now + config.windowMs);
      const remaining = Math.max(0, config.maxRequests - currentCount);
      const retryAfter = allowed
        ? undefined
        : Math.ceil(config.windowMs / 1000);

      return {
        allowed,
        remaining,
        resetTime,
        retryAfter,
        totalHits: currentCount,
      };
    } catch (error) {
      logger.error("❌ Rate limit check failed:", error);

      // Fail open - allow request if Redis is down
      return {
        allowed: true,
        remaining: config.maxRequests,
        resetTime: new Date(now + config.windowMs),
        totalHits: 0,
      };
    }
  }

  /**
   * Check rate limit with quota support (daily/monthly)
   */
  async checkQuotaLimit(
    identifier: string,
    quotaType: "daily" | "monthly",
    maxRequests: number
  ): Promise<RateLimitResult> {
    const now = new Date();
    let windowStart: Date;
    let windowMs: number;

    if (quotaType === "daily") {
      windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      windowMs = 24 * 60 * 60 * 1000; // 24 hours
    } else {
      windowStart = new Date(now.getFullYear(), now.getMonth(), 1);
      windowMs = 30 * 24 * 60 * 60 * 1000; // 30 days (approximate)
    }

    const key = `quota:${quotaType}:${identifier}`;
    const ttl = Math.ceil(
      (windowStart.getTime() + windowMs - now.getTime()) / 1000
    );

    try {
      const currentCount = await this.redis.incr(key);

      if (currentCount === 1) {
        // Set expiration only for new keys
        await this.redis.expire(key, ttl);
      }

      const allowed = currentCount <= maxRequests;
      const remaining = Math.max(0, maxRequests - currentCount);
      const resetTime = new Date(windowStart.getTime() + windowMs);

      if (!allowed) {
        // Decrement since we're not allowing this request
        await this.redis.decr(key);
      }

      return {
        allowed,
        remaining,
        resetTime,
        retryAfter: allowed ? undefined : ttl,
        totalHits: currentCount - (allowed ? 0 : 1),
      };
    } catch (error) {
      logger.error(`❌ ${quotaType} quota check failed:`, error);

      // Fail open
      return {
        allowed: true,
        remaining: maxRequests,
        resetTime: new Date(windowStart.getTime() + windowMs),
        totalHits: 0,
      };
    }
  }

  /**
   * Get current usage statistics for a key
   */
  async getUsageStats(
    identifier: string,
    config: RateLimitConfig
  ): Promise<{
    currentRequests: number;
    remaining: number;
    resetTime: Date;
    windowMs: number;
  }> {
    const now = Date.now();
    const windowStart = now - config.windowMs;
    const key = `${config.keyPrefix || "ratelimit"}:${identifier}`;

    try {
      // Clean up old entries and get count
      await this.redis.zremrangebyscore(key, 0, windowStart);
      const currentRequests = await this.redis.zcard(key);

      return {
        currentRequests,
        remaining: Math.max(0, config.maxRequests - currentRequests),
        resetTime: new Date(now + config.windowMs),
        windowMs: config.windowMs,
      };
    } catch (error) {
      logger.error("❌ Failed to get usage stats:", error);
      return {
        currentRequests: 0,
        remaining: config.maxRequests,
        resetTime: new Date(now + config.windowMs),
        windowMs: config.windowMs,
      };
    }
  }

  /**
   * Reset rate limit for a specific key (admin function)
   */
  async resetLimit(identifier: string, prefix?: string): Promise<void> {
    const key = `${prefix || "ratelimit"}:${identifier}`;

    try {
      await this.redis.del(key);
      logger.info("✅ Rate limit reset", { identifier, key });
    } catch (error) {
      logger.error("❌ Failed to reset rate limit:", error);
      throw error;
    }
  }

  /**
   * Get all active rate limit keys (for monitoring)
   */
  async getActiveKeys(prefix?: string): Promise<string[]> {
    const pattern = `${prefix || "ratelimit"}:*`;

    try {
      return await this.redis.keys(pattern);
    } catch (error) {
      logger.error("❌ Failed to get active keys:", error);
      return [];
    }
  }

  /**
   * Bulk operation to get usage stats for multiple identifiers
   */
  async getBulkUsageStats(
    identifiers: string[],
    config: RateLimitConfig
  ): Promise<
    Record<
      string,
      {
        currentRequests: number;
        remaining: number;
        resetTime: Date;
      }
    >
  > {
    const now = Date.now();
    const windowStart = now - config.windowMs;
    const results: Record<string, any> = {};

    if (identifiers.length === 0) return results;

    try {
      const pipeline = this.redis.pipeline();

      // Clean up and count for each identifier
      identifiers.forEach((identifier) => {
        const key = `${config.keyPrefix || "ratelimit"}:${identifier}`;
        pipeline.zremrangebyscore(key, 0, windowStart);
        pipeline.zcard(key);
      });

      const pipelineResults = await pipeline.exec();

      if (pipelineResults) {
        identifiers.forEach((identifier, index) => {
          const countResult = pipelineResults[index * 2 + 1]; // Every second result is the count
          const currentRequests = countResult ? (countResult[1] as number) : 0;

          results[identifier] = {
            currentRequests,
            remaining: Math.max(0, config.maxRequests - currentRequests),
            resetTime: new Date(now + config.windowMs),
          };
        });
      }

      return results;
    } catch (error) {
      logger.error("❌ Bulk usage stats failed:", error);

      // Return default values for all identifiers
      identifiers.forEach((identifier) => {
        results[identifier] = {
          currentRequests: 0,
          remaining: config.maxRequests,
          resetTime: new Date(now + config.windowMs),
        };
      });

      return results;
    }
  }

  /**
   * Health check for Redis connection
   */
  async healthCheck(): Promise<{ status: string; latency?: number }> {
    try {
      const start = Date.now();
      await this.redis.ping();
      const latency = Date.now() - start;

      return {
        status: "healthy",
        latency,
      };
    } catch (error) {
      logger.error("❌ Redis health check failed:", error);
      return {
        status: "unhealthy",
      };
    }
  }

  /**
   * Close Redis connection gracefully
   */
  async close(): Promise<void> {
    try {
      await this.redis.quit();
      logger.info("✅ Redis connection closed gracefully");
    } catch (error) {
      logger.error("❌ Error closing Redis connection:", error);
    }
  }
}
