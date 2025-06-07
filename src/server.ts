import express from "express";
import { config, validateConfig } from "./config";
import { logger } from "./utils/logger";
import { GameEngineService } from "./services/gameEngineService";
import { SignalParser } from "./utils/signalParser";
import {
  authenticateApiKey,
  requireAdmin,
  requireTrading,
  requireReadOnly,
  requireHealthCheck,
  authErrorHandler,
} from "./middleware/advancedAuth";
import { ApiKeyManager, ApiKeyType } from "./models/ApiKey";
import { RateLimitService } from "./services/rateLimitService";

export class TradingAgentServer {
  private app: express.Application;
  private gameEngineService: GameEngineService;

  constructor() {
    this.app = express();

    // Initialize Game Engine service with proper config
    const gameEngineConfig = {
      apiKey: config.gameEngine.apiKey,
      baseUrl: config.gameEngine.baseUrl,
      rpcUrl: config.rpc.url,
      privateKey: config.wallet.privateKey,
      vaultAddress: config.enzyme.vaultAddress,
    };
    this.gameEngineService = new GameEngineService(gameEngineConfig);

    this.setupMiddleware();
    this.setupRoutes();
  }

  private async initializeSecurity(): Promise<void> {
    if (!config.apiSecurity.enabled) {
      logger.warn(
        "⚠️  API Security is DISABLED. This is not recommended for production!"
      );
      return;
    }

    try {
      // Initialize MongoDB API Key Manager
      await ApiKeyManager.initialize(
        config.mongodb.uri || "",
        config.mongodb.databaseName
      );

      // Initialize Redis Rate Limiting Service
      await RateLimitService.initialize(process.env.REDIS_URL);

      // Create initial API keys if they don't exist (for development/testing)
      if (config.server.nodeEnv === "development") {
        await this.createInitialApiKeys();
      }

      logger.info(
        "✅ Advanced security system initialized with MongoDB + Redis"
      );
    } catch (error) {
      logger.error("❌ Failed to initialize security system:", error);
      if (config.server.nodeEnv === "production") {
        process.exit(1);
      } else {
        logger.warn("⚠️  Continuing without security in development mode");
      }
    }
  }

  private async createInitialApiKeys(): Promise<void> {
    try {
      const apiKeyManager = ApiKeyManager.getInstance();

      // Check if admin key from config exists, if not create initial keys
      if (config.apiSecurity.keys.admin) {
        const existingKeys = await apiKeyManager.listKeys({ limit: 1 });
        if (existingKeys.length === 0) {
          logger.info("Creating initial API keys for development...");

          // Create admin key
          if (config.apiSecurity.keys.admin) {
            // This would be handled differently in production
            logger.info("Using configured API keys from environment");
          }
        }
      }
    } catch (error) {
      logger.warn("Could not create initial API keys:", error);
    }
  }

