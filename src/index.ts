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

// Initialize services on startup
async function initializeServices() {
  try {
    logger.info("Initializing services...");

    // Initialize ethers provider and signer
    const provider = new ethers.JsonRpcProvider(config.rpc.url);
    const signer = new ethers.Wallet(config.wallet.privateKey, provider);

    // Initialize Enzyme service
    enzymeService = new EnzymeVaultService(provider, signer);

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
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    services: {
      enzyme: !!enzymeService,
      gameEngine: !!gameEngineService,
      coinGecko: !!coinGeckoService,
      trailingStop: !!trailingStopService,
    },
  });
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
  });
});

/**
 * Process a trading signal
 */
app.post("/signal", async (req, res) => {
  try {
    const { signal } = await req.body;

    if (!signal) {
      return res.status(400).json({ error: "Signal is required" });
    }

    logger.info("Received trading signal:", signal);

    // Parse the signal
    const parsedSignal = SignalParser.parseSignal(signal);

    if (!parsedSignal) {
      return res.status(400).json({ error: "Invalid signal format" });
    }

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
process.on("SIGINT", () => {
  logger.info("Received SIGINT, shutting down gracefully...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("Received SIGTERM, shutting down gracefully...");
  process.exit(0);
});

startServer();
