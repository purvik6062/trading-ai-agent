import {
  GameFunction,
  ExecutableGameFunctionResponse,
  ExecutableGameFunctionStatus,
  GameAgent,
  GameWorker,
} from "@virtuals-protocol/game";
import { config } from "../config";
import { logger } from "../utils/logger";
import { errorManager } from "../utils/errorManager";
import {
  TradingSignal,
  Position,
  PositionStatus,
  SignalType,
} from "../types/trading";
import { EnzymeVaultService, SwapStrategy } from "./enzymeService";
import { CoinGeckoService } from "./coinGeckoService";
import { TrailingStopService } from "./trailingStopService";
import { SignalParser } from "../utils/signalParser";
import { ethers } from "ethers";
import {
  MultiPositionManager,
  MultiPositionConfig,
} from "./multiPositionManager";

export interface GameEngineConfig {
  apiKey: string;
  baseUrl?: string;
  rpcUrl: string;
  privateKey: string;
  vaultAddress: string;
  multiPosition?: Partial<MultiPositionConfig>;
}

export class GameEngineService {
  private agent: GameAgent | null = null;
  private worker: GameWorker | null = null;
  private enzymeService: EnzymeVaultService;
  private coinGeckoService: CoinGeckoService;
  private trailingStopService: TrailingStopService;
  private multiPositionManager: MultiPositionManager;
  private provider: ethers.Provider;
  private signer: ethers.Signer;
  private vaultAddress: string;
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor(config: GameEngineConfig) {
    // Initialize ethers provider and signer
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.signer = new ethers.Wallet(config.privateKey, this.provider);
    this.vaultAddress = config.vaultAddress;

    // Initialize services
    this.enzymeService = new EnzymeVaultService(this.provider, this.signer);
    this.coinGeckoService = new CoinGeckoService();
    this.trailingStopService = new TrailingStopService();

    // Initialize multi-position manager
    this.multiPositionManager = new MultiPositionManager(
      this.enzymeService,
      this.coinGeckoService,
      config.multiPosition
    );
  }

  /**
   * Initialize the Game Engine agent and worker
   */
  async init(): Promise<void> {
    try {
      logger.info("🤖 GameEngine: Initializing service...");

      // Initialize multi-position manager with persistence recovery
      const recoveryResult = await this.multiPositionManager.init();
      logger.info("🔄 Position recovery completed", {
        totalRecovered: recoveryResult.totalRecovered,
        activePositions: recoveryResult.activePositions,
        expiredPositions: recoveryResult.expiredPositions,
      });

      // Create trading functions
      const tradingFunctions = this.createTradingFunctions();

      // Create worker
      this.worker = new GameWorker({
        id: "trading_worker",
        name: "Trading Execution Worker",
        description:
          "Specialized worker for executing trading operations using Enzyme Protocol with multi-position management",
        functions: tradingFunctions,
        getEnvironment: async () => {
          const vaultInfo = await this.enzymeService.getVaultData(
            this.vaultAddress
          );
          const activePositions =
            this.multiPositionManager.getActivePositions();
          const positionGroups = this.multiPositionManager.getPositionGroups();

          return {
            vault: vaultInfo,
            activePositions: activePositions.length,
            positionGroups: positionGroups.length,
            multiPositionStats: this.multiPositionManager.getStats(),
            trailingStopStats: this.trailingStopService.getTrailingStopStats(),
            walletAddress: await this.enzymeService.getWalletAddress(),
            timestamp: new Date().toISOString(),
            recoveryInfo: recoveryResult,
          };
        },
      });

      // Create agent
      this.agent = new GameAgent(config.gameEngine.apiKey, {
        name: "TradingAI Agent",
        goal: "Execute profitable trading strategies based on signals while managing multiple positions with advanced risk management",
        description: `
          I am an advanced AI trading agent specialized in cryptocurrency trading with multi-position management capabilities. 
          I analyze trading signals and execute trades through Enzyme Protocol vaults.
          
          My enhanced capabilities include:
          - Parsing and validating trading signals
          - Managing multiple concurrent positions per token
          - Handling conflicting signals (Buy vs Sell) intelligently
          - Executing buy and sell orders through Enzyme Protocol
          - Advanced position grouping and risk management
          - Managing positions with trailing stop strategies
          - Monitoring live token prices via CoinGecko
          - Sophisticated risk management and position sizing
          - Conflict resolution between opposing signals
          
          I follow a disciplined multi-position approach:
          - Handle multiple trades per token with different targets
          - Intelligently resolve conflicts between Buy and Sell signals
          - Implement position grouping for correlated trades
          - Execute partial exits based on individual or grouped targets
          - Maintain exposure limits and risk management rules
          - Provide detailed logs of all trading activities and position management
        `,
        getAgentState: async () => {
          return {
            activePositions: this.multiPositionManager.getActivePositions(),
            positionGroups: this.multiPositionManager.getPositionGroups(),
            multiPositionStats: this.multiPositionManager.getStats(),
            trailingStopStats: this.trailingStopService.getTrailingStopStats(),
            vaultInfo: await this.enzymeService.getVaultData(this.vaultAddress),
            lastUpdate: new Date().toISOString(),
          };
        },
        workers: [this.worker],
      });

      // Initialize agent with error handling for rate limits
      await this.initializeAgentWithRetry();

      // Start centralized position monitoring
      this.startCentralizedMonitoring();

      logger.info(
        "🤖 GameEngine: Service initialized successfully with multi-position management"
      );
    } catch (error) {
      errorManager.logError("gameengine-initialization", error, {
        operation: "init",
        vaultAddress: this.vaultAddress,
      });
      throw error;
    }
  }

