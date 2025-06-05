import { SignalListenerService } from "./signalListenerService";
import { UserService } from "./userService";
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
  private userService: UserService;
  private trailingStopService: TrailingStopService;
  private signalListenerService: SignalListenerService;

  constructor(
    userService: UserService,
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
    signalData: ProcessedSignalData
  ): Promise<void> {
    try {
      logger.info("🚀 Processing multi-user trading signal:", {
        token: signalData.tokenMentioned,
        signal: signalData.signal,
        currentPrice: signalData.currentPrice,
        twitterHandle: signalData.twitterHandle,
        tweet_id: signalData.tweet_id,
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

      // Get all active users who should receive this signal
      const activeUsers = this.userService.getActiveUsers();

      logger.info(
        `📊 Processing signal for ${activeUsers.length} active users`
      );

      // Process signal for each user in parallel
      const userPromises = activeUsers.map((username) =>
        this.processSignalForUser(username, parsedSignal)
      );

      const results = await Promise.allSettled(userPromises);

      // Log results
      let successCount = 0;
      let errorCount = 0;

      results.forEach((result, index) => {
        const username = activeUsers[index];
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
        totalUsers: activeUsers.length,
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
  getStatus() {
    return {
      signalListener: this.signalListenerService.getStatus(),
      userStats: this.userService.getSessionStats(),
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
   * Manually process a signal for testing (affects all users)
   */
  async processManualSignal(signalData: any): Promise<void> {
    await this.processMultiUserSignal(signalData);
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
