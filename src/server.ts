import express from "express";
import { config, validateConfig } from "./config";
import { logger } from "./utils/logger";
import { GameEngineService } from "./services/gameEngineService";
import { SignalParser } from "./utils/signalParser";

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

  private setupMiddleware(): void {
    this.app.use(express.json({ limit: "10mb" }));
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging middleware
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get("User-Agent"),
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
    // Health check endpoint
    this.app.get("/health", (req, res) => {
      const status = this.gameEngineService.getStatus();
      res.json({
        success: true,
        status: "healthy",
        timestamp: new Date().toISOString(),
        gameEngine: status,
      });
    });

    // Process trading signal endpoint
    this.app.post("/signal", async (req, res) => {
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
    });

    // Get active positions endpoint
    this.app.get("/positions", (req, res) => {
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
    });

    // Manual signal parsing endpoint (for testing)
    this.app.post("/parse-signal", (req, res) => {
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
    });

    // Get system configuration endpoint
    this.app.get("/config", (req, res) => {
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
    });

    // Root endpoint
    this.app.get("/", (req, res) => {
      res.json({
        success: true,
        message: "Trading AI Agent API",
        version: "1.0.0",
        endpoints: [
          "GET /health - Health check",
          "POST /signal - Process trading signal",
          "GET /positions - Get active positions",
          "POST /parse-signal - Parse signal (testing)",
          "GET /config - Get system configuration",
        ],
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
  }

  async start(): Promise<void> {
    try {
      // Validate configuration
      validateConfig();
      logger.info("Configuration validated successfully");

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
