import { MongoClient, Db, Collection } from "mongodb";
import { UserVaultMapping, UserSession, TradingSettings } from "../types/user";
import { GameEngineService, GameEngineConfig } from "./gameEngineService";
import { EnzymeVaultService } from "./enzymeService";
import { logger } from "../utils/logger";
import { ethers } from "ethers";
import { config } from "../config";

export class MongoUserService {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private userMappingsCollection: Collection<UserVaultMapping> | null = null;
  private tradingSettingsCollection: Collection<any> | null = null;
  private userSessions: Map<string, UserSession> = new Map();
  private isConnected = false;

  constructor() {
    // Will use the same MongoDB connection as signals
  }

  /**
   * Connect to MongoDB (same database as trading signals)
   */
  async connect(): Promise<void> {
    try {
      if (!config.mongodb.uri) {
        throw new Error("MongoDB URI not configured");
      }

      this.client = new MongoClient(config.mongodb.uri);
      await this.client.connect();

      // Use the same database as trading signals
      this.db = this.client.db(config.mongodb.databaseName);

      // Create collections for user management
      this.userMappingsCollection = this.db.collection<UserVaultMapping>(
        "user_vault_mappings"
      );
      this.tradingSettingsCollection = this.db.collection(
        "user_trading_settings"
      );

      // Create indexes for performance
      await this.createIndexes();

      this.isConnected = true;
      logger.info("✅ MongoDB User Service connected to:", {
        database: config.mongodb.databaseName,
        collections: ["user_vault_mappings", "user_trading_settings"],
      });
    } catch (error) {
      logger.error("❌ Failed to connect to MongoDB:", error);
      throw error;
    }
  }

  /**
   * Create MongoDB indexes for performance
   */
  private async createIndexes(): Promise<void> {
    try {
      if (!this.userMappingsCollection) return;

      // Create indexes
      await this.userMappingsCollection.createIndex(
        { username: 1 },
        { unique: true }
      );
      await this.userMappingsCollection.createIndex({ vaultAddress: 1 });
      await this.userMappingsCollection.createIndex({ isActive: 1 });
      await this.userMappingsCollection.createIndex({
        isActive: 1,
        username: 1,
      });

      logger.info("✅ MongoDB indexes created");
    } catch (error) {
      logger.error("❌ Failed to create MongoDB indexes:", error);
    }
  }

