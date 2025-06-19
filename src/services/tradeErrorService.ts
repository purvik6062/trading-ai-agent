import { MongoClient, Db, Collection } from "mongodb";
import { config } from "../config";
import { logger } from "../utils/logger";
import { TradingSignal } from "../types/trading";

export interface TradeError {
  id: string;
  username: string;
  vaultAddress: string;
  signal: TradingSignal;
  error: string;
  errorType:
    | "insufficient_balance"
    | "network_error"
    | "validation_error"
    | "execution_error"
    | "unknown";
  timestamp: Date;
  retryCount?: number;
  lastRetryAt?: Date;
  resolved?: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
}

export class TradeErrorService {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private errorsCollection: Collection<TradeError> | null = null;
  private isConnected = false;

  constructor() {}

  /**
   * Connect to MongoDB
   */
  async connect(): Promise<void> {
    try {
      if (!config.mongodb.uri) {
        throw new Error("MongoDB URI not configured");
      }

      this.client = new MongoClient(config.mongodb.uri);
      await this.client.connect();
      this.db = this.client.db(config.mongodb.databaseName);
      this.errorsCollection = this.db.collection<TradeError>("trade_errors");

      // Create indexes
      await this.createIndexes();

      this.isConnected = true;
      logger.info("✅ Trade Error Service connected to MongoDB", {
        database: config.mongodb.databaseName,
        collection: "trade_errors",
      });
    } catch (error) {
      logger.error(
        "❌ Failed to connect Trade Error Service to MongoDB:",
        error
      );
      throw error;
    }
  }

  /**
   * Create MongoDB indexes for trade errors
   */
  private async createIndexes(): Promise<void> {
    try {
      if (!this.errorsCollection) return;

      await this.errorsCollection.createIndex({ id: 1 }, { unique: true });
      await this.errorsCollection.createIndex({ username: 1 });
      await this.errorsCollection.createIndex({ vaultAddress: 1 });
      await this.errorsCollection.createIndex({ errorType: 1 });
      await this.errorsCollection.createIndex({ timestamp: -1 });
      await this.errorsCollection.createIndex({ resolved: 1 });
      await this.errorsCollection.createIndex({
        username: 1,
        errorType: 1,
        resolved: 1,
      });

      logger.info("✅ Trade error indexes created");
    } catch (error) {
      logger.error("❌ Failed to create trade error indexes:", error);
    }
  }

  /**
   * Log a trade error
   */
  async logTradeError(
    username: string,
    vaultAddress: string,
    signal: TradingSignal,
    error: string,
    errorType?: string
  ): Promise<string> {
    try {
      if (!this.errorsCollection) {
        throw new Error("MongoDB not connected");
      }

      const errorId = `trade_error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Determine error type based on error message
      let detectedErrorType: TradeError["errorType"] = "unknown";
      if (error.toLowerCase().includes("insufficient balance")) {
        detectedErrorType = "insufficient_balance";
      } else if (
        error.toLowerCase().includes("network") ||
        error.toLowerCase().includes("connection")
      ) {
        detectedErrorType = "network_error";
      } else if (
        error.toLowerCase().includes("validation") ||
        error.toLowerCase().includes("invalid")
      ) {
        detectedErrorType = "validation_error";
      } else if (
        error.toLowerCase().includes("execution") ||
        error.toLowerCase().includes("swap")
      ) {
        detectedErrorType = "execution_error";
      }

      const tradeError: TradeError = {
        id: errorId,
        username,
        vaultAddress,
        signal,
        error,
        errorType: (errorType as TradeError["errorType"]) || detectedErrorType,
        timestamp: new Date(),
        retryCount: 0,
        resolved: false,
      };

      await this.errorsCollection.insertOne(tradeError);

      logger.error("💾 Trade error logged to database:", {
        errorId,
        username,
        vaultAddress,
        token: signal.token,
        errorType: tradeError.errorType,
        error: error.substring(0, 100) + (error.length > 100 ? "..." : ""),
      });

      return errorId;
    } catch (error) {
      logger.error("❌ Failed to log trade error:", error);
      throw error;
    }
  }

  /**
   * Get trade errors for a user
   */
  async getUserTradeErrors(
    username: string,
    resolved?: boolean,
    limit: number = 50
  ): Promise<TradeError[]> {
    try {
      if (!this.errorsCollection) {
        throw new Error("MongoDB not connected");
      }

      const filter: any = { username };
      if (resolved !== undefined) {
        filter.resolved = resolved;
      }

      const errors = await this.errorsCollection
        .find(filter)
        .sort({ timestamp: -1 })
        .limit(limit)
        .toArray();

      return errors;
    } catch (error) {
      logger.error("❌ Failed to get user trade errors:", error);
      throw error;
    }
  }

  /**
   * Get trade error statistics
   */
  async getErrorStats(username?: string): Promise<{
    totalErrors: number;
    resolvedErrors: number;
    unresolvedErrors: number;
    errorsByType: Record<string, number>;
    recentErrors: number; // Last 24 hours
  }> {
    try {
      if (!this.errorsCollection) {
        throw new Error("MongoDB not connected");
      }

      const matchFilter = username ? { username } : {};
      const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const [
        totalResult,
        resolvedResult,
        unresolvedResult,
        errorTypeResults,
        recentResult,
      ] = await Promise.all([
        this.errorsCollection.countDocuments(matchFilter),
        this.errorsCollection.countDocuments({
          ...matchFilter,
          resolved: true,
        }),
        this.errorsCollection.countDocuments({
          ...matchFilter,
          resolved: false,
        }),
        this.errorsCollection
          .aggregate([
            { $match: matchFilter },
            { $group: { _id: "$errorType", count: { $sum: 1 } } },
          ])
          .toArray(),
        this.errorsCollection.countDocuments({
          ...matchFilter,
          timestamp: { $gte: last24Hours },
        }),
      ]);

      const errorsByType = errorTypeResults.reduce(
        (acc, result) => {
          acc[result._id] = result.count;
          return acc;
        },
        {} as Record<string, number>
      );

      return {
        totalErrors: totalResult,
        resolvedErrors: resolvedResult,
        unresolvedErrors: unresolvedResult,
        errorsByType,
        recentErrors: recentResult,
      };
    } catch (error) {
      logger.error("❌ Failed to get error stats:", error);
      throw error;
    }
  }

  /**
   * Mark error as resolved
   */
  async resolveError(errorId: string, resolvedBy: string): Promise<void> {
    try {
      if (!this.errorsCollection) {
        throw new Error("MongoDB not connected");
      }

      await this.errorsCollection.updateOne(
        { id: errorId },
        {
          $set: {
            resolved: true,
            resolvedAt: new Date(),
            resolvedBy,
          },
        }
      );

      logger.info("✅ Trade error marked as resolved:", {
        errorId,
        resolvedBy,
      });
    } catch (error) {
      logger.error("❌ Failed to resolve trade error:", error);
      throw error;
    }
  }

  /**
   * Disconnect from MongoDB
   */
  async disconnect(): Promise<void> {
    try {
      if (this.client) {
        await this.client.close();
        this.isConnected = false;
        logger.info("Trade Error Service disconnected from MongoDB");
      }
    } catch (error) {
      logger.error("Error disconnecting Trade Error Service:", error);
    }
  }

  /**
   * Check if connected to MongoDB
   */
  isConnectedToMongoDB(): boolean {
    return this.isConnected;
  }
}
