import { Router, Request, Response } from "express";
import { ApiKeyManager, ApiKeyType, ApiKeyStatus } from "../models/ApiKey";
import { RateLimitService } from "../services/rateLimitService";
import { requireAdmin, requireReadOnly } from "../middleware/advancedAuth";
import { logger } from "../utils/logger";

const router = Router();

/**
 * GET /api/keys - List API keys with filtering and pagination
 */
router.get("/", requireReadOnly, async (req: Request, res: Response) => {
  try {
    const {
      type,
      status,
      userId,
      createdBy,
      page = "1",
      limit = "20",
      search,
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const filters: any = {};
    if (type) filters.type = type;
    if (status) filters.status = status;
    if (userId) filters.userId = userId;
    if (createdBy) filters.createdBy = createdBy;

    const apiKeyManager = ApiKeyManager.getInstance();
    let keys = await apiKeyManager.listKeys({
      ...filters,
      limit: limitNum,
      skip,
    });

    // Filter by search term if provided
    if (search) {
      const searchTerm = (search as string).toLowerCase();
      keys = keys.filter(
        (key) =>
          key.name.toLowerCase().includes(searchTerm) ||
          key.description?.toLowerCase().includes(searchTerm) ||
          key.keyId.includes(searchTerm)
      );
    }

    // Remove sensitive information
    const sanitizedKeys = keys.map((key) => ({
      keyId: key.keyId,
      name: key.name,
      description: key.description,
      type: key.type,
      status: key.status,
      permissions: key.permissions,
      userId: key.userId,
      createdBy: key.createdBy,
      usage: key.usage,
      quotas: key.quotas,
      rateLimit: {
        windowMs: key.rateLimit.windowMs,
        maxRequests: key.rateLimit.maxRequests,
      },
      createdAt: key.createdAt,
      updatedAt: key.updatedAt,
      expiresAt: key.expiresAt,
      lastRotated: key.lastRotated,
      ipWhitelist: key.ipWhitelist,
      allowedOrigins: key.allowedOrigins,
    }));

    res.json({
      success: true,
      data: {
        keys: sanitizedKeys,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: keys.length,
          hasMore: keys.length === limitNum,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to list API keys:", error);
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to retrieve API keys",
    });
  }
});

/**
 * POST /api/keys - Create a new API key
 */
router.post("/", requireAdmin, async (req: Request, res: Response) => {
  try {
    const {
      name,
      description,
      type,
      permissions,
      userId,
      expiresAt,
      quotas,
      rateLimit,
      ipWhitelist,
      allowedOrigins,
    } = req.body;

    // Validation
    if (!name || !type || !permissions) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Name, type, and permissions are required",
      });
    }

    if (!Object.values(ApiKeyType).includes(type)) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: `Invalid type. Must be one of: ${Object.values(ApiKeyType).join(", ")}`,
      });
    }

    const apiKeyManager = ApiKeyManager.getInstance();
    const result = await apiKeyManager.generateApiKey({
      name,
      description,
      type,
      permissions,
      createdBy: req.apiKey?.name || "admin",
      userId,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      quotas,
      rateLimit,
      ipWhitelist,
      allowedOrigins,
    });

    logger.info("API key created", {
      keyId: result.keyId,
      type,
      createdBy: req.apiKey?.name,
      permissions,
    });

    res.status(201).json({
      success: true,
      data: {
        keyId: result.keyId,
        apiKey: result.apiKey, // Only returned once!
        name: result.document.name,
        type: result.document.type,
        permissions: result.document.permissions,
        createdAt: result.document.createdAt,
        expiresAt: result.document.expiresAt,
      },
      message:
        "API key created successfully. Store the key securely - it won't be shown again!",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to create API key:", error);
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to create API key",
    });
  }
});

/**
 * GET /api/keys/:keyId - Get specific API key details
 */
router.get("/:keyId", requireReadOnly, async (req: Request, res: Response) => {
  try {
    const { keyId } = req.params;

    const apiKeyManager = ApiKeyManager.getInstance();
    const keys = await apiKeyManager.listKeys({ limit: 1000 });
    const key = keys.find((k) => k.keyId === keyId);

    if (!key) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "API key not found",
      });
    }

    // Get current usage stats from Redis
    const rateLimitService = RateLimitService.getInstance();
    const usageStats = await rateLimitService.getUsageStats(keyId, {
      windowMs: key.rateLimit.windowMs,
      maxRequests: key.rateLimit.maxRequests,
      keyPrefix: "api",
    });

    res.json({
      success: true,
      data: {
        keyId: key.keyId,
        name: key.name,
        description: key.description,
        type: key.type,
        status: key.status,
        permissions: key.permissions,
        userId: key.userId,
        createdBy: key.createdBy,
        usage: {
          ...key.usage,
          currentWindow: {
            requests: usageStats.currentRequests,
            remaining: usageStats.remaining,
            resetTime: usageStats.resetTime,
          },
        },
        quotas: key.quotas,
        rateLimit: {
          windowMs: key.rateLimit.windowMs,
          maxRequests: key.rateLimit.maxRequests,
        },
        createdAt: key.createdAt,
        updatedAt: key.updatedAt,
        expiresAt: key.expiresAt,
        lastRotated: key.lastRotated,
        ipWhitelist: key.ipWhitelist,
        allowedOrigins: key.allowedOrigins,
        auditLog: key.auditLog.slice(-10), // Last 10 audit entries
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to get API key:", error);
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to retrieve API key",
    });
  }
});

