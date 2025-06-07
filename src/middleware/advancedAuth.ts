import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";
import { ApiKeyManager, ApiKeyDocument } from "../models/ApiKey";
import {
  RateLimitService,
  RateLimitConfig,
} from "../services/rateLimitService";

// Extend Request interface to include API key info
declare global {
  namespace Express {
    interface Request {
      apiKey?: {
        document: ApiKeyDocument;
        keyId: string;
        type: string;
        name: string;
        permissions: string[];
        rateLimit: {
          remaining: number;
          resetTime: Date;
          totalHits: number;
        };
      };
    }
  }
}

export interface AuthMiddlewareOptions {
  requiredPermissions?: string[];
  checkQuotas?: boolean;
  skipRateLimit?: boolean;
  allowedOrigins?: string[];
}

/**
 * Advanced authentication middleware with MongoDB and Redis integration
 */
export const authenticateApiKey = (options: AuthMiddlewareOptions = {}) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const apiKey = req.headers["x-api-key"] as string;
    const clientIP = req.ip || req.connection.remoteAddress || "unknown";
    const origin = req.headers.origin;

    // Check if API key is provided
    if (!apiKey) {
      logger.warn("API request without key", {
        ip: clientIP,
        path: req.path,
        userAgent: req.get("User-Agent"),
        origin,
      });

      return res.status(401).json({
        success: false,
        error: "Unauthorized",
        message: "API key required. Include X-API-Key header.",
        code: "MISSING_API_KEY",
      });
    }

    try {
      // Validate API key with MongoDB
      const apiKeyManager = ApiKeyManager.getInstance();
      const keyDoc = await apiKeyManager.validateKey(apiKey, clientIP);

      if (!keyDoc) {
        logger.warn("API request with invalid key", {
          ip: clientIP,
          path: req.path,
          keyPrefix: apiKey.substring(0, 8) + "...",
          userAgent: req.get("User-Agent"),
          origin,
        });

        return res.status(401).json({
          success: false,
          error: "Unauthorized",
          message: "Invalid or expired API key.",
          code: "INVALID_API_KEY",
        });
      }

      // Check permissions
      if (
        options.requiredPermissions &&
        options.requiredPermissions.length > 0
      ) {
        const hasPermission = options.requiredPermissions.every(
          (permission) =>
            keyDoc.permissions.includes(permission) ||
            keyDoc.permissions.includes("*")
        );

        if (!hasPermission) {
          logger.warn("API request with insufficient permissions", {
            ip: clientIP,
            path: req.path,
            keyId: keyDoc.keyId,
            keyType: keyDoc.type,
            requiredPermissions: options.requiredPermissions,
            userPermissions: keyDoc.permissions,
          });

          return res.status(403).json({
            success: false,
            error: "Forbidden",
            message: "Insufficient permissions for this operation.",
            code: "INSUFFICIENT_PERMISSIONS",
            required: options.requiredPermissions,
            granted: keyDoc.permissions.filter((p) => p !== "*"),
          });
        }
      }

      // Check CORS origins if specified
      if (options.allowedOrigins && origin) {
        const allowed =
          options.allowedOrigins.includes("*") ||
          options.allowedOrigins.includes(origin) ||
          (keyDoc.allowedOrigins && keyDoc.allowedOrigins.includes(origin));

        if (!allowed) {
          logger.warn("API request from disallowed origin", {
            keyId: keyDoc.keyId,
            origin,
            allowedOrigins: options.allowedOrigins,
          });

          return res.status(403).json({
            success: false,
            error: "Forbidden",
            message: "Origin not allowed.",
            code: "ORIGIN_NOT_ALLOWED",
          });
        }
      }

      // Check quotas if enabled
      if (options.checkQuotas) {
        const quotaCheck = await apiKeyManager.checkLimits(keyDoc);

        if (!quotaCheck.allowed) {
          logger.warn("API request exceeded quota", {
            keyId: keyDoc.keyId,
            reason: quotaCheck.reason,
            resetTime: quotaCheck.resetTime,
          });

          return res.status(429).json({
            success: false,
            error: "Quota Exceeded",
            message: quotaCheck.reason,
            code: "QUOTA_EXCEEDED",
            resetTime: quotaCheck.resetTime,
            retryAfter: quotaCheck.resetTime
              ? Math.ceil((quotaCheck.resetTime.getTime() - Date.now()) / 1000)
              : undefined,
          });
        }
      }

      // Rate limiting with Redis (if not skipped)
      let rateLimitResult = {
        remaining: keyDoc.rateLimit.maxRequests,
        resetTime: new Date(Date.now() + keyDoc.rateLimit.windowMs),
        totalHits: 0,
      };

      if (!options.skipRateLimit) {
        try {
          const rateLimitService = RateLimitService.getInstance();
          const rateLimitConfig: RateLimitConfig = {
            windowMs: keyDoc.rateLimit.windowMs,
            maxRequests: keyDoc.rateLimit.maxRequests,
            keyPrefix: "api",
          };

          const result = await rateLimitService.checkLimit(
            keyDoc.keyId,
            rateLimitConfig
          );

          if (!result.allowed) {
            logger.warn("API request rate limited", {
              keyId: keyDoc.keyId,
              remaining: result.remaining,
              resetTime: result.resetTime,
              totalHits: result.totalHits,
            });

            return res.status(429).json({
              success: false,
              error: "Rate Limit Exceeded",
              message: "Too many requests. Please try again later.",
              code: "RATE_LIMIT_EXCEEDED",
              remaining: result.remaining,
              resetTime: result.resetTime,
              retryAfter: result.retryAfter,
            });
          }

          rateLimitResult = {
            remaining: result.remaining,
            resetTime: result.resetTime,
            totalHits: result.totalHits,
          };
        } catch (rateLimitError) {
          logger.error(
            "Rate limit check failed, allowing request:",
            rateLimitError
          );
          // Continue with request if rate limiting fails
        }
      }

      // Add API key info to request
      req.apiKey = {
        document: keyDoc,
        keyId: keyDoc.keyId,
        type: keyDoc.type,
        name: keyDoc.name,
        permissions: keyDoc.permissions,
        rateLimit: rateLimitResult,
      };

      // Add rate limit headers
      res.set({
        "X-RateLimit-Limit": keyDoc.rateLimit.maxRequests.toString(),
        "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
        "X-RateLimit-Reset": Math.ceil(
          rateLimitResult.resetTime.getTime() / 1000
        ).toString(),
      });

      // Log successful authentication
      logger.info("API request authenticated", {
        keyId: keyDoc.keyId,
        keyType: keyDoc.type,
        keyName: keyDoc.name,
        ip: clientIP,
        path: req.path,
        method: req.method,
        remaining: rateLimitResult.remaining,
        permissions: keyDoc.permissions,
      });

      next();
    } catch (error) {
      logger.error("Authentication middleware error:", error);

      return res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "Authentication system temporarily unavailable.",
        code: "AUTH_SYSTEM_ERROR",
      });
    }
  };
};

