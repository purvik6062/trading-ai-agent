import { UserVaultMapping, UserSession, TradingSettings } from "../types/user";
import { GameEngineService, GameEngineConfig } from "./gameEngineService";
import { EnzymeVaultService } from "./enzymeService";
import { logger } from "../utils/logger";
import { ethers } from "ethers";
import { config } from "../config";

// This is a placeholder for your actual database implementation
// Replace with your preferred database (PostgreSQL, MySQL, MongoDB, etc.)

export interface DatabaseUserService {
  // Database connection methods
  connect(): Promise<void>;
  disconnect(): Promise<void>;

  // User management methods
  saveUserMapping(mapping: UserVaultMapping): Promise<void>;
  getUserMapping(username: string): Promise<UserVaultMapping | null>;
  getAllActiveUsers(): Promise<string[]>;
  updateUserMapping(
    username: string,
    updates: Partial<UserVaultMapping>
  ): Promise<void>;
}

// Example implementation with PostgreSQL (replace with your preferred database)
export class PostgreSQLUserService implements DatabaseUserService {
  private pool: any; // Replace with actual database connection pool

  async connect(): Promise<void> {
    // TODO: Implement your database connection
    // Example:
    // this.pool = new Pool({
    //   connectionString: process.env.DATABASE_URL,
    // });
    logger.info("Database connected");
  }

  async disconnect(): Promise<void> {
    // TODO: Implement database disconnection
    // await this.pool.end();
    logger.info("Database disconnected");
  }

  async saveUserMapping(mapping: UserVaultMapping): Promise<void> {
    // TODO: Implement database save
    // Example:
    // await this.pool.query(
    //   'INSERT INTO user_vault_mappings (username, vault_address, is_active) VALUES ($1, $2, $3) ON CONFLICT (username) DO UPDATE SET vault_address = $2, is_active = $3',
    //   [mapping.username, mapping.vaultAddress, mapping.isActive]
    // );
    logger.info("User mapping saved to database", mapping);
  }

  async getUserMapping(username: string): Promise<UserVaultMapping | null> {
    // TODO: Implement database query
    // Example:
    // const result = await this.pool.query(
    //   'SELECT * FROM user_vault_mappings WHERE username = $1',
    //   [username]
    // );
    // return result.rows[0] || null;
    return null;
  }

  async getAllActiveUsers(): Promise<string[]> {
    // TODO: Implement database query
    // Example:
    // const result = await this.pool.query(
    //   'SELECT username FROM user_vault_mappings WHERE is_active = true'
    // );
    // return result.rows.map(row => row.username);
    return [];
  }

  async updateUserMapping(
    username: string,
    updates: Partial<UserVaultMapping>
  ): Promise<void> {
    // TODO: Implement database update
    logger.info("User mapping updated in database", { username, updates });
  }
}

// Production-ready UserService that uses database
export class ProductionUserService {
  private userSessions: Map<string, UserSession> = new Map();
  private dbService: DatabaseUserService;

  constructor(dbService: DatabaseUserService) {
    this.dbService = dbService;
  }

  async init(): Promise<void> {
    await this.dbService.connect();
    logger.info("Production UserService initialized with database");
  }

  async getUserVaultMapping(
    username: string
  ): Promise<UserVaultMapping | null> {
    return await this.dbService.getUserMapping(username);
  }

  async addUserVaultMapping(mapping: UserVaultMapping): Promise<void> {
    await this.dbService.saveUserMapping(mapping);
    logger.info("User vault mapping added to database:", {
      username: mapping.username,
      vaultAddress: mapping.vaultAddress,
      isActive: mapping.isActive,
    });
  }

  async getUserSession(username: string): Promise<UserSession | null> {
    try {
      // Check if session already exists
      let session = this.userSessions.get(username);
      if (session) {
        return session;
      }

      // Get user vault mapping from database
      const userMapping = await this.getUserVaultMapping(username);
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

      logger.info("User session created:", {
        username,
        vaultAddress: userMapping.vaultAddress,
      });

      return session;
    } catch (error) {
      logger.error("Failed to create user session:", error);
      return null;
    }
  }

  removeUserSession(username: string): void {
    this.userSessions.delete(username);
    logger.info("User session removed:", { username });
  }

  async getActiveUsers(): Promise<string[]> {
    return await this.dbService.getAllActiveUsers();
  }

  getSessionStats() {
    return {
      activeSessions: this.userSessions.size,
      // totalMappings and activeUsers would need to be queried from database
    };
  }

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

      await this.addUserVaultMapping(mapping);

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

  async updateUserSettings(
    username: string,
    settings: Partial<UserVaultMapping>
  ): Promise<{ success: boolean; message: string }> {
    try {
      const existingMapping = await this.getUserVaultMapping(username);
      if (!existingMapping) {
        return {
          success: false,
          message: "User not found",
        };
      }

      await this.dbService.updateUserMapping(username, settings);

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

  async stop(): Promise<void> {
    await this.dbService.disconnect();
    logger.info("Production UserService stopped");
  }
}