  /**
   * Initialize agent with retry logic and rate limit handling
   */
  private async initializeAgentWithRetry(
    maxRetries: number = 5
  ): Promise<void> {
    let retryCount = 0;
    const baseDelay = 5000; // 5 seconds base delay

    while (retryCount < maxRetries) {
      try {
        await this.agent!.init();
        logger.info("🤖 GameEngine: Agent initialized successfully");
        return;
      } catch (error: any) {
        retryCount++;

        // Check if it's a rate limit error (429)
        const isRateLimit =
          error?.response?.status === 429 ||
          error?.status === 429 ||
          (error?.message && error.message.includes("Too Many Requests")) ||
          (error?.message && error.message.includes("429"));

        if (isRateLimit) {
          // Use error manager to suppress verbose 429 errors
          const logged = errorManager.logError(
            "gameengine-agent-rate-limit",
            error,
            {
              operation: "agent.init",
              retryCount,
              maxRetries,
            }
          );

          if (retryCount < maxRetries) {
            const delay = baseDelay * Math.pow(2, retryCount - 1); // Exponential backoff
            if (logged) {
              logger.warn(
                `🤖 GameEngine: Rate limited, retrying in ${delay}ms (attempt ${retryCount}/${maxRetries})`
              );
            }
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
        } else {
          // For non-rate-limit errors, log normally and rethrow
          errorManager.logError("gameengine-agent-init", error, {
            operation: "agent.init",
            retryCount,
          });
          throw error;
        }
      }
    }

    // If we get here, all retries failed
    const finalError = new Error(
      `Failed to initialize GameEngine agent after ${maxRetries} attempts due to rate limiting`
    );
    errorManager.logError("gameengine-agent-init-final-failure", finalError, {
      operation: "agent.init",
      maxRetries,
    });
    throw finalError;
  }

  /**
   * Execute agent step with retry logic for rate limits
   */
  private async executeAgentStepWithRetry(
    signalMessage: string,
    maxRetries: number = 3
  ): Promise<void> {
    let retryCount = 0;
    const baseDelay = 2000; // 2 seconds base delay

    while (retryCount < maxRetries) {
      try {
        await this.agent!.step();
        return;
      } catch (error: any) {
        retryCount++;

        // Check if it's a rate limit error (429)
        const isRateLimit =
          error?.response?.status === 429 ||
          error?.status === 429 ||
          (error?.message && error.message.includes("Too Many Requests")) ||
          (error?.message && error.message.includes("429"));

        if (isRateLimit) {
          // Use error manager to suppress verbose 429 errors
          const logged = errorManager.logError(
            "gameengine-agent-step-rate-limit",
            error,
            {
              operation: "agent.step",
              retryCount,
              maxRetries,
              signalMessage: signalMessage.substring(0, 100), // Truncate for logging
            }
          );

          if (retryCount < maxRetries) {
            const delay = baseDelay * retryCount; // Linear backoff for faster steps
            if (logged) {
              logger.warn(
                `🤖 GameEngine: Agent step rate limited, retrying in ${delay}ms (attempt ${retryCount}/${maxRetries})`
              );
            }
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
        } else {
          // For non-rate-limit errors, rethrow immediately
          throw error;
        }
      }
    }

    // If we get here, all retries failed due to rate limiting
    const finalError = new Error(
      `Agent step failed after ${maxRetries} attempts due to rate limiting`
    );
    errorManager.logError("gameengine-agent-step-final-failure", finalError, {
      operation: "agent.step",
      maxRetries,
      signalMessage: signalMessage.substring(0, 100),
    });
    throw finalError;
  }

  /**
   * Start centralized monitoring for all positions
   */
  private startCentralizedMonitoring(): void {
    // Monitor all positions every 60 seconds to reduce API rate limit hits
    this.monitoringInterval = setInterval(async () => {
      try {
        const stats = this.multiPositionManager.getStats();
        if (stats.totalPositions > 0) {
          logger.debug(
            `🤖 GameEngine: Monitoring ${stats.totalPositions} positions across ${stats.positionGroups} groups`
          );
          await this.multiPositionManager.monitorAllPositions();
        }
      } catch (error) {
        errorManager.logError("gameengine-monitoring", error, {
          operation: "centralizedMonitoring",
        });
      }
    }, 60000); // 60 seconds (increased from 30s to reduce rate limit hits)

    logger.info("🤖 GameEngine: Started centralized position monitoring", {
      interval: "60s",
    });
  }

  /**
   * Create trading functions for the worker
   */
  private createTradingFunctions(): GameFunction<any>[] {
    return [
      // Parse trading signal function
      new GameFunction({
        name: "parse_trading_signal",
        description: "Parse trading signal from text message and validate it",
        args: [
          {
            name: "message",
            type: "string",
            description: "Trading signal message to parse",
          },
        ] as const,
        executable: async (args, logger) => {
          try {
            const message = args.message as string;
            if (!message) {
              return new ExecutableGameFunctionResponse(
                ExecutableGameFunctionStatus.Failed,
                "Message parameter is required"
              );
            }

            const signals = SignalParser.parseMultipleSignals(message);

            if (signals.length === 0) {
              return new ExecutableGameFunctionResponse(
                ExecutableGameFunctionStatus.Failed,
                "No valid trading signals found in the message"
              );
            }

            const summaries = signals.map((signal) =>
              SignalParser.getSignalSummary(signal)
            );

            return new ExecutableGameFunctionResponse(
              ExecutableGameFunctionStatus.Done,
              `Successfully parsed ${signals.length} trading signal(s): ${summaries.join(", ")}`
            );
          } catch (error) {
            logger(`Error parsing trading signal: ${error}`);
            return new ExecutableGameFunctionResponse(
              ExecutableGameFunctionStatus.Failed,
              `Failed to parse trading signal: ${error instanceof Error ? error.message : "Unknown error"}`
            );
          }
        },
      }),

      // Execute trade entry function with multi-position support
      new GameFunction({
        name: "execute_trade_entry",
        description:
          "Execute trade entry based on trading signal with multi-position management",
        args: [
          {
            name: "signal",
            type: "object",
            description: "Parsed trading signal object",
          },
          {
            name: "positionSize",
            type: "number",
            description: "Position size in USD",
          },
        ] as const,
        executable: async (args, logger) => {
          try {
            const signal = args.signal as unknown as TradingSignal;
            const positionSize = Number(args.positionSize);

            // Validate position size
            if (
              positionSize < config.trading.minPositionSize ||
              positionSize > config.trading.maxPositionSize
            ) {
              return new ExecutableGameFunctionResponse(
                ExecutableGameFunctionStatus.Failed,
                `Position size ${positionSize} outside allowed range (${config.trading.minPositionSize}-${config.trading.maxPositionSize})`
              );
            }

            // Skip HOLD signals for execution
            if (signal.signal === SignalType.HOLD) {
              return new ExecutableGameFunctionResponse(
                ExecutableGameFunctionStatus.Done,
                "HOLD signal received - no entry execution required"
              );
            }

            // Use MultiPositionManager to handle the signal
            const result = await this.multiPositionManager.addSignal(
              signal,
              positionSize
            );

            if (!result.success) {
              return new ExecutableGameFunctionResponse(
                ExecutableGameFunctionStatus.Failed,
                result.message
              );
            }

            // Execute the actual trade if position was created
            if (result.position) {
              const tradeResult = await this.executeActualTrade(
                result.position,
                positionSize
              );

              if (tradeResult.success) {
                logger(
                  `🤖 GameEngine: Position created and trade executed - ID: ${result.position.id}, Total Active: ${this.multiPositionManager.getStats().totalPositions}`
                );

                return new ExecutableGameFunctionResponse(
                  ExecutableGameFunctionStatus.Done,
                  `${result.message}. Trade executed: ${signal.signal} ${signal.token} with size $${positionSize}. TX: ${tradeResult.txHash}`
                );
              } else {
                return new ExecutableGameFunctionResponse(
                  ExecutableGameFunctionStatus.Failed,
                  `Position created but trade execution failed: ${tradeResult.error}`
                );
              }
            }

            return new ExecutableGameFunctionResponse(
              ExecutableGameFunctionStatus.Done,
              result.message
            );
          } catch (error) {
            logger(`Error executing trade entry: ${error}`);
            return new ExecutableGameFunctionResponse(
              ExecutableGameFunctionStatus.Failed,
              `Failed to execute trade entry: ${error instanceof Error ? error.message : "Unknown error"}`
            );
          }
        },
      }),

      // Monitor positions function
      new GameFunction({
        name: "monitor_positions",
        description: "Monitor active positions across all position groups",
        args: [] as const,
        executable: async (args, logger) => {
          try {
            const stats = this.multiPositionManager.getStats();

            if (stats.totalPositions === 0) {
              return new ExecutableGameFunctionResponse(
                ExecutableGameFunctionStatus.Done,
                "No active positions to monitor"
              );
            }

            await this.multiPositionManager.monitorAllPositions();

            const summary = `Monitored ${stats.totalPositions} positions across ${stats.positionGroups} groups`;
            const details = `Total exposure: $${stats.totalExposure}`;

            return new ExecutableGameFunctionResponse(
              ExecutableGameFunctionStatus.Done,
              `${summary}. ${details}`
            );
          } catch (error) {
            logger(`Error monitoring positions: ${error}`);
            return new ExecutableGameFunctionResponse(
              ExecutableGameFunctionStatus.Failed,
              `Failed to monitor positions: ${error instanceof Error ? error.message : "Unknown error"}`
            );
          }
        },
      }),

      // Get position status function
      new GameFunction({
        name: "get_position_status",
        description: "Get detailed status of all positions and position groups",
        args: [] as const,
        executable: async (args, logger) => {
          try {
            const activePositions =
              this.multiPositionManager.getActivePositions();
            const positionGroups =
              this.multiPositionManager.getPositionGroups();
            const stats = this.multiPositionManager.getStats();

            const positionSummaries = activePositions.map((pos) => ({
              id: pos.id,
              token: pos.signal.token,
              signal: pos.signal.signal,
              status: pos.status,
              remainingAmount: pos.remainingAmount,
              targets: pos.signal.targets,
              currentPrice: pos.currentPrice,
            }));

            const groupSummaries = positionGroups.map((group) => ({
              token: group.token,
              positionCount: group.positions.length,
              totalExposure: group.totalExposure,
              exitStrategy: group.exitStrategy,
              status: group.status,
            }));

            return new ExecutableGameFunctionResponse(
              ExecutableGameFunctionStatus.Done,
              `Active Positions: ${JSON.stringify(positionSummaries, null, 2)}\n\nPosition Groups: ${JSON.stringify(groupSummaries, null, 2)}\n\nStats: ${JSON.stringify(stats, null, 2)}`
            );
          } catch (error) {
            logger(`Error getting position status: ${error}`);
            return new ExecutableGameFunctionResponse(
              ExecutableGameFunctionStatus.Failed,
              `Failed to get position status: ${error instanceof Error ? error.message : "Unknown error"}`
            );
          }
        },
      }),

      // Close specific position function
      new GameFunction({
        name: "close_position",
        description: "Close a specific position by ID",
        args: [
          {
            name: "positionId",
            type: "string",
            description: "Position ID to close",
          },
          {
            name: "reason",
            type: "string",
            description: "Reason for closing the position",
          },
        ] as const,
        executable: async (args, logger) => {
          try {
            const positionId = args.positionId as string;
            const reason = args.reason as string;

            const success = await this.multiPositionManager.closePosition(
              positionId,
              reason
            );

            if (success) {
              return new ExecutableGameFunctionResponse(
                ExecutableGameFunctionStatus.Done,
                `Successfully closed position ${positionId}. Reason: ${reason}`
              );
            } else {
              return new ExecutableGameFunctionResponse(
                ExecutableGameFunctionStatus.Failed,
                `Failed to close position ${positionId}`
              );
            }
          } catch (error) {
            logger(`Error closing position: ${error}`);
            return new ExecutableGameFunctionResponse(
              ExecutableGameFunctionStatus.Failed,
              `Failed to close position: ${error instanceof Error ? error.message : "Unknown error"}`
            );
          }
        },
      }),
    ];
  }

  /**
   * Execute the actual trade for a position
   */
  private async executeActualTrade(
    position: Position,
    positionSize: number
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      // Execute trade through Enzyme
      const swapParams: SwapStrategy = {
        fromTokenSymbol: "USDC",
        toTokenSymbol: position.signal.tokenMentioned,
        amountPercentage: positionSize,
        maxSlippage: 1.0,
      };

      const result = await this.enzymeService.executeAutomatedSwap(
        this.vaultAddress,
        swapParams
      );

      // Update position with execution details
      position.entryExecuted = true;
      position.status = PositionStatus.ACTIVE;
      position.entryTxHash = result.hash;
      position.actualEntryPrice = parseFloat(result.swapDetails.swapAmount);
      position.amountSwapped = parseFloat(result.swapDetails.swapAmount);
      position.tokenAmountReceived = parseFloat(
        result.swapDetails.expectedOutput
      );
      position.updatedAt = new Date();

      return {
        success: true,
        txHash: result.hash,
      };
    } catch (error) {
      logger.error(
        `Error executing actual trade for position ${position.id}:`,
        error
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Execute trade exit (legacy method for compatibility)
   */
  private async executeTradeExit(
    position: Position,
    exitPrice: number
  ): Promise<{ success: boolean; error?: string; txHash?: string }> {
    try {
      // Get current position size (simplified - in practice you'd track this)
      const signerAddress = await this.signer.getAddress();
      const tokenAddress: any = position.signal.tokenMentioned;

      // For now, we'll use a placeholder. In practice, you'd need to track the actual token holdings
      const swapParams: SwapStrategy = {
        fromTokenSymbol: tokenAddress,
        toTokenSymbol: "USDC",
        amountPercentage: 100, // Exit full position
        maxSlippage: 1.0,
      };

      const result = await this.enzymeService.executeAutomatedSwap(
        this.vaultAddress,
        swapParams
      );

      // Update position status
      position.exitExecuted = true;
      position.status = PositionStatus.CLOSED;
      position.updatedAt = new Date();

      logger.info(`Position ${position.id} closed at price ${exitPrice}`);

      return {
        success: true,
        txHash: result.hash,
      };
    } catch (error) {
      logger.error(
        `Error executing trade exit for position ${position.id}:`,
        error
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Process a signal message (parse and potentially execute)
   */
  async processSignal(signalMessage: string): Promise<void> {
    try {
      if (!this.agent) {
        throw new Error("Game Engine not initialized");
      }

      // Use rate limit handling for agent.step() calls
      await this.executeAgentStepWithRetry(signalMessage);

      logger.info("🤖 GameEngine: Signal processed");
    } catch (error) {
      errorManager.logError("gameengine-signal-processing", error, {
        operation: "processSignal",
        message: signalMessage,
      });
      throw error;
    }
  }

  /**
   * Run the trading engine continuously
   */
  async run(intervalSeconds: number = 60): Promise<void> {
    logger.info(`🤖 GameEngine: Starting continuous operation...`);

    setInterval(async () => {
      try {
        await this.multiPositionManager.monitorAllPositions();
      } catch (error) {
        errorManager.logError("gameengine-continuous-operation", error, {
          operation: "continuousMonitoring",
        });
      }
    }, intervalSeconds * 1000);
  }

  getStatus(): {
    initialized: boolean;
    activePositions: number;
    multiPositionStats: any;
  } {
    const stats = this.multiPositionManager.getStats();
    return {
      initialized: !!this.agent,
      activePositions: stats.totalPositions,
      multiPositionStats: stats,
    };
  }

  /**
   * Process a trading signal through the AI agent
   */
  async processTradingSignal(signal: TradingSignal): Promise<Position | null> {
    try {
      if (!this.agent) {
        throw new Error("Game Engine not initialized");
      }

      logger.info("🤖 GameEngine: Processing trading signal", {
        token: signal.token,
        signal: signal.signal,
        currentPrice: signal.currentPrice,
        targets: signal.targets,
      });

      // Use MultiPositionManager to handle the signal
      const result = await this.multiPositionManager.addSignal(
        signal,
        config.trading.minPositionSize
      );

      if (result.success && result.position) {
        // Execute the actual trade
        const tradeResult = await this.executeActualTrade(
          result.position,
          config.trading.minPositionSize
        );

        if (tradeResult.success) {
          logger.info("🤖 GameEngine: Signal processed and trade executed", {
            positionId: result.position.id,
            txHash: tradeResult.txHash,
          });
          return result.position;
        } else {
          logger.error("🤖 GameEngine: Trade execution failed", {
            error: tradeResult.error,
          });
        }
      } else {
        logger.warn("🤖 GameEngine: Signal not executed", {
          reason: result.message,
        });
      }

      return null;
    } catch (error) {
      errorManager.logError("gameengine-trading-signal", error, {
        operation: "processTradingSignal",
        token: signal?.token,
      });
      throw error;
    }
  }

  /**
   * Get current positions from MultiPositionManager
   */
  async getCurrentPositions(): Promise<Position[]> {
    return this.multiPositionManager.getActivePositions();
  }

  /**
   * Monitor positions using MultiPositionManager
   */
  async monitorPositions(positions: Position[]): Promise<void> {
    try {
      await this.multiPositionManager.monitorAllPositions();
    } catch (error) {
      logger.error("Error monitoring positions:", error);
      throw error;
    }
  }

  private getCoinGeckoId(symbol: string): string {
    // Map common symbols to CoinGecko IDs
    const symbolMap: Record<string, string> = {
      BTC: "bitcoin",
      ETH: "ethereum",
      USDC: "usd-coin",
      USDT: "tether",
      // Add more mappings as needed
    };

    return symbolMap[symbol.toUpperCase()] || symbol.toLowerCase();
  }

  /**
   * Get vault information
   */
  async getVaultInfo(): Promise<any> {
    try {
      return await this.enzymeService.getVaultData(this.vaultAddress);
    } catch (error) {
      logger.error("Error getting vault info:", error);
      throw error;
    }
  }

  /**
   * Get portfolio value
   */
  async getPortfolioValue(): Promise<number> {
    try {
      const vaultData = await this.enzymeService.getVaultData(
        this.vaultAddress
      );
      return parseFloat(vaultData.sharePrice);
    } catch (error) {
      logger.error("Error getting portfolio value:", error);
      return 0;
    }
  }
}
