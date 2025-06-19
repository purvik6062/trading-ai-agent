import express from "express";
import { config } from "./config";
import { logger, serializeForAPI } from "./utils/logger";
import { EnzymeVaultService } from "./services/enzymeService";
import {
  GameEngineService,
  GameEngineConfig,
} from "./services/gameEngineService";
import { CoinGeckoService } from "./services/coinGeckoService";
import { TrailingStopService } from "./services/trailingStopService";
import { SignalParser } from "./utils/signalParser";
import { TradingSignal, SignalType } from "./types/trading";
import { SignalListenerService } from "./services/signalListenerService";
import { MongoUserService } from "./services/mongoUserService";
import { MultiUserSignalService } from "./services/multiUserSignalService";
import { errorManager } from "./utils/errorManager";
import { ethers } from "ethers";

const app = express();
const PORT = config.server.port || 3000;

// Middleware
app.use(express.json());

// Initialize services
let enzymeService: EnzymeVaultService;
let gameEngineService: GameEngineService;
let coinGeckoService: CoinGeckoService;
let trailingStopService: TrailingStopService;
let signalParser: SignalParser;
let signalListenerService: SignalListenerService;

// Multi-user services
let userService: MongoUserService;
let multiUserSignalService: MultiUserSignalService;

/**
 * Process a trading signal from MongoDB - integrates with existing game engine service
 */
async function processMongoSignal(signalData: any): Promise<void> {
  try {
    logger.info("🚀 Processing MongoDB trading signal:", {
      token: signalData.tokenMentioned,
      signal: signalData.signal,
      currentPrice: signalData.currentPrice,
      targets: signalData.targets,
      stopLoss: signalData.stopLoss,
      twitterHandle: signalData.twitterHandle,
      tweet_id: signalData.tweet_id,
    });

    // Convert MongoDB signal data to TradingSignal format
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

    // Process signal with Game Engine AI (same as REST endpoint)
    const position = await gameEngineService.processTradingSignal(parsedSignal);

    if (position) {
      // Add to trailing stop monitoring
      trailingStopService.addPosition(position);

      logger.info("✅ MongoDB signal processed and trade executed:", {
        positionId: position.id,
        status: position.status,
        entryPrice: position.actualEntryPrice,
        amountSwapped: position.amountSwapped,
      });
    } else {
      logger.info(
        "✅ MongoDB signal processed but no trade executed (AI decision)"
      );
    }
  } catch (error) {
    logger.error("❌ Error processing MongoDB signal:", error);
    throw error;
  }
}

// Initialize services on startup
async function initializeServices() {
  try {
    logger.info("Initializing services...");

    // Initialize ethers provider and signer
    const provider = new ethers.JsonRpcProvider(config.rpc.url);
    const signer = new ethers.Wallet(config.wallet.privateKey, provider);

    // Initialize Enzyme service (legacy single-user - using env vault address)
    enzymeService = new EnzymeVaultService(
      provider,
      signer,
      config.enzyme.vaultAddress
    );

    // Initialize Game Engine service
    const gameEngineConfig: GameEngineConfig = {
      apiKey: config.gameEngine.apiKey,
      baseUrl: config.gameEngine.baseUrl,
      rpcUrl: config.rpc.url,
      privateKey: config.wallet.privateKey,
      vaultAddress: config.enzyme.vaultAddress,
    };
    gameEngineService = new GameEngineService(gameEngineConfig);
    await gameEngineService.init();

    // Initialize other services
    coinGeckoService = new CoinGeckoService();
    trailingStopService = new TrailingStopService();
    signalParser = new SignalParser();

    // Initialize Multi-user services
    userService = new MongoUserService();
    await userService.connect();

    // Initialize Multi-user Signal Service (replaces single-user signal listener)
    if (config.mongodb.uri) {
      multiUserSignalService = new MultiUserSignalService(
        userService,
        trailingStopService
      );
      await multiUserSignalService.init();
      logger.info("✅ Multi-user Signal Service initialized and listening");
    } else {
      logger.warn(
        "⚠️ MongoDB URI not configured, multi-user signal service disabled"
      );
    }

    logger.info("All services initialized successfully");
  } catch (error) {
    logger.error("Failed to initialize services:", error);
    process.exit(1);
  }
}

