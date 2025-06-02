import {
  GameFunction,
  ExecutableGameFunctionResponse,
  ExecutableGameFunctionStatus,
  GameAgent,
  GameWorker,
} from "@virtuals-protocol/game";
import { config } from "../config";
import { logger } from "../utils/logger";
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

export interface GameEngineConfig {
  apiKey: string;
  baseUrl?: string;
  rpcUrl: string;
  privateKey: string;
  vaultAddress: string;
}

export class GameEngineService {
  private agent: GameAgent | null = null;
  private worker: GameWorker | null = null;
  private enzymeService: EnzymeVaultService;
  private coinGeckoService: CoinGeckoService;
  private trailingStopService: TrailingStopService;
  private activePositions: Map<string, Position> = new Map();
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
  }

  /**
   * Initialize the Game Engine agent and worker
   */
  async init(): Promise<void> {
    try {
      logger.info("🤖 GameEngine: Initializing service...");

      // Create trading functions
      const tradingFunctions = this.createTradingFunctions();

      // Create worker
      this.worker = new GameWorker({
        id: "trading_worker",
        name: "Trading Execution Worker",
        description:
          "Specialized worker for executing trading operations using Enzyme Protocol",
        functions: tradingFunctions,
        getEnvironment: async () => {
          const vaultInfo = await this.enzymeService.getVaultData(
            this.vaultAddress
          );
          const activePositions = this.trailingStopService.getActivePositions();

          return {
            vault: vaultInfo,
            activePositions: activePositions.length,
            trailingStopStats: this.trailingStopService.getTrailingStopStats(),
            walletAddress: await this.enzymeService.getWalletAddress(),
            timestamp: new Date().toISOString(),
          };
        },
      });

      // Create agent
      this.agent = new GameAgent(config.gameEngine.apiKey, {
        name: "TradingAI Agent",
        goal: "Execute profitable trading strategies based on signals while managing risk through trailing stops and proper position sizing",
        description: `
          I am an AI trading agent specialized in cryptocurrency trading. I analyze trading signals and execute trades through Enzyme Protocol vaults.
          
          My capabilities include:
          - Parsing and validating trading signals
          - Executing buy and sell orders through Enzyme Protocol
          - Managing positions with trailing stop strategies
          - Monitoring live token prices via CoinGecko
          - Risk management and position sizing
          
          I follow a disciplined approach:
          - Only execute trades for valid signals with proper risk management
          - Implement trailing stops after TP1 is hit
          - Monitor positions continuously for exit conditions
          - Maintain detailed logs of all trading activities
        `,
        getAgentState: async () => {
          return {
            activePositions: Array.from(this.activePositions.values()),
            totalPositions: this.activePositions.size,
            trailingStopStats: this.trailingStopService.getTrailingStopStats(),
            vaultInfo: await this.enzymeService.getVaultData(this.vaultAddress),
            lastUpdate: new Date().toISOString(),
          };
        },
        workers: [this.worker],
      });

      await this.agent.init();

      // Start centralized position monitoring
      this.startCentralizedMonitoring();

      logger.info(
        "🤖 GameEngine: Service initialized successfully with centralized monitoring"
      );
    } catch (error) {
      logger.error("🤖 GameEngine: Error initializing service:", error);
      throw error;
    }
  }

  /**
   * Start centralized monitoring for all positions
   */
  private startCentralizedMonitoring(): void {
    // Monitor all positions every 30 seconds
    this.monitoringInterval = setInterval(async () => {
      try {
        if (this.activePositions.size > 0) {
          logger.debug(
            `🤖 GameEngine: Monitoring ${this.activePositions.size} active positions`
          );
          await this.monitorAllPositions();
        }
      } catch (error) {
        logger.error("🤖 GameEngine: Error in centralized monitoring:", error);
      }
    }, 30000); // 30 seconds

    logger.info("🤖 GameEngine: Started centralized position monitoring", {
      interval: "30s",
    });
  }

  /**
   * Monitor all active positions efficiently
   */
  private async monitorAllPositions(): Promise<void> {
    const positions = Array.from(this.activePositions.values());
    const uniqueTokenIds = [...new Set(positions.map((p) => p.signal.tokenId))];

    try {
      // Fetch all token prices in one API call for efficiency
      const tokenPrices =
        await this.coinGeckoService.getMultipleTokenPrices(uniqueTokenIds);
      const priceMap = new Map(
        tokenPrices.map((price) => [price.id, price.current_price])
      );

      // Check each position
      for (const position of positions) {
        const currentPrice = priceMap.get(position.signal.tokenId);
        if (currentPrice) {
          await this.checkPositionExitConditions(position, currentPrice);

          // Also check for target hits using trailing stop service
          const exitCondition = this.trailingStopService.updatePrice(
            position.id,
            currentPrice
          );

          if (exitCondition.shouldExit) {
            if (exitCondition.isPartialExit) {
              logger.info(
                `🎯 Target ${exitCondition.targetHit} hit! Executing partial exit (${exitCondition.exitPercentage}%)`,
                {
                  positionId: position.id,
                  token: position.signal.token,
                  targetPrice:
                    position.signal.targets[exitCondition.targetHit! - 1],
                  currentPrice,
                  exitPercentage: exitCondition.exitPercentage,
                }
              );

              await this.executePartialExit(
                position,
                exitCondition.exitPercentage!,
                currentPrice,
                exitCondition.targetHit!
              );
            } else {
              logger.info(`🚪 Full exit triggered: ${exitCondition.reason}`, {
                positionId: position.id,
                token: position.signal.token,
                currentPrice,
              });

              await this.executeFullExit(
                position,
                currentPrice,
                exitCondition.reason!
              );
            }
          }
        } else {
          logger.warn(
            `🤖 GameEngine: No price data for ${position.signal.tokenId}`
          );
        }
      }
    } catch (error) {
      logger.error("🤖 GameEngine: Error monitoring positions:", error);
    }
  }

  /**
   * Execute partial exit when a target is hit
   */
  private async executePartialExit(
    position: Position,
    exitPercentage: number,
    exitPrice: number,
    targetHit: number
  ): Promise<void> {
    try {
      // Calculate amount to exit
      const amountToExit =
        (position.remainingAmount || position.tokenAmountReceived || 0) *
        (exitPercentage / 100);

      if (amountToExit <= 0) {
        logger.warn(
          "🚨 Cannot execute partial exit: insufficient remaining amount"
        );
        return;
      }

      // Extract token symbol for the exit trade
      const tokenMatch = position.signal.token.match(/^([A-Z]+)/);
      const tokenSymbol = tokenMatch
        ? tokenMatch[1]
        : position.signal.tokenMentioned || "UNKNOWN";

      // Execute partial swap back to USDC
      const swapStrategy = {
        fromTokenSymbol: tokenSymbol,
        toTokenSymbol: "USDC",
        amountPercentage: exitPercentage,
        maxSlippage: 1.0,
      };

      const result = await this.enzymeService.executeAutomatedSwap(
        this.vaultAddress,
        swapStrategy
      );

      // Update position tracking
      position.remainingAmount = (position.remainingAmount || 0) - amountToExit;
      position.updatedAt = new Date();

      // Add to exit history
      const targetExit = {
        targetIndex: targetHit - 1,
        targetPrice: position.signal.targets[targetHit - 1],
        actualExitPrice: exitPrice,
        amountExited: amountToExit,
        percentage: exitPercentage,
        timestamp: new Date(),
        txHash: result.hash,
      };

      if (!position.targetExitHistory) position.targetExitHistory = [];
      position.targetExitHistory.push(targetExit);

      logger.info(`🎯 Partial exit executed successfully!`, {
        positionId: position.id,
        targetHit,
        exitPercentage,
        amountExited: amountToExit,
        remainingAmount: position.remainingAmount,
        txHash: result.hash,
      });

      // If remaining amount is very small, close the position
      if (position.remainingAmount < 0.01 || exitPercentage >= 100) {
        position.status = PositionStatus.CLOSED;
        position.exitExecuted = true;
        position.exitTxHash = result.hash;
        this.activePositions.delete(position.id);

        logger.info(`🏁 Position fully closed after target exits`, {
          positionId: position.id,
        });
      }
    } catch (error) {
      logger.error(
        `🚨 Error executing partial exit for position ${position.id}:`,
        error
      );
    }
  }

  /**
   * Execute full exit of a position
   */
  private async executeFullExit(
    position: Position,
    exitPrice: number,
    reason: string
  ): Promise<void> {
    try {
      const exitResult = await this.executeTradeExit(position, exitPrice);

      if (exitResult.success) {
        position.status = reason.includes("time")
          ? PositionStatus.EXPIRED
          : PositionStatus.CLOSED;
        position.exitTxHash = exitResult.txHash;
        position.exitExecuted = true;
        position.updatedAt = new Date();

        // Remove from active positions
        this.activePositions.delete(position.id);

        logger.info(`🏁 Full exit executed successfully`, {
          positionId: position.id,
          reason,
          exitPrice,
          txHash: exitResult.txHash,
        });
      } else {
        logger.error(
          `🚨 Full exit failed for position ${position.id}:`,
          exitResult.error
        );
      }
    } catch (error) {
      logger.error(
        `🚨 Error executing full exit for position ${position.id}:`,
        error
      );
    }
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

      // Execute trade entry function
      new GameFunction({
        name: "execute_trade_entry",
        description: "Execute trade entry based on trading signal",
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

            // Execute trade through Enzyme
            const swapParams: SwapStrategy = {
              fromTokenSymbol: "USDC",
              toTokenSymbol: signal.token,
              amountPercentage: positionSize,
              maxSlippage: 1.0,
            };

            const result = await this.enzymeService.executeAutomatedSwap(
              this.vaultAddress,
              swapParams
            );

            // Create position object with enhanced tracking
            const position: Position = {
              id: `pos_${Date.now()}`,
              signal,
              trailingStop: TrailingStopService.createTrailingStopConfig(
                signal.targets?.length || 2,
                undefined,
                undefined // Use default exit percentages for now
              ),
              currentPrice: parseFloat(result.swapDetails.expectedOutput),
              entryExecuted: true,
              exitExecuted: false,
              status: PositionStatus.ACTIVE,
              createdAt: new Date(),
              updatedAt: new Date(),
              entryTxHash: result.hash,
              actualEntryPrice: parseFloat(result.swapDetails.swapAmount),
              amountSwapped: parseFloat(result.swapDetails.swapAmount),
              tokenAmountReceived: parseFloat(
                result.swapDetails.expectedOutput
              ),
              remainingAmount: parseFloat(result.swapDetails.expectedOutput), // Initially 100% remaining
              targetExitHistory: [], // No exits yet
            };

            // Add to active positions tracking
            this.activePositions.set(position.id, position);

            logger(
              `🤖 GameEngine: Position created and added to monitoring - ID: ${position.id}, Max Exit: ${signal.maxExitTime}, Total Active: ${this.activePositions.size}`
            );

            return new ExecutableGameFunctionResponse(
              ExecutableGameFunctionStatus.Done,
              `Trade entry executed: ${signal.signal} ${signal.token} with size $${positionSize}. TX: ${result.hash}`
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
        description: "Monitor active positions and update trailing stops",
        args: [] as const,
        executable: async (args, logger) => {
          try {
            const activePositions =
              this.trailingStopService.getActivePositions();

            if (activePositions.length === 0) {
              return new ExecutableGameFunctionResponse(
                ExecutableGameFunctionStatus.Done,
                "No active positions to monitor"
              );
            }

            let exitCount = 0;
            const monitorResults: string[] = [];

            for (const position of activePositions) {
              // Get current price
              const tokenPrice = await this.coinGeckoService.getTokenPrice(
                position.signal.token
              );

              if (!tokenPrice) {
                monitorResults.push(
                  `Failed to get price for ${position.signal.token}`
                );
                continue;
              }

              // Update trailing stop
              const exitCondition = this.trailingStopService.updatePrice(
                position.id,
                tokenPrice.current_price
              );

              if (exitCondition.shouldExit) {
                // Execute exit
                const exitResult = await this.executeTradeExit(
                  position,
                  exitCondition.exitPrice!
                );

                if (exitResult.success) {
                  exitCount++;
                  monitorResults.push(
                    `Exit executed for ${position.signal.token}: ${exitCondition.reason}`
                  );
                } else {
                  monitorResults.push(
                    `Exit failed for ${position.signal.token}: ${exitResult.error}`
                  );
                }
              } else {
                monitorResults.push(
                  `${position.signal.token}: $${tokenPrice.current_price} (monitoring)`
                );
              }
            }

            const summary = `Monitored ${activePositions.length} positions, executed ${exitCount} exits`;
            const details =
              monitorResults.length > 0
                ? `\nDetails: ${monitorResults.join(", ")}`
                : "";

            return new ExecutableGameFunctionResponse(
              ExecutableGameFunctionStatus.Done,
              summary + details
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

      // Get market data function
      new GameFunction({
        name: "get_market_data",
        description: "Get current market data for specified tokens",
        args: [
          {
            name: "tokenIds",
            type: "array",
            description: "Array of CoinGecko token IDs",
          },
        ] as const,
        executable: async (args, logger) => {
          try {
            const tokenIds = args.tokenIds as unknown as string[];
            if (!Array.isArray(tokenIds)) {
              return new ExecutableGameFunctionResponse(
                ExecutableGameFunctionStatus.Failed,
                "tokenIds must be an array"
              );
            }

            const prices =
              await this.coinGeckoService.getMultipleTokenPrices(tokenIds);

            if (prices.length === 0) {
              return new ExecutableGameFunctionResponse(
                ExecutableGameFunctionStatus.Failed,
                "No market data retrieved for the specified tokens"
              );
            }

            const priceInfo = prices
              .map(
                (price) =>
                  `${price.symbol.toUpperCase()}: $${price.current_price} (${price.price_change_percentage_24h >= 0 ? "+" : ""}${price.price_change_percentage_24h.toFixed(2)}%)`
              )
              .join(", ");

            return new ExecutableGameFunctionResponse(
              ExecutableGameFunctionStatus.Done,
              `Market data retrieved: ${priceInfo}`
            );
          } catch (error) {
            logger(`Error getting market data: ${error}`);
            return new ExecutableGameFunctionResponse(
              ExecutableGameFunctionStatus.Failed,
              `Failed to get market data: ${error instanceof Error ? error.message : "Unknown error"}`
            );
          }
        },
      }),
    ];
  }

  /**
   * Execute trade exit
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

      this.trailingStopService.updatePositionStatus(
        position.id,
        PositionStatus.CLOSED
      );
      this.activePositions.delete(position.id);

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
   * Process trading signal
   */
  async processSignal(signalMessage: string): Promise<void> {
    if (!this.agent) {
      throw new Error("Game Engine not initialized");
    }

    logger.info("Processing trading signal through Game Engine agent");

    // The agent will use its functions to parse and execute the signal
    await this.agent.step();
  }

  /**
   * Run the agent continuously
   */
  async run(intervalSeconds: number = 60): Promise<void> {
    if (!this.agent) {
      throw new Error("Game Engine not initialized");
    }

    logger.info(`Starting Game Engine agent with ${intervalSeconds}s interval`);
    await this.agent.run(intervalSeconds, { verbose: true });
  }

  /**
   * Get agent status
   */
  getStatus(): {
    initialized: boolean;
    activePositions: number;
    trailingStopStats: any;
  } {
    return {
      initialized: this.agent !== null,
      activePositions: this.activePositions.size,
      trailingStopStats: this.trailingStopService.getTrailingStopStats(),
    };
  }

  /**
   * Process a trading signal using AI decision making
   */
  async processTradingSignal(signal: TradingSignal): Promise<Position | null> {
    try {
      logger.info("🤖 GameEngine: Processing trading signal", {
        type: signal.signal,
        token: signal.token,
        tokenId: signal.tokenId,
        currentPrice: signal.currentPrice,
        targets: signal.targets,
        maxExitTime: signal.maxExitTime,
      });

      // Get current price for context using tokenId for CoinGecko
      const currentPrice = await this.coinGeckoService.getTokenPrice(
        signal.tokenId
      );

      // Create AI context for decision making
      const aiContext = {
        signal,
        currentPrice,
        marketData: {
          symbol: signal.token,
          tokenId: signal.tokenId,
          price: currentPrice?.current_price || signal.currentPrice,
          timestamp: new Date().toISOString(),
        },
      };

      logger.info("🤖 GameEngine: Making AI decision...", {
        currentMarketPrice: currentPrice?.current_price,
        signalPrice: signal.currentPrice,
        priceChange24h: currentPrice?.price_change_percentage_24h,
      });

      // Use Game Engine AI to make trading decision
      const decision = await this.makeAIDecision(aiContext);

      logger.info("🤖 GameEngine: AI Decision made", {
        shouldExecute: decision.shouldExecute,
        reason: decision.reason,
        confidence: decision.confidence,
      });

      if (!decision.shouldExecute) {
        logger.info(
          "🤖 GameEngine: AI decided not to execute trade:",
          decision.reason
        );
        return null;
      }

      // Execute the trade based on signal type
      logger.info("🤖 GameEngine: Executing trade...");
      return await this.executeTrade(signal, decision);
    } catch (error) {
      logger.error("🤖 GameEngine: Error processing trading signal:", error);
      throw error;
    }
  }

  /**
   * Make AI decision on whether to execute trade
   */
  private async makeAIDecision(
    context: any
  ): Promise<{ shouldExecute: boolean; reason: string; confidence: number }> {
    try {
      // This would use the actual Game Engine AI API
      // For now, implementing basic logic that would be enhanced with AI
      const { signal, currentPrice } = context;

      logger.debug("🤖 GameEngine: Analyzing signal...", {
        signalType: signal.signal,
        targets: signal.targets,
        stopLoss: signal.stopLoss,
        maxExitTime: signal.maxExitTime,
      });

      // Basic decision logic (would be replaced with actual AI)
      if (signal.signal.toLowerCase() === "hold") {
        return {
          shouldExecute: false,
          reason: "Signal indicates HOLD position",
          confidence: 0.8,
        };
      }

      // Check if maxExitTime is too soon (less than 1 hour from now)
      const exitTime = new Date(signal.maxExitTime);
      const now = new Date();
      const hoursUntilExit =
        (exitTime.getTime() - now.getTime()) / (1000 * 60 * 60);

      if (hoursUntilExit < 0.1) {
        return {
          shouldExecute: false,
          reason: `Max exit time too soon: ${hoursUntilExit.toFixed(2)} hours`,
          confidence: 0.9,
        };
      }

      // Check if we have valid price targets
      if (signal.targets && signal.targets.length > 0 && signal.stopLoss) {
        const currentMarketPrice =
          currentPrice?.current_price || signal.currentPrice;
        const firstTarget = signal.targets[0];
        const potentialGain =
          ((firstTarget - currentMarketPrice) / currentMarketPrice) * 100;

        logger.debug("🤖 GameEngine: Potential gain analysis", {
          currentMarketPrice,
          firstTarget,
          potentialGain: potentialGain.toFixed(2) + "%",
        });

        if (potentialGain > 3) {
          // Minimum 3% gain threshold
          return {
            shouldExecute: true,
            reason: `Potential gain of ${potentialGain.toFixed(2)}% meets threshold`,
            confidence: 0.85,
          };
        }
      }

      return {
        shouldExecute: false,
        reason: "Insufficient potential gain or missing price targets",
        confidence: 0.6,
      };
    } catch (error) {
      logger.error("🤖 GameEngine: Error in AI decision making:", error);
      return {
        shouldExecute: false,
        reason: "AI decision error",
        confidence: 0.0,
      };
    }
  }

  /**
   * Execute a trade based on the signal and AI decision
   */
  private async executeTrade(
    signal: TradingSignal,
    decision: any
  ): Promise<Position> {
    try {
      logger.info("🤖 GameEngine: Preparing trade execution...", {
        signal: signal.signal,
        token: signal.token,
        tokenId: signal.tokenId,
      });

      // Extract token symbol from token field (e.g., "COS (contentos)" -> "COS")
      const tokenMatch = signal.token.match(/^([A-Z]+)/);
      // const tokenSymbol = tokenMatch
      //   ? tokenMatch[1]
      //   : signal.tokenMentioned || "UNKNOWN";
      const tokenSymbol: any = signal.tokenMentioned;

      let swapStrategy: SwapStrategy;

      // Create swap strategy based on signal type - always 10% of USDC
      if (signal.signal.toLowerCase() === "buy") {
        // Buy signal: swap from USDC to target token
        swapStrategy = {
          fromTokenSymbol: "USDC",
          toTokenSymbol: tokenSymbol,
          amountPercentage: 10, // Fixed 10% as requested
          maxSlippage: 1.0,
        };
      } else if (signal.signal.toLowerCase() === "put options") {
        // Put options signal: this is more complex, for now we'll implement as a sell
        swapStrategy = {
          fromTokenSymbol: tokenSymbol,
          toTokenSymbol: "USDC",
          amountPercentage: 10, // Fixed 10% as requested
          maxSlippage: 1.0,
        };
      } else {
        throw new Error(`Unsupported signal type: ${signal.signal}`);
      }

      logger.info("🤖 GameEngine: Executing swap...", {
        from: swapStrategy.fromTokenSymbol,
        to: swapStrategy.toTokenSymbol,
        percentage: swapStrategy.amountPercentage + "%",
      });

      // Execute the swap through Enzyme
      const result = await this.enzymeService.executeAutomatedSwap(
        this.vaultAddress,
        swapStrategy
      );

      // Serialize swap details properly by converting BigInt values to strings
      const serializedSwapDetails = this.serializeSwapDetails(
        result.swapDetails
      );

      logger.info("🤖 GameEngine: Trade executed successfully!", {
        signal: signal.signal,
        symbol: signal.token,
        txHash: result.hash,
        swapDetails: serializedSwapDetails,
      });

      // Create position object with enhanced tracking
      const position: Position = {
        id: `pos_${Date.now()}`,
        signal,
        trailingStop: TrailingStopService.createTrailingStopConfig(
          signal.targets?.length || 2,
          undefined,
          undefined // Use default exit percentages for now
        ),
        currentPrice: parseFloat(result.swapDetails.expectedOutput),
        entryExecuted: true,
        exitExecuted: false,
        status: PositionStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
        entryTxHash: result.hash,
        actualEntryPrice: parseFloat(result.swapDetails.swapAmount),
        amountSwapped: parseFloat(result.swapDetails.swapAmount),
        tokenAmountReceived: parseFloat(result.swapDetails.expectedOutput),
        remainingAmount: parseFloat(result.swapDetails.expectedOutput), // Initially 100% remaining
        targetExitHistory: [], // No exits yet
      };

      // Add to active positions tracking
      this.activePositions.set(position.id, position);

      logger.info("🤖 GameEngine: Position created and added to monitoring", {
        positionId: position.id,
        maxExitTime: signal.maxExitTime,
        totalActivePositions: this.activePositions.size,
      });

      return position;
    } catch (error) {
      logger.error("🤖 GameEngine: Error executing trade:", error);
      throw error;
    }
  }

  /**
   * Serialize swap details to handle BigInt values
   */
  private serializeSwapDetails(swapDetails: any): any {
    const serialized: any = {};

    for (const [key, value] of Object.entries(swapDetails)) {
      if (typeof value === "bigint") {
        serialized[key] = value.toString();
      } else if (value && typeof value === "object" && !Array.isArray(value)) {
        // Recursively handle nested objects
        serialized[key] = this.serializeSwapDetails(value);
      } else {
        serialized[key] = value;
      }
    }

    return serialized;
  }

  /**
   * Check position for all exit conditions (trailing stop + time-based)
   */
  private async checkPositionExitConditions(
    position: Position,
    currentPrice?: number
  ): Promise<void> {
    try {
      // Check time-based exit first
      const now = new Date();
      const maxExitTime = new Date(position.signal.maxExitTime);

      if (now >= maxExitTime) {
        logger.info("🤖 GameEngine: Max exit time reached for position", {
          positionId: position.id,
          maxExitTime: position.signal.maxExitTime,
        });

        await this.executeTimeBasedExit(position);
        return;
      }

      // Check trailing stop conditions
      await this.checkTrailingStop(position, currentPrice);
    } catch (error) {
      logger.error(
        "🤖 GameEngine: Error checking position exit conditions:",
        error
      );
    }
  }

  /**
   * Execute time-based exit when maxExitTime is reached
   */
  private async executeTimeBasedExit(position: Position): Promise<void> {
    try {
      logger.info("🤖 GameEngine: Executing time-based exit...", {
        positionId: position.id,
        token: position.signal.token,
      });

      // Get current price for exit
      const currentPrice = await this.coinGeckoService.getTokenPrice(
        position.signal.tokenId
      );
      const exitPrice = currentPrice?.current_price || position.currentPrice;

      const exitResult = await this.executeTradeExit(position, exitPrice);

      if (exitResult.success) {
        position.status = PositionStatus.EXPIRED;
        position.exitTxHash = exitResult.txHash;
        position.updatedAt = new Date();

        // Remove from active positions
        this.activePositions.delete(position.id);

        logger.info("🤖 GameEngine: Time-based exit executed successfully", {
          positionId: position.id,
          exitPrice,
          txHash: exitResult.txHash,
        });
      } else {
        logger.error("🤖 GameEngine: Time-based exit failed", {
          positionId: position.id,
          error: exitResult.error,
        });
      }
    } catch (error) {
      logger.error("🤖 GameEngine: Error in time-based exit:", error);
    }
  }

  /**
   * Get current positions from the vault
   */
  async getCurrentPositions(): Promise<Position[]> {
    try {
      // Return active positions from our tracking
      return Array.from(this.activePositions.values());
    } catch (error) {
      logger.error("Error getting current positions:", error);
      throw error;
    }
  }

  /**
   * Monitor positions for trailing stop conditions
   */
  async monitorPositions(positions: Position[]): Promise<void> {
    try {
      for (const position of positions) {
        await this.checkTrailingStop(position);
      }
    } catch (error) {
      logger.error("Error monitoring positions:", error);
      throw error;
    }
  }

  /**
   * Check if position should be closed due to trailing stop
   */
  private async checkTrailingStop(
    position: Position,
    providedPrice?: number
  ): Promise<void> {
    try {
      let currentPrice: number;

      if (providedPrice !== undefined) {
        currentPrice = providedPrice;
      } else {
        // Convert token symbol to CoinGecko ID for price lookup
        const coinGeckoId = this.getCoinGeckoId(position.signal.tokenId);
        const priceData =
          await this.coinGeckoService.getTokenPrice(coinGeckoId);
        currentPrice = priceData?.current_price || position.currentPrice;
      }

      // Implement trailing stop logic here
      // This would check if price has retraced 1% from peak after hitting TP1

      const firstTarget =
        position.signal.targets && position.signal.targets.length > 0
          ? position.signal.targets[0]
          : null;

      logger.debug(
        `🤖 GameEngine: Checking trailing stop for ${position.signal.token}`,
        {
          currentPrice,
          entryPrice: position.currentPrice,
          firstTarget,
          maxExitTime: position.signal.maxExitTime,
        }
      );
    } catch (error) {
      logger.error("🤖 GameEngine: Error checking trailing stop:", error);
    }
  }

  /**
   * Convert symbol to CoinGecko ID for price lookup
   */
  private getCoinGeckoId(symbol: string): string {
    // Map common symbols to CoinGecko IDs
    const coinGeckoIdMap: Record<string, string> = {
      ethereum: "ethereum",
      bitcoin: "bitcoin",
      arbitrum: "arbitrum",
      "usd-coin": "usd-coin",
      tether: "tether",
      // Add more mappings as needed
    };

    return coinGeckoIdMap[symbol.toLowerCase()] || symbol.toLowerCase();
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
   * Get current portfolio value
   */
  async getPortfolioValue(): Promise<number> {
    try {
      const signerAddress = await this.signer.getAddress();
      const position = await this.enzymeService.getUserPosition(
        this.vaultAddress,
        signerAddress
      );
      return parseFloat(position.assetValue);
    } catch (error) {
      logger.error("Error getting portfolio value:", error);
      throw error;
    }
  }
}
