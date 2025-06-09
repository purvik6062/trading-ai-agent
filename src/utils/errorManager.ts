import { logger } from "./logger";

interface ErrorCount {
  count: number;
  firstOccurrence: Date;
  lastOccurrence: Date;
  suppressed: number;
}

interface ErrorRateLimit {
  maxErrorsPerMinute: number;
  maxSuppressedErrors: number;
  suppressionDuration: number; // in milliseconds
}

export class ErrorManager {
  private errorCounts: Map<string, ErrorCount> = new Map();
  private config: ErrorRateLimit;

  constructor(config: Partial<ErrorRateLimit> = {}) {
    this.config = {
      maxErrorsPerMinute: 5, // Allow max 5 similar errors per minute
      maxSuppressedErrors: 100, // After suppressing 100 errors, show summary
      suppressionDuration: 60000, // 1 minute suppression window
      ...config,
    };
  }

  /**
   * Smart error logging that prevents console flooding
   */
  logError(errorKey: string, error: any, context?: any): boolean {
    const now = new Date();
    const existing = this.errorCounts.get(errorKey);

    if (!existing) {
      // First occurrence of this error
      this.errorCounts.set(errorKey, {
        count: 1,
        firstOccurrence: now,
        lastOccurrence: now,
        suppressed: 0,
      });

      // Log the first occurrence normally
      logger.error(`[FIRST] ${errorKey}`, { error, context });
      return true;
    }

    // Update existing error count
    existing.count++;
    existing.lastOccurrence = now;

    // Check if we're within the suppression window
    const timeSinceFirst = now.getTime() - existing.firstOccurrence.getTime();
    const withinSuppressionWindow =
      timeSinceFirst < this.config.suppressionDuration;

    // If we've exceeded the rate limit within the window, suppress
    if (
      withinSuppressionWindow &&
      existing.count > this.config.maxErrorsPerMinute
    ) {
      existing.suppressed++;

      // Show summary every N suppressed errors
      if (existing.suppressed % this.config.maxSuppressedErrors === 0) {
        logger.warn(`[SUPPRESSED] ${errorKey}`, {
          totalCount: existing.count,
          suppressedCount: existing.suppressed,
          firstOccurrence: existing.firstOccurrence,
          lastOccurrence: existing.lastOccurrence,
          message: "Error repeated too frequently - suppressing similar errors",
        });
      }
      return false;
    }

    // If suppression window has passed, reset and log
    if (!withinSuppressionWindow) {
      // Log summary if there were suppressed errors
      if (existing.suppressed > 0) {
        logger.info(`[RESUMED] ${errorKey}`, {
          totalCount: existing.count,
          suppressedCount: existing.suppressed,
          message: "Error suppression window ended - resuming normal logging",
        });
      }

      // Reset for new window
      this.errorCounts.set(errorKey, {
        count: 1,
        firstOccurrence: now,
        lastOccurrence: now,
        suppressed: 0,
      });

      logger.error(`[RESUMED] ${errorKey}`, { error, context });
      return true;
    }

    // Within rate limit, log normally
    logger.error(`[${existing.count}x] ${errorKey}`, { error, context });
    return true;
  }

  /**
   * Log warning with rate limiting
   */
  logWarning(warningKey: string, message: string, context?: any): boolean {
    return this.logError(`WARN:${warningKey}`, { message }, context);
  }

  /**
   * Log info with rate limiting (for debugging)
   */
  logInfo(infoKey: string, message: string, context?: any): boolean {
    return this.logError(`INFO:${infoKey}`, { message }, context);
  }

  /**
   * Get error statistics
   */
  getErrorStats(): Map<string, ErrorCount> {
    return new Map(this.errorCounts);
  }

  /**
   * Clear old error counts (cleanup)
   */
  cleanup(olderThanMinutes: number = 60): void {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);

    for (const [key, errorCount] of this.errorCounts.entries()) {
      if (errorCount.lastOccurrence < cutoff) {
        this.errorCounts.delete(key);
      }
    }
  }

  /**
   * Get summary of recent errors
   */
  getErrorSummary(): {
    totalUniqueErrors: number;
    totalErrorCount: number;
    totalSuppressed: number;
    topErrors: Array<{ key: string; count: number; suppressed: number }>;
  } {
    let totalErrorCount = 0;
    let totalSuppressed = 0;
    const errors: Array<{ key: string; count: number; suppressed: number }> =
      [];

    for (const [key, errorCount] of this.errorCounts.entries()) {
      totalErrorCount += errorCount.count;
      totalSuppressed += errorCount.suppressed;
      errors.push({
        key,
        count: errorCount.count,
        suppressed: errorCount.suppressed,
      });
    }

    // Sort by total impact (count + suppressed)
    errors.sort((a, b) => b.count + b.suppressed - (a.count + a.suppressed));

    return {
      totalUniqueErrors: this.errorCounts.size,
      totalErrorCount,
      totalSuppressed,
      topErrors: errors.slice(0, 10), // Top 10 most problematic errors
    };
  }
}

// Global error manager instance
export const errorManager = new ErrorManager({
  maxErrorsPerMinute: 3, // Reduced for better suppression
  maxSuppressedErrors: 50, // Show summary every 50 suppressed errors
  suppressionDuration: 60000, // 1 minute suppression window
});

// Cleanup function to be called periodically
setInterval(
  () => {
    errorManager.cleanup(30); // Clean up errors older than 30 minutes
  },
  10 * 60 * 1000
); // Run every 10 minutes