  private setupMiddleware(): void {
    // Basic middleware
    this.app.use(express.json({ limit: "10mb" }));
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging middleware
    this.app.use((req, res, next) => {
      const apiKeyInfo = (req as any).apiKey;
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get("User-Agent"),
        apiKeyType: apiKeyInfo?.type,
        apiKeyName: apiKeyInfo?.name,
        body: req.method === "POST" ? req.body : undefined,
      });
      next();
    });

    // Error handling middleware
    this.app.use(
      (
        error: Error,
        req: express.Request,
        res: express.Response,
        next: express.NextFunction
      ) => {
        logger.error("Express error:", error);
        res.status(500).json({
          success: false,
          error: "Internal server error",
          message:
            config.server.nodeEnv === "development"
              ? error.message
              : "Something went wrong",
        });
      }
    );
  }

  private setupRoutes(): void {
    // Health check endpoint (minimal authentication required)
    this.app.get(
      "/health",
      config.apiSecurity.enabled
        ? requireHealthCheck
        : (req, res, next) => next(),
      (req, res) => {
        const status = this.gameEngineService.getStatus();
        res.json({
          success: true,
          status: "healthy",
          timestamp: new Date().toISOString(),
          gameEngine: status,
        });
      }
    );

    // Process trading signal endpoint (requires trading permission)
    this.app.post(
      "/signal",
      config.apiSecurity.enabled ? requireTrading : (req, res, next) => next(),
      async (req, res) => {
        try {
          const { message } = req.body;

          if (!message || typeof message !== "string") {
            return res.status(400).json({
              success: false,
              error: "Missing or invalid message parameter",
            });
          }

          logger.info("Received trading signal:", {
            messageLength: message.length,
          });

          // Parse the signal first for validation
          const signals = SignalParser.parseMultipleSignals(message);

          if (signals.length === 0) {
            return res.status(400).json({
              success: false,
              error: "No valid trading signals found in the message",
            });
          }

          // Process through Game Engine
          await this.gameEngineService.processSignal(message);

          const summaries = signals.map((signal) =>
            SignalParser.getSignalSummary(signal)
          );

          res.json({
            success: true,
            message: "Trading signal processed successfully",
            signalsFound: signals.length,
            signals: summaries,
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          logger.error("Error processing trading signal:", error);
          res.status(500).json({
            success: false,
            error: "Failed to process trading signal",
            message: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
    );

    // Get active positions endpoint (requires read permission)
    this.app.get(
      "/positions",
      config.apiSecurity.enabled ? requireReadOnly : (req, res, next) => next(),
      (req, res) => {
        try {
          const status = this.gameEngineService.getStatus();
          res.json({
            success: true,
            ...status,
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          logger.error("Error getting positions:", error);
          res.status(500).json({
            success: false,
            error: "Failed to get positions",
          });
        }
      }
    );

    // Manual signal parsing endpoint (for testing - admin only)
    this.app.post(
      "/parse-signal",
      config.apiSecurity.enabled ? requireAdmin : (req, res, next) => next(),
      (req, res) => {
        try {
          const { message } = req.body;

          if (!message || typeof message !== "string") {
            return res.status(400).json({
              success: false,
              error: "Missing or invalid message parameter",
            });
          }

          const signals = SignalParser.parseMultipleSignals(message);

          if (signals.length === 0) {
            return res.status(400).json({
              success: false,
              error: "No valid trading signals found in the message",
            });
          }

          res.json({
            success: true,
            signalsFound: signals.length,
            signals: signals.map((signal) => ({
              summary: SignalParser.getSignalSummary(signal),
              formatted: SignalParser.formatSignal(signal),
              raw: signal,
            })),
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          logger.error("Error parsing signal:", error);
          res.status(500).json({
            success: false,
            error: "Failed to parse signal",
            message: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
    );

    // Get system configuration endpoint (requires config read permission)
    this.app.get(
      "/config",
      config.apiSecurity.enabled ? requireReadOnly : (req, res, next) => next(),
      (req, res) => {
        res.json({
          success: true,
          config: {
            trading: config.trading,
            server: {
              port: config.server.port,
              nodeEnv: config.server.nodeEnv,
            },
            enzyme: {
              vaultAddress: config.enzyme.vaultAddress,
              // Don't expose sensitive data like private keys
            },
          },
          timestamp: new Date().toISOString(),
        });
      }
    );

    // Root endpoint (public information)
    this.app.get("/", (req, res) => {
      res.json({
        success: true,
        message: "Trading AI Agent API",
        version: "1.0.0",
        security: config.apiSecurity.enabled
          ? "API Key Required"
          : "Open Access",
        endpoints: [
          "GET /health - Health check (requires health:read)",
          "POST /signal - Process trading signal (requires signal:process)",
          "GET /positions - Get active positions (requires positions:read)",
          "POST /parse-signal - Parse signal testing (requires admin)",
          "GET /config - Get system configuration (requires config:read)",
        ],
        authentication: config.apiSecurity.enabled
          ? {
              type: "API Key",
              header: "X-API-Key",
              note: "Contact admin for API key access",
            }
          : {
              type: "None",
              note: "API is currently open access",
            },
        timestamp: new Date().toISOString(),
      });
    });

    // 404 handler
    this.app.use("*", (req, res) => {
      res.status(404).json({
        success: false,
        error: "Endpoint not found",
        path: req.originalUrl,
      });
    });

    // Auth error handler (must be after routes)
    this.app.use(authErrorHandler);
  }

  async start(): Promise<void> {
    try {
      // Validate configuration
      validateConfig();
      logger.info("Configuration validated successfully");

      // Initialize security system
      await this.initializeSecurity();

      // Initialize Game Engine service
      await this.gameEngineService.init();
      logger.info("Game Engine service initialized");

      // Start the server
      const server = this.app.listen(config.server.port, () => {
        logger.info(
          `Trading AI Agent server started on port ${config.server.port}`
        );
        logger.info(`Environment: ${config.server.nodeEnv}`);
        logger.info("Available endpoints:");
        logger.info("  GET  /health - Health check");
        logger.info("  POST /signal - Process trading signal");
        logger.info("  GET  /positions - Get active positions");
        logger.info("  POST /parse-signal - Parse signal (testing)");
        logger.info("  GET  /config - Get system configuration");
      });

      // Graceful shutdown
      const gracefulShutdown = (signal: string) => {
        logger.info(`Received ${signal}, shutting down gracefully...`);
        server.close(() => {
          logger.info("Server closed");
          process.exit(0);
        });
      };

      process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
      process.on("SIGINT", () => gracefulShutdown("SIGINT"));

      // Start the Game Engine agent in continuous mode
      if (config.server.nodeEnv === "production") {
        logger.info("Starting Game Engine agent in continuous mode...");
        // Run the agent every 60 seconds
        this.gameEngineService.run(60).catch((error) => {
          logger.error("Error running Game Engine agent:", error);
        });
      }
    } catch (error) {
      logger.error("Failed to start server:", error);
      process.exit(1);
    }
  }
}