  /**
   * Disconnect from MongoDB
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.isConnected = false;
      logger.info("✅ MongoDB User Service disconnected");
    }
  }

  /**
   * Save user vault mapping to MongoDB
   */
  async saveUserMapping(mapping: UserVaultMapping): Promise<void> {
    try {
      if (!this.userMappingsCollection) {
        throw new Error("MongoDB not connected");
      }

      // Add timestamps
      const mappingWithTimestamps = {
        ...mapping,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await this.userMappingsCollection.replaceOne(
        { username: mapping.username },
        mappingWithTimestamps,
        { upsert: true }
      );

      logger.info("✅ User mapping saved to MongoDB:", {
        username: mapping.username,
        vaultAddress: mapping.vaultAddress,
        isActive: mapping.isActive,
      });
    } catch (error) {
      logger.error("❌ Failed to save user mapping to MongoDB:", error);
      throw error;
    }
  }

  /**
   * Get user vault mapping from MongoDB
   */
  async getUserMapping(username: string): Promise<UserVaultMapping | null> {
    try {
      if (!this.userMappingsCollection) {
        throw new Error("MongoDB not connected");
      }

      const mapping = await this.userMappingsCollection.findOne({ username });
      return mapping || null;
    } catch (error) {
      logger.error("❌ Failed to get user mapping from MongoDB:", error);
      throw error;
    }
  }

  /**
   * Get all active users from MongoDB
   */
  async getAllActiveUsers(): Promise<string[]> {
    try {
      if (!this.userMappingsCollection) {
        throw new Error("MongoDB not connected");
      }

      const activeUsers = await this.userMappingsCollection
        .find({ isActive: true })
        .project({ username: 1 })
        .toArray();

      return activeUsers.map((user) => user.username);
    } catch (error) {
      logger.error("❌ Failed to get active users from MongoDB:", error);
      throw error;
    }
  }

  /**
   * Update user mapping in MongoDB
   */
  async updateUserMapping(
    username: string,
    updates: Partial<UserVaultMapping>
  ): Promise<void> {
    try {
      if (!this.userMappingsCollection) {
        throw new Error("MongoDB not connected");
      }

      await this.userMappingsCollection.updateOne(
        { username },
        {
          $set: {
            ...updates,
            updatedAt: new Date(),
          },
        }
      );

      logger.info("✅ User mapping updated in MongoDB:", { username, updates });
    } catch (error) {
      logger.error("❌ Failed to update user mapping in MongoDB:", error);
      throw error;
    }
  }

  /**
   * Get or create user session with initialized services
   */
  async getUserSession(username: string): Promise<UserSession | null> {
    try {
      // Check if session already exists
      let session = this.userSessions.get(username);
      if (session) {
        return session;
      }

      // Get user vault mapping from MongoDB
      const userMapping = await this.getUserMapping(username);
      if (!userMapping || !userMapping.isActive) {
        logger.warn("User vault mapping not found or inactive:", { username });
        return null;
      }

      // Initialize services for this user using the delegated private key
      const provider = new ethers.JsonRpcProvider(config.rpc.url);
      const signer = new ethers.Wallet(config.wallet.privateKey, provider);

      // Initialize Enzyme service for this user's vault (using delegated permissions)
      const enzymeService = new EnzymeVaultService(provider, signer);

      // Initialize Game Engine service for this user's vault (using delegated permissions)
      const gameEngineConfig: GameEngineConfig = {
        apiKey: config.gameEngine.apiKey,
        baseUrl: config.gameEngine.baseUrl,
        rpcUrl: config.rpc.url,
        privateKey: config.wallet.privateKey, // Use delegated private key
        vaultAddress: userMapping.vaultAddress,
      };
      const gameEngineService = new GameEngineService(gameEngineConfig);
      await gameEngineService.init();

      // Create session
      session = {
        userId: username,
        username,
        vaultAddress: userMapping.vaultAddress,
        gameEngineService,
        enzymeService,
      };

      this.userSessions.set(username, session);

      logger.info("✅ User session created:", {
        username,
        vaultAddress: userMapping.vaultAddress,
      });

      return session;
    } catch (error) {
      logger.error("❌ Failed to create user session:", error);
      return null;
    }
  }

  /**
   * Remove user session
   */
  removeUserSession(username: string): void {
    this.userSessions.delete(username);
    logger.info("User session removed:", { username });
  }

  /**
   * Get all active users
   */
  async getActiveUsers(): Promise<string[]> {
    return await this.getAllActiveUsers();
  }

  /**
   * Get session stats
   */
  async getSessionStats() {
    const totalMappings =
      (await this.userMappingsCollection?.countDocuments()) || 0;
    const activeUsers = await this.getAllActiveUsers();

    return {
      totalMappings,
      activeSessions: this.userSessions.size,
      activeUsers: activeUsers.length,
    };
  }

  /**
   * API endpoint integration: Add user from Next.js app
   */
  async registerUserFromAPI(userData: {
    username: string;
    vaultAddress: string;
    email?: string;
    tradingSettings?: Partial<TradingSettings>;
  }): Promise<{ success: boolean; message: string }> {
    try {
      const mapping: UserVaultMapping = {
        username: userData.username,
        vaultAddress: userData.vaultAddress,
        isActive: true,
      };

      await this.saveUserMapping(mapping);

      // Optionally save trading settings
      if (userData.tradingSettings && this.tradingSettingsCollection) {
        await this.tradingSettingsCollection.replaceOne(
          { username: userData.username },
          {
            username: userData.username,
            ...userData.tradingSettings,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          { upsert: true }
        );
      }

      return {
        success: true,
        message: "User registered successfully for automated trading",
      };
    } catch (error) {
      logger.error("Failed to register user from API:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Registration failed",
      };
    }
  }

  /**
   * API endpoint integration: Update user settings
   */
  async updateUserSettings(
    username: string,
    settings: Partial<UserVaultMapping>
  ): Promise<{ success: boolean; message: string }> {
    try {
      const existingMapping = await this.getUserMapping(username);
      if (!existingMapping) {
        return {
          success: false,
          message: "User not found",
        };
      }

      await this.updateUserMapping(username, settings);

      // Remove existing session to force recreation with new settings
      this.removeUserSession(username);

      return {
        success: true,
        message: "User settings updated successfully",
      };
    } catch (error) {
      logger.error("Failed to update user settings:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Update failed",
      };
    }
  }

  /**
   * Get MongoDB collection stats for monitoring
   */
  async getCollectionStats() {
    try {
      if (!this.db) return null;

      const userMappingsStats = await this.db.command({
        collStats: "user_vault_mappings",
      });
      const tradingSignalsStats = await this.db.command({
        collStats: config.mongodb.collectionName,
      });

      return {
        userMappings: {
          count: userMappingsStats.count || 0,
          size: userMappingsStats.size || 0,
        },
        tradingSignals: {
          count: tradingSignalsStats.count || 0,
          size: tradingSignalsStats.size || 0,
        },
        database: config.mongodb.databaseName,
      };
    } catch (error) {
      logger.error("Failed to get collection stats:", error);
      return null;
    }
  }

  /**
   * Check connection status
   */
  isConnectedToMongoDB(): boolean {
    return this.isConnected;
  }
}
