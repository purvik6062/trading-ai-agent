import { MongoClient, Db, Collection, ObjectId } from "mongodb";
import { createHash, randomBytes } from "crypto";
import { logger } from "../utils/logger";

export enum ApiKeyStatus {
  ACTIVE = "active",
  SUSPENDED = "suspended",
  EXPIRED = "expired",
  REVOKED = "revoked",
}

export enum ApiKeyType {
  ADMIN = "admin",
  TRADING = "trading",
  READ_ONLY = "read_only",
  WEBHOOK = "webhook",
  INTEGRATION = "integration",
}

export interface ApiKeyDocument {
  _id?: ObjectId;
  keyId: string; // Unique identifier (not the actual key)
  hashedKey: string; // SHA-256 hashed API key
  name: string; // Human-readable name
  description?: string; // Optional description
  type: ApiKeyType; // Key type/role
  status: ApiKeyStatus; // Current status
  permissions: string[]; // Array of permissions

  // User/Owner information
  userId?: string; // Associated user ID
  createdBy: string; // Who created this key

  // Rate limiting & quotas
  rateLimit: {
    windowMs: number; // Time window in milliseconds
    maxRequests: number; // Max requests per window
    currentUsage?: number; // Current usage (reset each window)
    windowStart?: Date; // When current window started
  };

  // Usage quotas
  quotas: {
    daily?: number; // Daily request limit
    monthly?: number; // Monthly request limit
    totalRequests?: number; // Lifetime request limit
  };

  // Tracking
  usage: {
    totalRequests: number; // Total requests made
    lastUsed?: Date; // Last time key was used
    lastUsedIP?: string; // Last IP address used
    dailyUsage: number; // Today's usage count
    monthlyUsage: number; // This month's usage
    usageResetDate: Date; // When daily/monthly counters reset
  };

  // Security
  ipWhitelist?: string[]; // Allowed IP addresses (optional)
  allowedOrigins?: string[]; // Allowed origins for CORS

  // Lifecycle
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date; // Optional expiration date
  lastRotated?: Date; // When key was last rotated

  // Audit trail
  auditLog: Array<{
    action: string; // Action performed
    timestamp: Date; // When it happened
    actor: string; // Who performed the action
    details?: any; // Additional details
    ip?: string; // IP address of actor
  }>;
}

export class ApiKeyManager {
  private db: Db;
  private collection: Collection<ApiKeyDocument>;
  private static instance: ApiKeyManager;

  constructor(db: Db) {
    this.db = db;
    this.collection = db.collection<ApiKeyDocument>("api_keys");
    this.setupIndexes();
  }

  static async initialize(
    mongoUri: string,
    dbName: string
  ): Promise<ApiKeyManager> {
    if (!ApiKeyManager.instance) {
      const client = new MongoClient(mongoUri);
      await client.connect();
      const db = client.db(dbName);
      ApiKeyManager.instance = new ApiKeyManager(db);
      logger.info("✅ ApiKeyManager initialized with MongoDB");
    }
    return ApiKeyManager.instance;
  }

  static getInstance(): ApiKeyManager {
    if (!ApiKeyManager.instance) {
      throw new Error(
        "ApiKeyManager not initialized. Call initialize() first."
      );
    }
    return ApiKeyManager.instance;
  }

  private async setupIndexes(): Promise<void> {
    try {
      // Index for fast key lookup
      await this.collection.createIndex({ hashedKey: 1 }, { unique: true });

      // Index for user queries
      await this.collection.createIndex({ userId: 1 });
      await this.collection.createIndex({ createdBy: 1 });

      // Index for status and type queries
      await this.collection.createIndex({ status: 1 });
      await this.collection.createIndex({ type: 1 });

      // Index for expiration cleanup
      await this.collection.createIndex(
        { expiresAt: 1 },
        {
          expireAfterSeconds: 0,
          partialFilterExpression: { expiresAt: { $exists: true } },
        }
      );

      // Compound index for active keys
      await this.collection.createIndex({
        status: 1,
        type: 1,
        hashedKey: 1,
      });

      logger.info("✅ API key database indexes created");
    } catch (error) {
      logger.error("❌ Failed to create database indexes:", error);
    }
  }