/**
 * Middleware to check specific quotas (daily/monthly)
 */
export const checkQuotaMiddleware = (quotaType: "daily" | "monthly") => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.apiKey) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
        message: "API key required.",
        code: "MISSING_API_KEY",
      });
    }

    try {
      const keyDoc = req.apiKey.document;
      const quotaLimit =
        quotaType === "daily" ? keyDoc.quotas.daily : keyDoc.quotas.monthly;

      if (!quotaLimit) {
        // No quota set, allow request
        return next();
      }

      const rateLimitService = RateLimitService.getInstance();
      const result = await rateLimitService.checkQuotaLimit(
        keyDoc.keyId,
        quotaType,
        quotaLimit
      );

      if (!result.allowed) {
        logger.warn(`${quotaType} quota exceeded`, {
          keyId: keyDoc.keyId,
          quotaType,
          limit: quotaLimit,
          resetTime: result.resetTime,
        });

        return res.status(429).json({
          success: false,
          error: "Quota Exceeded",
          message: `${quotaType.charAt(0).toUpperCase() + quotaType.slice(1)} quota exceeded.`,
          code: `${quotaType.toUpperCase()}_QUOTA_EXCEEDED`,
          limit: quotaLimit,
          remaining: result.remaining,
          resetTime: result.resetTime,
          retryAfter: result.retryAfter,
        });
      }

      // Add quota headers
      res.set({
        [`X-${quotaType.charAt(0).toUpperCase() + quotaType.slice(1)}-Quota-Limit`]:
          quotaLimit.toString(),
        [`X-${quotaType.charAt(0).toUpperCase() + quotaType.slice(1)}-Quota-Remaining`]:
          result.remaining.toString(),
        [`X-${quotaType.charAt(0).toUpperCase() + quotaType.slice(1)}-Quota-Reset`]:
          Math.ceil(result.resetTime.getTime() / 1000).toString(),
      });

      next();
    } catch (error) {
      logger.error(`${quotaType} quota check error:`, error);
      // Continue with request if quota check fails
      next();
    }
  };
};

/**
 * Admin-only middleware
 */
export const requireAdmin = authenticateApiKey({
  requiredPermissions: ["*"],
});

/**
 * Trading permissions middleware
 */
export const requireTrading = authenticateApiKey({
  requiredPermissions: ["signal:process"],
});

/**
 * Read-only permissions middleware
 */
export const requireReadOnly = authenticateApiKey({
  requiredPermissions: ["positions:read"],
});

/**
 * Middleware for health checks (minimal permissions)
 */
export const requireHealthCheck = authenticateApiKey({
  requiredPermissions: ["health:read"],
  skipRateLimit: true,
});

/**
 * Error handling middleware for authentication errors
 */
export const authErrorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (error.name === "UnauthorizedError") {
    return res.status(401).json({
      success: false,
      error: "Unauthorized",
      message: "Invalid authentication credentials.",
      code: "AUTH_ERROR",
    });
  }

  if (error.name === "ForbiddenError") {
    return res.status(403).json({
      success: false,
      error: "Forbidden",
      message: "Insufficient permissions.",
      code: "PERMISSION_ERROR",
    });
  }

  // Pass other errors to the default error handler
  next(error);
};