/**
 * PUT /api/keys/:keyId/status - Update API key status
 */
router.put(
  "/:keyId/status",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { keyId } = req.params;
      const { status, reason } = req.body;

      if (!Object.values(ApiKeyStatus).includes(status)) {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: `Invalid status. Must be one of: ${Object.values(ApiKeyStatus).join(", ")}`,
        });
      }

      const apiKeyManager = ApiKeyManager.getInstance();
      await apiKeyManager.updateKeyStatus(
        keyId,
        status,
        req.apiKey?.name || "admin",
        reason
      );

      logger.info("API key status updated", {
        keyId,
        status,
        reason,
        updatedBy: req.apiKey?.name,
      });

      res.json({
        success: true,
        message: "API key status updated successfully",
        data: { keyId, status, reason },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Failed to update API key status:", error);
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "Failed to update API key status",
      });
    }
  }
);

/**
 * DELETE /api/keys/:keyId - Revoke an API key
 */
router.delete("/:keyId", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { keyId } = req.params;
    const { reason } = req.body;

    const apiKeyManager = ApiKeyManager.getInstance();
    await apiKeyManager.revokeKey(
      keyId,
      req.apiKey?.name || "admin",
      reason || "Revoked via API"
    );

    logger.info("API key revoked", {
      keyId,
      reason,
      revokedBy: req.apiKey?.name,
    });

    res.json({
      success: true,
      message: "API key revoked successfully",
      data: { keyId, reason },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to revoke API key:", error);
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to revoke API key",
    });
  }
});

/**
 * POST /api/keys/:keyId/reset-usage - Reset usage counters for an API key
 */
router.post(
  "/:keyId/reset-usage",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { keyId } = req.params;
      const { type = "all" } = req.body; // "all", "rate-limit", "daily", "monthly"

      const rateLimitService = RateLimitService.getInstance();

      if (type === "all" || type === "rate-limit") {
        await rateLimitService.resetLimit(keyId, "api");
      }

      if (type === "all" || type === "daily") {
        await rateLimitService.resetLimit(keyId, "quota:daily");
      }

      if (type === "all" || type === "monthly") {
        await rateLimitService.resetLimit(keyId, "quota:monthly");
      }

      logger.info("API key usage reset", {
        keyId,
        type,
        resetBy: req.apiKey?.name,
      });

      res.json({
        success: true,
        message: `Usage counters reset successfully (${type})`,
        data: { keyId, type },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Failed to reset usage:", error);
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "Failed to reset usage counters",
      });
    }
  }
);

/**
 * GET /api/keys/stats/overview - Get overall API usage statistics
 */
router.get(
  "/stats/overview",
  requireReadOnly,
  async (req: Request, res: Response) => {
    try {
      const apiKeyManager = ApiKeyManager.getInstance();
      const allKeys = await apiKeyManager.listKeys({ limit: 1000 });

      const stats = {
        total: allKeys.length,
        byStatus: {} as Record<string, number>,
        byType: {} as Record<string, number>,
        totalRequests: 0,
        activeToday: 0,
        expiringThisWeek: 0,
      };

      const now = new Date();
      const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      allKeys.forEach((key) => {
        // Status counts
        stats.byStatus[key.status] = (stats.byStatus[key.status] || 0) + 1;

        // Type counts
        stats.byType[key.type] = (stats.byType[key.type] || 0) + 1;

        // Total requests
        stats.totalRequests += key.usage.totalRequests;

        // Active today
        if (key.usage.lastUsed && key.usage.lastUsed >= today) {
          stats.activeToday++;
        }

        // Expiring this week
        if (key.expiresAt && key.expiresAt <= oneWeekFromNow) {
          stats.expiringThisWeek++;
        }
      });

      res.json({
        success: true,
        data: stats,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Failed to get stats overview:", error);
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "Failed to retrieve statistics",
      });
    }
  }
);

/**
 * GET /api/keys/stats/usage - Get detailed usage statistics
 */
router.get(
  "/stats/usage",
  requireReadOnly,
  async (req: Request, res: Response) => {
    try {
      const { period = "24h", keyId } = req.query;

      // This would typically involve more complex analytics
      // For now, return basic stats
      const apiKeyManager = ApiKeyManager.getInstance();
      const filters = keyId ? { keyId: keyId as string } : {};
      const keys = await apiKeyManager.listKeys({ ...filters, limit: 1000 });

      const usageData = keys.map((key) => ({
        keyId: key.keyId,
        name: key.name,
        type: key.type,
        totalRequests: key.usage.totalRequests,
        dailyUsage: key.usage.dailyUsage,
        monthlyUsage: key.usage.monthlyUsage,
        lastUsed: key.usage.lastUsed,
        lastUsedIP: key.usage.lastUsedIP,
      }));

      res.json({
        success: true,
        data: {
          period,
          keys: usageData,
          summary: {
            totalKeys: keys.length,
            totalRequests: keys.reduce(
              (sum, key) => sum + key.usage.totalRequests,
              0
            ),
            averageDaily:
              keys.reduce((sum, key) => sum + key.usage.dailyUsage, 0) /
              Math.max(keys.length, 1),
          },
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Failed to get usage statistics:", error);
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "Failed to retrieve usage statistics",
      });
    }
  }
);

export default router;