  /**
   * Generate a new API key with the specified configuration
   */
  async generateApiKey(config: {
    name: string;
    description?: string;
    type: ApiKeyType;
    permissions: string[];
    createdBy: string;
    userId?: string;
    expiresAt?: Date;
    rateLimit?: {
      windowMs: number;
      maxRequests: number;
    };
    quotas?: {
      daily?: number;
      monthly?: number;
      totalRequests?: number;
    };
    ipWhitelist?: string[];
    allowedOrigins?: string[];
  }): Promise<{ keyId: string; apiKey: string; document: ApiKeyDocument }> {
    // Generate secure API key
    const keyPrefix = config.type.toLowerCase();
    const timestamp = Date.now().toString(36);
    const randomPart = randomBytes(32).toString("hex");
    const apiKey = `${keyPrefix}_${timestamp}_${randomPart}`;

    // Generate unique key ID
    const keyId = randomBytes(16).toString("hex");

    // Hash the API key for storage
    const hashedKey = this.hashKey(apiKey);

    const now = new Date();
    const document: ApiKeyDocument = {
      keyId,
      hashedKey,
      name: config.name,
      description: config.description,
      type: config.type,
      status: ApiKeyStatus.ACTIVE,
      permissions: config.permissions,
      userId: config.userId,
      createdBy: config.createdBy,

      rateLimit: config.rateLimit || {
        windowMs: 15 * 60 * 1000, // 15 minutes default
        maxRequests: this.getDefaultRateLimit(config.type),
        currentUsage: 0,
        windowStart: now,
      },

      quotas: config.quotas || {},

      usage: {
        totalRequests: 0,
        dailyUsage: 0,
        monthlyUsage: 0,
        usageResetDate: now,
      },

      ipWhitelist: config.ipWhitelist,
      allowedOrigins: config.allowedOrigins,

      createdAt: now,
      updatedAt: now,
      expiresAt: config.expiresAt,

      auditLog: [
        {
          action: "key_created",
          timestamp: now,
          actor: config.createdBy,
          details: { type: config.type, permissions: config.permissions },
        },
      ],
    };

    try {
      await this.collection.insertOne(document);

      logger.info("✅ New API key created", {
        keyId,
        type: config.type,
        createdBy: config.createdBy,
        permissions: config.permissions,
      });

      return { keyId, apiKey, document };
    } catch (error) {
      logger.error("❌ Failed to create API key:", error);
      throw new Error("Failed to create API key");
    }
  }

  /**
   * Validate an API key and return its configuration
   */
  async validateKey(
    apiKey: string,
    clientIP?: string
  ): Promise<ApiKeyDocument | null> {
    const hashedKey = this.hashKey(apiKey);

    try {
      const keyDoc = await this.collection.findOne({
        hashedKey,
        status: ApiKeyStatus.ACTIVE,
      });

      if (!keyDoc) {
        return null;
      }

      // Check expiration
      if (keyDoc.expiresAt && keyDoc.expiresAt < new Date()) {
        await this.updateKeyStatus(
          keyDoc.keyId,
          ApiKeyStatus.EXPIRED,
          "system"
        );
        return null;
      }

      // Check IP whitelist
      if (keyDoc.ipWhitelist && keyDoc.ipWhitelist.length > 0 && clientIP) {
        if (!keyDoc.ipWhitelist.includes(clientIP)) {
          logger.warn("API key blocked by IP whitelist", {
            keyId: keyDoc.keyId,
            clientIP,
            allowedIPs: keyDoc.ipWhitelist,
          });
          return null;
        }
      }

      // Update last used information
      await this.recordUsage(keyDoc.keyId, clientIP);

      return keyDoc;
    } catch (error) {
      logger.error("❌ Failed to validate API key:", error);
      return null;
    }
  }

  /**
   * Record API key usage
   */
  async recordUsage(keyId: string, clientIP?: string): Promise<void> {
    const now = new Date();

    try {
      await this.collection.updateOne(
        { keyId },
        {
          $inc: {
            "usage.totalRequests": 1,
            "usage.dailyUsage": 1,
            "usage.monthlyUsage": 1,
          },
          $set: {
            "usage.lastUsed": now,
            "usage.lastUsedIP": clientIP,
            updatedAt: now,
          },
        }
      );
    } catch (error) {
      logger.error("❌ Failed to record API key usage:", error);
    }
  }

