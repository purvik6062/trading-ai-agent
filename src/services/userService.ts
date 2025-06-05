import {
  User,
  UserVaultMapping,
  UserSession,
  TradingSettings,
} from "../types/user";
import { GameEngineService, GameEngineConfig } from "./gameEngineService";
import { EnzymeVaultService } from "./enzymeService";
import { logger } from "../utils/logger";
import { ethers } from "ethers";
import { config } from "../config";

export class UserService {
  private userSessions: Map<string, UserSession> = new Map();
  private userVaultMappings: Map<string, UserVaultMapping> = new Map();

  constructor() {
    // In production, this would load from database
    this.loadUserMappings();
  }

  /**
   * Load user vault mappings from database (or config for now)
   * In production, this should query your Next.js app's database
   */
  private async loadUserMappings(): Promise<void> {
    try {
      // For now, we'll use a simple in-memory store
      // In production, this would be a database query

      // Example mapping - you'll replace this with actual database calls
      const defaultMapping: UserVaultMapping = {
        username: config.mongodb.targetSubscriber,
        vaultAddress: config.enzyme.vaultAddress,
        isActive: true,
      };

      this.userVaultMappings.set(defaultMapping.username, defaultMapping);

      logger.info("User vault mappings loaded:", {
        totalUsers: this.userVaultMappings.size,
      });
    } catch (error) {
      logger.error("Failed to load user vault mappings:", error);
    }
  }

  /**
   * Get user vault mapping by username
   */
  getUserVaultMapping(username: string): UserVaultMapping | null {
    return this.userVaultMappings.get(username) || null;
  }

  /**
   * Add or update user vault mapping
   */
  async addUserVaultMapping(mapping: UserVaultMapping): Promise<void> {
    try {
      this.userVaultMappings.set(mapping.username, mapping);

      // In production, save to database
      // await this.saveToDatabase(mapping);

      logger.info("User vault mapping added/updated:", {
        username: mapping.username,
        vaultAddress: mapping.vaultAddress,
        isActive: mapping.isActive,
      });
    } catch (error) {
      logger.error("Failed to add user vault mapping:", error);
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

      // Get user vault mapping
      const userMapping = this.getUserVaultMapping(username);
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
        userId: username, // In production, use actual user ID
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
  getActiveUsers(): string[] {
    return Array.from(this.userVaultMappings.entries())
      .filter(([_, mapping]) => mapping.isActive)
      .map(([username]) => username);
  }

  /**
   * Get user session stats
   */
  getSessionStats() {
    return {
      totalMappings: this.userVaultMappings.size,
      activeSessions: this.userSessions.size,
      activeUsers: this.getActiveUsers().length,
    };
  }

  /**
   * API endpoint integration: Add user from Next.js app
   * This is what your Next.js app would call
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

  /**
   * API endpoint integration: Update user settings
   */
  async updateUserSettings(
    username: string,
    settings: Partial<UserVaultMapping>
  ): Promise<{ success: boolean; message: string }> {
    try {
      const existingMapping = this.getUserVaultMapping(username);
      if (!existingMapping) {
        return {
          success: false,
          message: "User not found",
        };
      }

      const updatedMapping: UserVaultMapping = {
        ...existingMapping,
        ...settings,
      };

      await this.addUserVaultMapping(updatedMapping);

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
}
