import { SignalListenerService } from "./signalListenerService";
import { MongoUserService } from "./mongoUserService";
import { TrailingStopService } from "./trailingStopService";
import { logger } from "../utils/logger";
import { TradingSignal } from "../types/trading";
import { SignalParser } from "../utils/signalParser";

interface ProcessedSignalData {
  token: string;
  signal: string;
  currentPrice: number;
  targets: number[];
  stopLoss: number;
  timeline: string;
  maxExitTime: string;
  tradeTip: string;
  tweet_id: string;
  tweet_link: string;
  tweet_timestamp: string;
  priceAtTweet: number;
  exitValue: null | number;
  twitterHandle: string;
  tokenMentioned: string;
  tokenId: string;
}

interface TradingSignalDocument {
  _id: string;
  tweet_id: string;
  twitterHandle: string;
  coin: string;
  signal_data: ProcessedSignalData;
  subscribers: Array<{
    username: string;
    sent: boolean;
  }>;
}

export class MultiUserSignalService {
  private userService: MongoUserService;
  private trailingStopService: TrailingStopService;
  private signalListenerService: SignalListenerService;

  constructor(
    userService: MongoUserService,
    trailingStopService: TrailingStopService
  ) {
    this.userService = userService;
    this.trailingStopService = trailingStopService;

    // Initialize signal listener with multi-user callback
    this.signalListenerService = new SignalListenerService(
      this.processMultiUserSignal.bind(this)
    );
  }

  /**
   * Initialize the multi-user signal service
   */
  async init(): Promise<void> {
    try {
      await this.signalListenerService.connect();
      await this.signalListenerService.startListening();
      logger.info("✅ Multi-user signal service initialized");
    } catch (error) {
      logger.error("❌ Failed to initialize multi-user signal service:", error);
      throw error;
    }
  }

  /**
   * Process trading signal for multiple users
   * This replaces the single-user processMongoSignal function
   */
  private async processMultiUserSignal(
    signalData: ProcessedSignalData,
    subscribers: Array<{ username: string; sent: boolean }>
  ): Promise<void> {
    try {
      logger.info("🚀 Processing multi-user trading signal:", {
        token: signalData.tokenMentioned,
        signal: signalData.signal,
        currentPrice: signalData.currentPrice,
        twitterHandle: signalData.twitterHandle,
        tweet_id: signalData.tweet_id,
        subscribersCount: subscribers.length,
        subscribers: subscribers.map((s) => s.username),
      });

      // Convert signal data to TradingSignal format
      const parsedSignal: TradingSignal = {
        token: signalData.token,
        tokenId: signalData.tokenId,
        signal: signalData.signal,
        currentPrice: signalData.currentPrice,
        targets: signalData.targets,
        stopLoss: signalData.stopLoss,
        timeline: signalData.timeline,
        maxExitTime: signalData.maxExitTime,
        tradeTip: signalData.tradeTip,
        tweet_id: signalData.tweet_id,
        tweet_link: signalData.tweet_link,
        tweet_timestamp: signalData.tweet_timestamp,
        twitterHandle: signalData.twitterHandle,
        priceAtTweet: signalData.priceAtTweet,
        tokenMentioned: signalData.tokenMentioned,
      };

      // Get all active users who have registered vaults
      const registeredUsers = await this.userService.getActiveUsers();

      // Filter subscribers to only include those who have registered vaults
      const subscribersWithVaults = subscribers
        .map((s) => s.username)
        .filter((username) => registeredUsers.includes(username));

      logger.info("📊 Processing signal for users with registered vaults:", {
        totalSubscribers: subscribers.length,
        registeredUsers: registeredUsers.length,
        usersWithVaults: subscribersWithVaults.length,
        usersToProcess: subscribersWithVaults,
      });

      if (subscribersWithVaults.length === 0) {
        logger.warn(
          "⚠️ No subscribers have registered vaults - signal will not be processed",
          {
            subscriberUsernames: subscribers.map((s) => s.username),
            registeredUsernames: registeredUsers,
          }
        );
        return;
      }

      // Process signal for each user with registered vault
      const userPromises = subscribersWithVaults.map((username) =>
        this.processSignalForUser(username, parsedSignal)
      );

      const results = await Promise.allSettled(userPromises);

      // Log results
      let successCount = 0;
      let errorCount = 0;

      results.forEach((result, index) => {
        const username = subscribersWithVaults[index];
        if (result.status === "fulfilled") {
          successCount++;
          logger.info(
            `✅ Signal processed for user: ${username}`,
            result.value
          );
        } else {
          errorCount++;
          logger.error(
            `❌ Signal processing failed for user: ${username}`,
            result.reason
          );
        }
      });

      logger.info("📈 Multi-user signal processing completed:", {
        totalSubscribers: subscribers.length,
        usersWithVaults: subscribersWithVaults.length,
        successful: successCount,
        failed: errorCount,
        signal: signalData.signal,
        token: signalData.tokenMentioned,
      });
    } catch (error) {
      logger.error("❌ Error in multi-user signal processing:", error);
      throw error;
    }
  }

