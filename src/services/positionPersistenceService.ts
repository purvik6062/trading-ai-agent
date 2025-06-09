import { MongoClient, Db, Collection } from "mongodb";
import {
  Position,
  PersistedPosition,
  PositionRecoveryResult,
  PositionStatus,
} from "../types/trading";
import { logger } from "../utils/logger";
import { config } from "../config";

export class PositionPersistenceService {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private positionsCollection: Collection<PersistedPosition> | null = null;
  private isConnected = false;

  constructor() {
    // Will use the same MongoDB connection as other services
  }

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

      // Use the same database as other services
      this.db = this.client.db(config.mongodb.databaseName);
      this.positionsCollection =
        this.db.collection<PersistedPosition>("positions");

      // Create indexes for performance
      await this.createIndexes();

      this.isConnected = true;
      logger.info("✅ Position Persistence Service connected to MongoDB", {
        database: config.mongodb.databaseName,
        collection: "positions",
      });
    } catch (error) {
      logger.error(
        "❌ Failed to connect Position Persistence Service to MongoDB:",
        error
      );
      throw error;
    }
  }

  /**
   * Create MongoDB indexes for position queries
   */
  private async createIndexes(): Promise<void> {
    try {
      if (!this.positionsCollection) return;

      await this.positionsCollection.createIndex({ id: 1 }, { unique: true });
      await this.positionsCollection.createIndex({ status: 1 });
      await this.positionsCollection.createIndex({ username: 1 });
      await this.positionsCollection.createIndex({ vaultAddress: 1 });
      await this.positionsCollection.createIndex({ "signal.tokenId": 1 });
      await this.positionsCollection.createIndex({
        status: 1,
        username: 1,
      });
      await this.positionsCollection.createIndex({
        status: 1,
        "signal.maxExitTime": 1,
      });

      logger.info("✅ Position persistence indexes created");
    } catch (error) {
      logger.error("❌ Failed to create position persistence indexes:", error);
    }
  }

  /**
   * Disconnect from MongoDB
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.isConnected = false;
      logger.info("✅ Position Persistence Service disconnected");
    }
  }

  /**
   * Save or update a position
   */
  async savePosition(
    position: Position,
    username?: string,
    vaultAddress?: string
  ): Promise<void> {
    try {
      if (!this.positionsCollection) {
        throw new Error("MongoDB not connected");
      }

      const persistedPosition: PersistedPosition = {
        ...position,
        username,
        vaultAddress,
        lastMonitoredAt: new Date(),
        updatedAt: new Date(),
      };

      await this.positionsCollection.replaceOne(
        { id: position.id },
        persistedPosition,
        { upsert: true }
      );

      logger.debug(`💾 Position saved: ${position.id}`, {
        token: position.signal.token,
        status: position.status,
        username,
      });
    } catch (error) {
      logger.error(`❌ Failed to save position ${position.id}:`, error);
      throw error;
    }
  }

  /**
   * Get a specific position by ID
   */
  async getPosition(positionId: string): Promise<PersistedPosition | null> {
    try {
      if (!this.positionsCollection) {
        throw new Error("MongoDB not connected");
      }

      return await this.positionsCollection.findOne({ id: positionId });
    } catch (error) {
      logger.error(`❌ Failed to get position ${positionId}:`, error);
      throw error;
    }
  }

  /**
   * Get all active positions for a user
   */
  async getUserActivePositions(username: string): Promise<PersistedPosition[]> {
    try {
      if (!this.positionsCollection) {
        throw new Error("MongoDB not connected");
      }

      return await this.positionsCollection
        .find({
          username,
          status: { $in: [PositionStatus.PENDING, PositionStatus.ACTIVE] },
        })
        .toArray();
    } catch (error) {
      logger.error(`❌ Failed to get user positions for ${username}:`, error);
      throw error;
    }
  }

  /**
   * Get all active positions across all users
   */
  async getAllActivePositions(): Promise<PersistedPosition[]> {
    try {
      if (!this.positionsCollection) {
        throw new Error("MongoDB not connected");
      }

      return await this.positionsCollection
        .find({
          status: { $in: [PositionStatus.PENDING, PositionStatus.ACTIVE] },
        })
        .sort({ createdAt: -1 })
        .toArray();
    } catch (error) {
      logger.error("❌ Failed to get all active positions:", error);
      throw error;
    }
  }

  /**
   * Update position status
   */
  async updatePositionStatus(
    positionId: string,
    status: PositionStatus,
    exitTxHash?: string
  ): Promise<void> {
    try {
      if (!this.positionsCollection) {
        throw new Error("MongoDB not connected");
      }

      const updateData: any = {
        status,
        updatedAt: new Date(),
        lastMonitoredAt: new Date(),
      };

      if (exitTxHash) {
        updateData.exitTxHash = exitTxHash;
      }

      if (
        status === PositionStatus.CLOSED ||
        status === PositionStatus.EXPIRED ||
        status === PositionStatus.FAILED
      ) {
        updateData.exitExecuted = true;
      }

      await this.positionsCollection.updateOne(
        { id: positionId },
        { $set: updateData }
      );

      logger.info(`📝 Position status updated: ${positionId} -> ${status}`);
    } catch (error) {
      logger.error(`❌ Failed to update position status ${positionId}:`, error);
      throw error;
    }
  }

  /**
   * Clean up expired positions
   */
  async cleanupExpiredPositions(): Promise<number> {
    try {
      if (!this.positionsCollection) {
        throw new Error("MongoDB not connected");
      }

      const now = new Date();
      const result = await this.positionsCollection.updateMany(
        {
          status: { $in: [PositionStatus.PENDING, PositionStatus.ACTIVE] },
          "signal.maxExitTime": { $lt: now.toISOString() },
        },
        {
          $set: {
            status: PositionStatus.EXPIRED,
            updatedAt: now,
          },
        }
      );

      if (result.modifiedCount > 0) {
        logger.info(`🧹 Cleaned up ${result.modifiedCount} expired positions`);
      }

      return result.modifiedCount;
    } catch (error) {
      logger.error("❌ Failed to cleanup expired positions:", error);
      throw error;
    }
  }

  /**
   * Recover all active positions for system restart
   */
  async recoverActivePositions(): Promise<PositionRecoveryResult> {
    try {
      logger.info("🔄 Starting position recovery from MongoDB...");

      // First, cleanup any expired positions
      const expiredCount = await this.cleanupExpiredPositions();

      // Get all active positions
      const activePositions = await this.getAllActivePositions();

      const result: PositionRecoveryResult = {
        totalRecovered: activePositions.length,
        activePositions: activePositions.filter(
          (p) => p.status === PositionStatus.ACTIVE
        ).length,
        expiredPositions: expiredCount,
        failedRecovery: 0,
        recoveredPositions: activePositions,
        errors: [],
      };

      // Mark positions as recovered
      if (activePositions.length > 0) {
        const positionIds = activePositions.map((p) => p.id);
        await this.positionsCollection!.updateMany(
          { id: { $in: positionIds } },
          {
            $set: {
              recoveredAt: new Date(),
              lastMonitoredAt: new Date(),
            },
          }
        );
      }

      logger.info("✅ Position recovery completed", {
        totalRecovered: result.totalRecovered,
        activePositions: result.activePositions,
        expiredPositions: result.expiredPositions,
      });

      return result;
    } catch (error) {
      logger.error("❌ Failed to recover positions:", error);

      return {
        totalRecovered: 0,
        activePositions: 0,
        expiredPositions: 0,
        failedRecovery: 1,
        recoveredPositions: [],
        errors: [error instanceof Error ? error.message : "Unknown error"],
      };
    }
  }

  /**
   * Get position statistics
   */
  async getPositionStats(): Promise<{
    total: number;
    active: number;
    closed: number;
    expired: number;
    failed: number;
    byToken: Record<string, number>;
  }> {
    try {
      if (!this.positionsCollection) {
        throw new Error("MongoDB not connected");
      }

      const [statusStats, tokenStats] = await Promise.all([
        this.positionsCollection
          .aggregate([
            {
              $group: {
                _id: "$status",
                count: { $sum: 1 },
              },
            },
          ])
          .toArray(),

        this.positionsCollection
          .aggregate([
            {
              $match: {
                status: {
                  $in: [PositionStatus.PENDING, PositionStatus.ACTIVE],
                },
              },
            },
            {
              $group: {
                _id: "$signal.token",
                count: { $sum: 1 },
              },
            },
          ])
          .toArray(),
      ]);

      const stats = {
        total: 0,
        active: 0,
        closed: 0,
        expired: 0,
        failed: 0,
        byToken: {} as Record<string, number>,
      };

      statusStats.forEach((stat) => {
        const status = stat._id as PositionStatus;
        const count = stat.count;
        stats.total += count;

        switch (status) {
          case PositionStatus.ACTIVE:
            stats.active = count;
            break;
          case PositionStatus.CLOSED:
            stats.closed = count;
            break;
          case PositionStatus.EXPIRED:
            stats.expired = count;
            break;
          case PositionStatus.FAILED:
            stats.failed = count;
            break;
        }
      });

      tokenStats.forEach((stat) => {
        stats.byToken[stat._id] = stat.count;
      });

      return stats;
    } catch (error) {
      logger.error("❌ Failed to get position stats:", error);
      throw error;
    }
  }

  /**
   * Check if service is connected
   */
  isConnectedToMongoDB(): boolean {
    return this.isConnected;
  }
}