// Routes

/**
 * Health check endpoint
 */
app.get("/health", async (req, res) => {
  try {
    const multiUserServiceStatus = multiUserSignalService
      ? await multiUserSignalService.getStatus()
      : null;

    const userServiceStats = userService
      ? await userService.getSessionStats()
      : null;

    const errorSummary = errorManager.getErrorSummary();

    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      services: {
        enzyme: !!enzymeService,
        gameEngine: !!gameEngineService,
        coinGecko: !!coinGeckoService,
        trailingStop: !!trailingStopService,
        multiUserSignal: {
          enabled: !!multiUserSignalService,
          connected: multiUserServiceStatus?.signalListener?.connected || false,
          listening: multiUserServiceStatus?.signalListener?.listening || false,
          activeUsers: multiUserServiceStatus?.userStats?.activeUsers || 0,
          totalMappings: multiUserServiceStatus?.userStats?.totalMappings || 0,
          activeSessions:
            multiUserServiceStatus?.userStats?.activeSessions || 0,
        },
        userService: {
          enabled: !!userService,
          connected: userService?.isConnectedToMongoDB() || false,
          stats: userServiceStats,
        },
      },
      errorStats: {
        totalUniqueErrors: errorSummary.totalUniqueErrors,
        totalSuppressed: errorSummary.totalSuppressed,
        recentErrors: errorSummary.topErrors.slice(0, 3), // Show top 3 errors
      },
    });
  } catch (error) {
    logger.error("Health check error:", error);
    res.status(500).json({
      status: "unhealthy",
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Get system configuration
 */
app.get("/config", (req, res) => {
  res.json({
    vaultAddress: config.enzyme.vaultAddress,
    network: "Arbitrum",
    gameEngine: {
      enabled: !!config.gameEngine.apiKey,
      baseUrl: config.gameEngine.baseUrl,
    },
    trailingStop: {
      enabled: config.trailingStop.enabled,
      percentage: config.trailingStop.percentage,
    },
    multiUserSignal: {
      enabled: !!config.mongodb.uri,
      database: config.mongodb.databaseName,
      collection: config.mongodb.collectionName,
      userService: {
        enabled: !!userService,
        stats: userService ? userService.getSessionStats() : null,
      },
    },
  });
});

/**
 * Process a trading signal
 */
app.post("/signal", async (req, res) => {
  try {
    const { signal, signal_data } = await req.body;

    if (!signal && !signal_data) {
      return res.status(400).json({
        error: "Either 'signal' (string) or 'signal_data' (object) is required",
      });
    }

    logger.info("Received trading signal:", {
      type: signal_data ? "object" : "string",
      data: signal_data || signal,
    });

    let parsedSignal: TradingSignal | null = null;

    // Handle new object format
    if (signal_data) {
      parsedSignal = SignalParser.parseSignalObject(signal_data);
    }
    // Handle legacy string format
    else if (signal) {
      parsedSignal = SignalParser.parseSignal(signal);
    }

    if (!parsedSignal) {
      return res.status(400).json({ error: "Invalid signal format" });
    }

    logger.info("Signal parsed successfully:", {
      token: parsedSignal.token,
      tokenId: parsedSignal.tokenId,
      signal: parsedSignal.signal,
      maxExitTime: parsedSignal.maxExitTime,
    });

    // Process signal with Game Engine AI
    const position = await gameEngineService.processTradingSignal(parsedSignal);

    if (position) {
      // Add to trailing stop monitoring
      trailingStopService.addPosition(position);

      res.json({
        success: true,
        message: "Signal processed and trade executed",
        position: {
          id: position.id,
          signal: position.signal,
          status: position.status,
          createdAt: position.createdAt,
          entryTxHash: position.entryTxHash,
          actualEntryPrice: position.actualEntryPrice,
          amountSwapped: position.amountSwapped,
        },
      });
    } else {
      res.json({
        success: true,
        message: "Signal processed but no trade executed (AI decision)",
      });
    }
  } catch (error) {
    logger.error("Error processing signal:", error);
    res.status(500).json({
      error: "Failed to process signal",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Get active positions
 */
app.get("/positions", async (req, res) => {
  try {
    const positions = await gameEngineService.getCurrentPositions();
    const trailingStopPositions = trailingStopService.getActivePositions();

    const responseData = {
      vault: positions,
      trailingStop: trailingStopPositions,
      total: positions.length + trailingStopPositions.length,
    };

    res.json(serializeForAPI(responseData));
  } catch (error) {
    logger.error("Error getting positions:", error);
    res.status(500).json({
      error: "Failed to get positions",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Parse signal for testing
 */
app.post("/parse-signal", async (req, res) => {
  try {
    const { signal } = await req.body;

    if (!signal) {
      return res.status(400).json({ error: "Signal is required" });
    }

    const parsedSignal = SignalParser.parseSignal(signal);

    res.json({
      success: !!parsedSignal,
      parsed: parsedSignal,
      raw: signal,
    });
  } catch (error) {
    logger.error("Error parsing signal:", error);
    res.status(500).json({
      error: "Failed to parse signal",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Get vault information
 */
app.get("/vault", async (req, res) => {
  try {
    const vaultInfo = await gameEngineService.getVaultInfo();
    const portfolioValue = await gameEngineService.getPortfolioValue();

    const responseData = {
      ...vaultInfo,
      portfolioValue,
      timestamp: new Date().toISOString(),
    };

    // Safely serialize the data to handle BigInt values
    res.json(serializeForAPI(responseData));
  } catch (error) {
    logger.error("Error getting vault info:", error);
    res.status(500).json({
      error: "Failed to get vault info",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Manual trade execution endpoint (for testing)
 */
app.post("/trade", async (req, res) => {
  try {
    const { fromToken, toToken, amountPercentage, maxSlippage } = req.body;

    if (!fromToken || !toToken || !amountPercentage) {
      return res.status(400).json({
        error: "fromToken, toToken, and amountPercentage are required",
      });
    }

    const swapStrategy = {
      fromTokenSymbol: fromToken,
      toTokenSymbol: toToken,
      amountPercentage: parseFloat(amountPercentage),
      maxSlippage: maxSlippage ? parseFloat(maxSlippage) : 1.0,
    };

    const result = await enzymeService.executeAutomatedSwap(
      config.enzyme.vaultAddress,
      swapStrategy
    );

    const responseData = {
      success: true,
      transaction: result,
      swapDetails: result.swapDetails,
    };

    res.json(serializeForAPI(responseData));
  } catch (error) {
    logger.error("Error executing manual trade:", error);
    res.status(500).json({
      error: "Failed to execute trade",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Register a user for automated trading (called by Next.js app)
 */
app.post("/users/register", async (req, res) => {
  try {
    const { username, vaultAddress, email, tradingSettings } = req.body;

    if (!username || !vaultAddress) {
      return res.status(400).json({
        error: "username and vaultAddress are required",
      });
    }

    const result = await userService.registerUserFromAPI({
      username,
      vaultAddress,
      email,
      tradingSettings,
    });

    res.json(result);
  } catch (error) {
    logger.error("Error registering user:", error);
    res.status(500).json({
      error: "Failed to register user",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Update user settings
 */
app.put("/users/:username/settings", async (req, res) => {
  try {
    const { username } = req.params;
    const settings = req.body;

    const result = await userService.updateUserSettings(username, settings);
    res.json(result);
  } catch (error) {
    logger.error("Error updating user settings:", error);
    res.status(500).json({
      error: "Failed to update user settings",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Get user information
 */
app.get("/users/:username", async (req, res) => {
  try {
    const { username } = req.params;

    const userMapping = await userService.getUserMapping(username);
    if (!userMapping) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    // Return user data (no private key to exclude since we don't store it)
    res.json({
      success: true,
      user: userMapping,
    });
  } catch (error) {
    logger.error("Error getting user information:", error);
    res.status(500).json({
      error: "Failed to get user information",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Get all active users
 */
app.get("/users", async (req, res) => {
  try {
    const activeUsers = await userService.getActiveUsers();
    const sessionStats = await userService.getSessionStats();

    res.json({
      success: true,
      users: activeUsers,
      stats: sessionStats,
    });
  } catch (error) {
    logger.error("Error getting users:", error);
    res.status(500).json({
      error: "Failed to get users",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Get user's vault information
 */
app.get("/users/:username/vault", async (req, res) => {
  try {
    const { username } = req.params;

    const userSession = await userService.getUserSession(username);
    if (!userSession) {
      return res.status(404).json({
        error: "User session not found or inactive",
      });
    }

    const vaultInfo = await userSession.gameEngineService.getVaultInfo();
    const portfolioValue =
      await userSession.gameEngineService.getPortfolioValue();

    const responseData = {
      username,
      vaultAddress: userSession.vaultAddress,
      vaultInfo,
      portfolioValue,
      timestamp: new Date().toISOString(),
    };

    res.json(serializeForAPI(responseData));
  } catch (error) {
    logger.error("Error getting user vault info:", error);
    res.status(500).json({
      error: "Failed to get user vault info",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Get user's positions
 */
app.get("/users/:username/positions", async (req, res) => {
  try {
    const { username } = req.params;

    const userSession = await userService.getUserSession(username);
    if (!userSession) {
      return res.status(404).json({
        error: "User session not found or inactive",
      });
    }

    const positions = await userSession.gameEngineService.getCurrentPositions();

    const responseData = {
      username,
      vaultAddress: userSession.vaultAddress,
      positions,
      total: positions.length,
      timestamp: new Date().toISOString(),
    };

    res.json(serializeForAPI(responseData));
  } catch (error) {
    logger.error("Error getting user positions:", error);
    res.status(500).json({
      error: "Failed to get user positions",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Recover positions from persistence (admin endpoint)
 */
app.post("/admin/recovery/positions", async (req, res) => {
  try {
    if (!multiUserSignalService) {
      return res.status(503).json({
        error: "Multi-user signal service not available",
      });
    }

    // Force reinitialize all position managers to recover positions
    const activeUsers = await userService.getActiveUsers();
    const recoveryResults: any[] = [];

    for (const username of activeUsers) {
      try {
        const userSession = await userService.getUserSession(username);
        if (userSession) {
          const gameEngine = userSession.gameEngineService;
          const multiPositionManager = (gameEngine as any).multiPositionManager;

          if (
            multiPositionManager &&
            multiPositionManager.getPersistenceService
          ) {
            const persistenceService =
              multiPositionManager.getPersistenceService();
            const userRecovery =
              await persistenceService.recoverActivePositions();
            recoveryResults.push({
              username,
              ...userRecovery,
            });
          }
        }
      } catch (error) {
        recoveryResults.push({
          username,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    res.json({
      success: true,
      message: "Position recovery completed",
      users: activeUsers.length,
      results: recoveryResults,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Error in position recovery:", error);
    res.status(500).json({
      error: "Failed to recover positions",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Get position recovery status and statistics
 */
app.get("/admin/recovery/status", async (req, res) => {
  try {
    if (!userService) {
      return res.status(503).json({
        error: "User service not available",
      });
    }

    const activeUsers = await userService.getActiveUsers();
    const userStats: any[] = [];

    for (const username of activeUsers) {
      try {
        const userSession = await userService.getUserSession(username);
        if (userSession) {
          const gameEngine = userSession.gameEngineService;
          const multiPositionManager = (gameEngine as any).multiPositionManager;

          if (
            multiPositionManager &&
            multiPositionManager.getPersistenceService
          ) {
            const persistenceService =
              multiPositionManager.getPersistenceService();
            const userPositions =
              await persistenceService.getUserActivePositions(username);
            const positionStats = await persistenceService.getPositionStats();

            userStats.push({
              username,
              vaultAddress: userSession.vaultAddress,
              activePositions: userPositions.length,
              positionStats,
            });
          }
        }
      } catch (error) {
        userStats.push({
          username,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    res.json({
      success: true,
      totalUsers: activeUsers.length,
      userStats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Error getting recovery status:", error);
    res.status(500).json({
      error: "Failed to get recovery status",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Get user's persisted positions
 */
app.get("/users/:username/positions/persisted", async (req, res) => {
  try {
    const { username } = req.params;

    const userSession = await userService.getUserSession(username);
    if (!userSession) {
      return res.status(404).json({
        error: "User session not found or inactive",
      });
    }

    const gameEngine = userSession.gameEngineService;
    const multiPositionManager = (gameEngine as any).multiPositionManager;

    if (!multiPositionManager || !multiPositionManager.getPersistenceService) {
      return res.status(503).json({
        error: "Position persistence not available",
      });
    }

    const persistenceService = multiPositionManager.getPersistenceService();
    const persistedPositions =
      await persistenceService.getUserActivePositions(username);
    const positionStats = await persistenceService.getPositionStats();

    res.json({
      success: true,
      username,
      vaultAddress: userSession.vaultAddress,
      persistedPositions,
      stats: positionStats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Error getting user persisted positions:", error);
    res.status(500).json({
      error: "Failed to get persisted positions",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Process signal for specific user (testing endpoint)
 */
app.post("/users/:username/signal", async (req, res) => {
  try {
    const { username } = req.params;
    const { signal, signal_data } = req.body;

    if (!signal && !signal_data) {
      return res.status(400).json({
        error: "Either 'signal' (string) or 'signal_data' (object) is required",
      });
    }

    let parsedSignal: TradingSignal | null = null;

    if (signal_data) {
      parsedSignal = SignalParser.parseSignalObject(signal_data);
    } else if (signal) {
      parsedSignal = SignalParser.parseSignal(signal);
    }

    if (!parsedSignal) {
      return res.status(400).json({ error: "Invalid signal format" });
    }

    const result = await multiUserSignalService.processSignalForSpecificUser(
      username,
      parsedSignal
    );

    res.json({
      success: true,
      result,
    });
  } catch (error) {
    logger.error("Error processing signal for user:", error);
    res.status(500).json({
      error: "Failed to process signal for user",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Error management endpoints
 */
app.get("/admin/errors/summary", (req, res) => {
  try {
    const summary = errorManager.getErrorSummary();
    res.json({
      success: true,
      ...summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Error getting error summary:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.get("/admin/errors/stats", (req, res) => {
  try {
    const stats = errorManager.getErrorStats();
    const statsArray = Array.from(stats.entries()).map(([key, count]) => ({
      errorKey: key,
      ...count,
    }));

    res.json({
      success: true,
      errors: statsArray,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Error getting error stats:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.post("/admin/errors/cleanup", (req, res) => {
  try {
    const { olderThanMinutes = 60 } = req.body;
    errorManager.cleanup(olderThanMinutes);

    res.json({
      success: true,
      message: `Cleaned up errors older than ${olderThanMinutes} minutes`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Error cleaning up errors:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Global error handler
app.use(
  (
    error: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    logger.error("Unhandled error:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    });
  }
);

// Start server
async function startServer() {
  try {
    await initializeServices();

    app.listen(PORT, () => {
      logger.info(`🚀 Trading AI Agent server started on port ${PORT}`);
      logger.info(`📊 Health check: http://localhost:${PORT}/health`);
      logger.info(`🔧 Configuration: http://localhost:${PORT}/config`);
      logger.info(`💰 Vault address: ${config.enzyme.vaultAddress}`);
    });
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
async function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  try {
    // Cleanup multi-user signal service
    if (multiUserSignalService) {
      await multiUserSignalService.stop();
      logger.info("✅ Multi-user signal service stopped");
    }

    logger.info("👋 Graceful shutdown completed");
    process.exit(0);
  } catch (error) {
    logger.error("❌ Error during shutdown:", error);
    process.exit(1);
  }
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

startServer();