  /**
   * Check if key has exceeded rate limits or quotas
   */
  async checkLimits(keyDoc: ApiKeyDocument): Promise<{
    allowed: boolean;
    reason?: string;
    resetTime?: Date;
  }> {
    const now = new Date();

    // Check daily quota
    if (keyDoc.quotas.daily && keyDoc.usage.dailyUsage >= keyDoc.quotas.daily) {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      return {
        allowed: false,
        reason: "Daily quota exceeded",
        resetTime: tomorrow,
      };
    }

    // Check monthly quota
    if (
      keyDoc.quotas.monthly &&
      keyDoc.usage.monthlyUsage >= keyDoc.quotas.monthly
    ) {
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      return {
        allowed: false,
        reason: "Monthly quota exceeded",
        resetTime: nextMonth,
      };
    }

    // Check total requests quota
    if (
      keyDoc.quotas.totalRequests &&
      keyDoc.usage.totalRequests >= keyDoc.quotas.totalRequests
    ) {
      return {
        allowed: false,
        reason: "Total requests quota exceeded",
      };
    }

    return { allowed: true };
  }

  /**
   * Update key status with audit log
   */
  async updateKeyStatus(
    keyId: string,
    status: ApiKeyStatus,
    actor: string,
    reason?: string
  ): Promise<void> {
    const now = new Date();

    try {
      await this.collection.updateOne(
        { keyId },
        {
          $set: {
            status,
            updatedAt: now,
          },
          $push: {
            auditLog: {
              action: "status_changed",
              timestamp: now,
              actor,
              details: { newStatus: status, reason },
            },
          },
        }
      );

      logger.info("API key status updated", { keyId, status, actor, reason });
    } catch (error) {
      logger.error("❌ Failed to update key status:", error);
      throw error;
    }
  }

  /**
   * Revoke an API key
   */
  async revokeKey(
    keyId: string,
    actor: string,
    reason?: string
  ): Promise<void> {
    await this.updateKeyStatus(keyId, ApiKeyStatus.REVOKED, actor, reason);
  }

  /**
   * List API keys with filtering
   */
  async listKeys(
    filters: {
      userId?: string;
      type?: ApiKeyType;
      status?: ApiKeyStatus;
      createdBy?: string;
      limit?: number;
      skip?: number;
    } = {}
  ): Promise<ApiKeyDocument[]> {
    const query: any = {};

    if (filters.userId) query.userId = filters.userId;
    if (filters.type) query.type = filters.type;
    if (filters.status) query.status = filters.status;
    if (filters.createdBy) query.createdBy = filters.createdBy;

    try {
      return await this.collection
        .find(query)
        .sort({ createdAt: -1 })
        .limit(filters.limit || 50)
        .skip(filters.skip || 0)
        .toArray();
    } catch (error) {
      logger.error("❌ Failed to list API keys:", error);
      return [];
    }
  }

  /**
   * Reset daily/monthly usage counters
   */
  async resetUsageCounters(): Promise<void> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    try {
      // Reset daily counters
      await this.collection.updateMany(
        { "usage.usageResetDate": { $lt: today } },
        {
          $set: {
            "usage.dailyUsage": 0,
            "usage.usageResetDate": now,
            updatedAt: now,
          },
        }
      );

      // Reset monthly counters
      await this.collection.updateMany(
        { "usage.usageResetDate": { $lt: thisMonth } },
        {
          $set: {
            "usage.monthlyUsage": 0,
            updatedAt: now,
          },
        }
      );

      logger.info("✅ Usage counters reset successfully");
    } catch (error) {
      logger.error("❌ Failed to reset usage counters:", error);
    }
  }

  private hashKey(key: string): string {
    return createHash("sha256").update(key).digest("hex");
  }

  private getDefaultRateLimit(type: ApiKeyType): number {
    switch (type) {
      case ApiKeyType.ADMIN:
        return 200;
      case ApiKeyType.TRADING:
        return 100;
      case ApiKeyType.WEBHOOK:
        return 500;
      case ApiKeyType.INTEGRATION:
        return 150;
      case ApiKeyType.READ_ONLY:
      default:
        return 50;
    }
  }
}