  /**
   * Process trading signal for a specific user
   */
  private async processSignalForUser(
    username: string,
    signal: TradingSignal
  ): Promise<{
    username: string;
    traded: boolean;
    positionId?: string;
    reason?: string;
  }> {
    try {
      logger.info(`🎯 Processing signal for user: ${username}`, {
        token: signal.tokenMentioned,
        signal: signal.signal,
      });

      // Get user session (this will create services if needed)
      const userSession = await this.userService.getUserSession(username);

      if (!userSession) {
        const reason =
          "User session could not be created (inactive or invalid vault)";
        logger.warn(`⚠️ ${reason}:`, { username });
        return { username, traded: false, reason };
      }

      // Process signal with user's Game Engine AI
      const position =
        await userSession.gameEngineService.processTradingSignal(signal);

      if (position) {
        // Add to trailing stop monitoring
        this.trailingStopService.addPosition(position);

        logger.info(`✅ Trade executed for user: ${username}`, {
          positionId: position.id,
          status: position.status,
          entryPrice: position.actualEntryPrice,
          amountSwapped: position.amountSwapped,
          vaultAddress: userSession.vaultAddress,
        });

        return {
          username,
          traded: true,
          positionId: position.id,
        };
      } else {
        const reason = "AI decided not to trade";
        logger.info(`✅ Signal processed for user: ${username}, but ${reason}`);
        return { username, traded: false, reason };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error(`❌ Error processing signal for user: ${username}:`, error);
      return { username, traded: false, reason: errorMessage };
    }
  }

  /**
   * Get service status
   */
  async getStatus() {
    return {
      signalListener: this.signalListenerService.getStatus(),
      userStats: await this.userService.getSessionStats(),
    };
  }

  /**
   * Stop the service
   */
  async stop(): Promise<void> {
    try {
      await this.signalListenerService.stopListening();
      await this.signalListenerService.disconnect();
      logger.info("✅ Multi-user signal service stopped");
    } catch (error) {
      logger.error("❌ Error stopping multi-user signal service:", error);
      throw error;
    }
  }

  /**
   * Manually process a signal for testing (affects all active users)
   */
  async processManualSignal(signalData: any): Promise<void> {
    // For manual testing, create a subscribers array with all active users
    const activeUsers = await this.userService.getActiveUsers();
    const subscribers = activeUsers.map((username) => ({
      username,
      sent: false,
    }));

    logger.info("🧪 Manual signal processing initiated", {
      activeUsersCount: activeUsers.length,
      activeUsers,
    });

    await this.processMultiUserSignal(signalData, subscribers);
  }

  /**
   * Process signal for a specific user only (for testing)
   */
  async processSignalForSpecificUser(
    username: string,
    signal: TradingSignal
  ): Promise<{
    username: string;
    traded: boolean;
    positionId?: string;
    reason?: string;
  }> {
    return this.processSignalForUser(username, signal);
  }
}
