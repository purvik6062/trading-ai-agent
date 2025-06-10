import { ethers } from "ethers";
import {
  Position,
  TradingSignal,
  PositionStatus,
  SignalType,
  TradeExecution,
  TargetExit,
  PersistedPosition,
  PositionRecoveryResult,
} from "../types/trading";
import { TrailingStopService } from "./trailingStopService";
import { EnzymeVaultService, SwapStrategy } from "./enzymeService";
import { CoinGeckoService } from "./coinGeckoService";
import { PositionPersistenceService } from "./positionPersistenceService";
import { logger } from "../utils/logger";

export interface PositionConflictResolution {
  action: "merge" | "separate" | "prioritize" | "cancel";
  reason: string;
  priority?: number;
}

export interface MultiPositionConfig {
  maxConcurrentPositions: number;
  maxPositionsPerToken: number;
  conflictResolution:
    | "first_wins"
    | "merge_similar"
    | "prioritize_latest"
    | "risk_based";
  riskManagement: {
    maxTotalExposure: number; // Maximum total USD exposure across all positions
    maxSingleTokenExposure: number; // Maximum exposure to any single token
    correlationThreshold: number; // Threshold for considering tokens correlated
  };
  exitStrategy: {
    allowPartialExits: boolean;
    consolidateSmallPositions: boolean;
    minimumPositionSize: number;
  };
}

export interface PositionGroup {
  id: string;
  token: string;
  tokenId: string;
  positions: Position[];
  totalExposure: number;
  averageEntryPrice: number;
  combinedTargets: number[];
  exitStrategy: "individual" | "grouped" | "weighted_average";
  status: "active" | "consolidating" | "exiting";
}

export class MultiPositionManager {
  private activePositions: Map<string, Position> = new Map();
  private positionGroups: Map<string, PositionGroup> = new Map();
  private trailingStopService: TrailingStopService;
  private enzymeService: EnzymeVaultService;
  private coinGeckoService: CoinGeckoService;
  private persistenceService: PositionPersistenceService;
  private config: MultiPositionConfig;
  private conflictQueue: Array<{ signal: TradingSignal; timestamp: Date }> = [];
  private currentUsername?: string; // Track current user context

  constructor(
    enzymeService: EnzymeVaultService,
    coinGeckoService: CoinGeckoService,
    config: Partial<MultiPositionConfig> = {}
  ) {
    this.enzymeService = enzymeService;
    this.coinGeckoService = coinGeckoService;
    this.trailingStopService = new TrailingStopService();
    this.persistenceService = new PositionPersistenceService();

    // Default configuration
    this.config = {
      maxConcurrentPositions: 10,
      maxPositionsPerToken: 3,
      conflictResolution: "risk_based",
      riskManagement: {
        maxTotalExposure: 10000, // $10,000 max total exposure
        maxSingleTokenExposure: 2000, // $2,000 max per token
        correlationThreshold: 0.7,
      },
      exitStrategy: {
        allowPartialExits: true,
        consolidateSmallPositions: true,
        minimumPositionSize: 50, // $50 minimum
      },
      ...config,
    };
  }

  /**
   * Initialize persistence service and recover positions
   */
  async init(): Promise<PositionRecoveryResult> {
    try {
      await this.persistenceService.connect();
      const recoveryResult =
        await this.persistenceService.recoverActivePositions();

      // Load recovered positions into memory
      for (const persistedPosition of recoveryResult.recoveredPositions) {
        const position: Position = {
          id: persistedPosition.id,
          signal: persistedPosition.signal,
          trailingStop: persistedPosition.trailingStop,
          currentPrice: persistedPosition.currentPrice,
          entryExecuted: persistedPosition.entryExecuted,
          exitExecuted: persistedPosition.exitExecuted,
          status: persistedPosition.status,
          createdAt: persistedPosition.createdAt,
          updatedAt: persistedPosition.updatedAt,
          entryTxHash: persistedPosition.entryTxHash,
          exitTxHash: persistedPosition.exitTxHash,
          actualEntryPrice: persistedPosition.actualEntryPrice,
          amountSwapped: persistedPosition.amountSwapped,
          tokenAmountReceived: persistedPosition.tokenAmountReceived,
          remainingAmount: persistedPosition.remainingAmount,
          targetExitHistory: persistedPosition.targetExitHistory,
        };

        this.activePositions.set(position.id, position);
        await this.updatePositionGroup(position);

        // Add to trailing stop service if active
        if (position.status === PositionStatus.ACTIVE) {
          this.trailingStopService.addPosition(position);
        }
      }

      logger.info(
        "✅ MultiPositionManager initialized with position recovery",
        {
          totalRecovered: recoveryResult.totalRecovered,
          activePositions: recoveryResult.activePositions,
          expiredPositions: recoveryResult.expiredPositions,
        }
      );

      return recoveryResult;
    } catch (error) {
      logger.error(
        "❌ Failed to initialize MultiPositionManager with persistence:",
        error
      );
      throw error;
    }
  }

  /**
   * Set current user context for position operations
   */
  setUserContext(username: string): void {
    this.currentUsername = username;
  }

  /**
   * Add a new trading signal and handle conflicts
   */
  async addSignal(
    signal: TradingSignal,
    positionSize: number
  ): Promise<{
    success: boolean;
    position?: Position;
    conflict?: PositionConflictResolution;
    message: string;
  }> {
    try {
      // Check for conflicts
      const conflict = await this.checkSignalConflicts(signal, positionSize);

      if (conflict.action === "cancel") {
        return {
          success: false,
          conflict,
          message: conflict.reason,
        };
      }

      // Handle different conflict resolution strategies
      switch (conflict.action) {
        case "merge":
          return await this.handleMergeConflict(signal, positionSize);

        case "separate":
          return await this.handleSeparatePositions(signal, positionSize);

        case "prioritize":
          return await this.handlePriorityConflict(
            signal,
            positionSize,
            conflict.priority!
          );

        default:
          // No conflict, proceed with normal execution
          const position = await this.createPosition(signal, positionSize);
          return {
            success: true,
            position,
            message: `Position created successfully for ${signal.token}`,
          };
      }
    } catch (error) {
      logger.error("Error adding signal to MultiPositionManager:", error);
      return {
        success: false,
        message: `Failed to add signal: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  /**
   * Check for conflicts with existing positions
   */
  private async checkSignalConflicts(
    signal: TradingSignal,
    positionSize: number
  ): Promise<PositionConflictResolution> {
    const existingPositions = this.getPositionsByToken(signal.tokenId);
    const totalExposure = this.getTotalExposure();
    const tokenExposure = this.getTokenExposure(signal.tokenId);

    // Check position limits
    if (this.activePositions.size >= this.config.maxConcurrentPositions) {
      return {
        action: "cancel",
        reason: `Maximum concurrent positions (${this.config.maxConcurrentPositions}) reached`,
      };
    }

    if (existingPositions.length >= this.config.maxPositionsPerToken) {
      // Check if we can merge similar signals
      const similarSignal = existingPositions.find(
        (p) =>
          p.signal.signal === signal.signal &&
          Math.abs(p.signal.currentPrice - signal.currentPrice) /
            signal.currentPrice <
            0.05 // 5% price tolerance
      );

      if (similarSignal && this.config.conflictResolution === "merge_similar") {
        return {
          action: "merge",
          reason: `Merging with similar ${signal.signal} signal for ${signal.token}`,
        };
      }

      return {
        action: "cancel",
        reason: `Maximum positions per token (${this.config.maxPositionsPerToken}) reached for ${signal.token}`,
      };
    }

    // Check exposure limits
    if (
      totalExposure + positionSize >
      this.config.riskManagement.maxTotalExposure
    ) {
      return {
        action: "cancel",
        reason: `Would exceed maximum total exposure ($${this.config.riskManagement.maxTotalExposure})`,
      };
    }

    if (
      tokenExposure + positionSize >
      this.config.riskManagement.maxSingleTokenExposure
    ) {
      return {
        action: "cancel",
        reason: `Would exceed maximum single token exposure ($${this.config.riskManagement.maxSingleTokenExposure}) for ${signal.token}`,
      };
    }

    // Check for conflicting signals (buy vs sell)
    const conflictingSignals = existingPositions.filter((p) => {
      if (
        signal.signal === SignalType.BUY &&
        p.signal.signal === SignalType.PUT_OPTIONS
      )
        return true;
      if (
        signal.signal === SignalType.PUT_OPTIONS &&
        p.signal.signal === SignalType.BUY
      )
        return true;
      return false;
    });

    if (conflictingSignals.length > 0) {
      switch (this.config.conflictResolution) {
        case "first_wins":
          return {
            action: "cancel",
            reason: `Conflicting signal exists for ${signal.token} - first signal takes priority`,
          };

        case "prioritize_latest":
          return {
            action: "prioritize",
            reason: `Prioritizing latest signal for ${signal.token}`,
            priority: Date.now(),
          };

        case "risk_based":
          // Calculate risk scores and prioritize lower risk
          const existingRisk = this.calculateSignalRisk(
            conflictingSignals[0].signal
          );
          const newRisk = this.calculateSignalRisk(signal);

          if (newRisk < existingRisk) {
            return {
              action: "prioritize",
              reason: `New signal has lower risk score for ${signal.token}`,
              priority: newRisk,
            };
          } else {
            return {
              action: "cancel",
              reason: `Existing signal has lower risk score for ${signal.token}`,
            };
          }

        default:
          return {
            action: "separate",
            reason: `Managing conflicting signals separately for ${signal.token}`,
          };
      }
    }

    // No conflicts detected
    return {
      action: "separate",
      reason: "No conflicts detected",
    };
  }

  /**
   * Calculate risk score for a signal
   */
  private calculateSignalRisk(signal: TradingSignal): number {
    let riskScore = 0;

    // Factor in stop loss distance (closer = higher risk)
    const stopLossDistance =
      Math.abs(signal.currentPrice - signal.stopLoss) / signal.currentPrice;
    riskScore += (1 - stopLossDistance) * 50; // Max 50 points

    // Factor in number of targets (more targets = lower risk)
    riskScore += Math.max(0, 30 - signal.targets.length * 10); // Max 30 points

    // Factor in timeline (shorter = higher risk)
    const maxExitTime = new Date(signal.maxExitTime);
    const timeToExit =
      (maxExitTime.getTime() - Date.now()) / (1000 * 60 * 60 * 24); // days
    riskScore += Math.max(0, 20 - timeToExit); // Max 20 points

    return riskScore;
  }

  /**
   * Handle merging similar signals
   */
  private async handleMergeConflict(
    signal: TradingSignal,
    positionSize: number
  ): Promise<{
    success: boolean;
    position?: Position;
    message: string;
  }> {
    const existingPositions = this.getPositionsByToken(signal.tokenId);
    const similarPosition = existingPositions.find(
      (p) =>
        p.signal.signal === signal.signal &&
        Math.abs(p.signal.currentPrice - signal.currentPrice) /
          signal.currentPrice <
          0.05
    );

    if (!similarPosition) {
      return {
        success: false,
        message: "No similar position found to merge with",
      };
    }

    // Create merged position by updating existing position
    const mergedPosition = await this.mergePositions(
      similarPosition,
      signal,
      positionSize
    );

    return {
      success: true,
      position: mergedPosition,
      message: `Successfully merged positions for ${signal.token}`,
    };
  }

  /**
   * Handle separate position creation
   */
  private async handleSeparatePositions(
    signal: TradingSignal,
    positionSize: number
  ): Promise<{
    success: boolean;
    position?: Position;
    message: string;
  }> {
    const position = await this.createPosition(signal, positionSize);

    // Update position group if exists
    await this.updatePositionGroup(position);

    return {
      success: true,
      position,
      message: `Created separate position for ${signal.token}`,
    };
  }

  /**
   * Handle priority conflicts
   */
  private async handlePriorityConflict(
    signal: TradingSignal,
    positionSize: number,
    priority: number
  ): Promise<{
    success: boolean;
    position?: Position;
    message: string;
  }> {
    // Close conflicting positions
    const conflictingPositions = this.getPositionsByToken(
      signal.tokenId
    ).filter(
      (p) =>
        (signal.signal === SignalType.BUY &&
          p.signal.signal === SignalType.PUT_OPTIONS) ||
        (signal.signal === SignalType.PUT_OPTIONS &&
          p.signal.signal === SignalType.BUY)
    );

    for (const conflictingPosition of conflictingPositions) {
      await this.closePosition(
        conflictingPosition.id,
        "Priority conflict resolution"
      );
    }

    // Create new position
    const position = await this.createPosition(signal, positionSize);

    return {
      success: true,
      position,
      message: `Created prioritized position for ${signal.token}, closed ${conflictingPositions.length} conflicting positions`,
    };
  }

  /**
   * Create a new position
   */
  private async createPosition(
    signal: TradingSignal,
    positionSize: number
  ): Promise<Position> {
    const position: Position = {
      id: `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      signal,
      trailingStop: TrailingStopService.createTrailingStopConfig(
        signal.targets?.length || 2,
        undefined,
        undefined
      ),
      currentPrice: signal.currentPrice,
      entryExecuted: false,
      exitExecuted: false,
      status: PositionStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
      remainingAmount: positionSize,
      targetExitHistory: [],
    };

    this.activePositions.set(position.id, position);
    await this.updatePositionGroup(position);

    // Save to persistence
    try {
      await this.persistenceService.savePosition(
        position,
        this.currentUsername,
        this.enzymeService.getVaultAddress()
      );
    } catch (error) {
      logger.error(`Failed to persist position ${position.id}:`, error);
      // Continue anyway - position is still in memory
    }

    logger.info(`Created new position: ${position.id} for ${signal.token}`, {
      signal: signal.signal,
      positionSize,
      totalActivePositions: this.activePositions.size,
    });

    return position;
  }

  /**
   * Merge two positions
   */
  private async mergePositions(
    existingPosition: Position,
    newSignal: TradingSignal,
    newPositionSize: number
  ): Promise<Position> {
    const totalSize = (existingPosition.remainingAmount || 0) + newPositionSize;
    const weightedTargets = this.calculateWeightedTargets(
      existingPosition.signal.targets,
      newSignal.targets,
      existingPosition.remainingAmount || 0,
      newPositionSize
    );

    // Update existing position
    existingPosition.remainingAmount = totalSize;
    existingPosition.signal.targets = weightedTargets;
    existingPosition.updatedAt = new Date();

    // Update trailing stop configuration
    existingPosition.trailingStop =
      TrailingStopService.createTrailingStopConfig(
        weightedTargets.length,
        undefined,
        undefined
      );

    await this.updatePositionGroup(existingPosition);

    logger.info(`Merged positions for ${existingPosition.signal.token}`, {
      positionId: existingPosition.id,
      newTotalSize: totalSize,
      weightedTargets,
    });

    return existingPosition;
  }

  /**
   * Calculate weighted targets for merged positions
   */
  private calculateWeightedTargets(
    targets1: number[],
    targets2: number[],
    weight1: number,
    weight2: number
  ): number[] {
    const totalWeight = weight1 + weight2;
    const maxTargets = Math.max(targets1.length, targets2.length);
    const weightedTargets: number[] = [];

    for (let i = 0; i < maxTargets; i++) {
      const target1 = targets1[i] || targets1[targets1.length - 1]; // Use last target if not enough
      const target2 = targets2[i] || targets2[targets2.length - 1];

      const weightedTarget =
        (target1 * weight1 + target2 * weight2) / totalWeight;
      weightedTargets.push(weightedTarget);
    }

    return weightedTargets.sort((a, b) => a - b); // Sort ascending
  }

  /**
   * Update position group
   */
  private async updatePositionGroup(position: Position): Promise<void> {
    const groupKey = `${position.signal.tokenId}`;
    let group = this.positionGroups.get(groupKey);

    if (!group) {
      group = {
        id: groupKey,
        token: position.signal.token,
        tokenId: position.signal.tokenId,
        positions: [],
        totalExposure: 0,
        averageEntryPrice: 0,
        combinedTargets: [],
        exitStrategy: "individual",
        status: "active",
      };
      this.positionGroups.set(groupKey, group);
    }

    // Add position to group if not already present
    if (!group.positions.find((p) => p.id === position.id)) {
      group.positions.push(position);
    }

    // Recalculate group metrics
    this.recalculateGroupMetrics(group);
  }

  /**
   * Recalculate group metrics
   */
  private recalculateGroupMetrics(group: PositionGroup): void {
    const activePositions = group.positions.filter(
      (p) =>
        p.status === PositionStatus.ACTIVE ||
        p.status === PositionStatus.PENDING
    );

    group.totalExposure = activePositions.reduce(
      (sum, p) => sum + (p.remainingAmount || 0),
      0
    );

    if (activePositions.length > 0) {
      group.averageEntryPrice =
        activePositions.reduce(
          (sum, p) => sum + p.signal.currentPrice * (p.remainingAmount || 0),
          0
        ) / group.totalExposure;

      // Combine all targets and remove duplicates
      const allTargets = activePositions.flatMap((p) => p.signal.targets);
      group.combinedTargets = [...new Set(allTargets)].sort((a, b) => a - b);
    }

    // Determine exit strategy based on number of positions
    if (activePositions.length > 1) {
      group.exitStrategy = "grouped";
    } else {
      group.exitStrategy = "individual";
    }
  }

  /**
   * Monitor all positions
   */
  async monitorAllPositions(): Promise<void> {
    if (this.activePositions.size === 0) return;

    logger.debug(
      `🔍 Monitoring ${this.activePositions.size} active positions for user: ${this.currentUsername || "unknown"}`
    );

    const positions = Array.from(this.activePositions.values());
    const uniqueTokenIds = [...new Set(positions.map((p) => p.signal.tokenId))];

    try {
      // Get prices for all tokens
      const tokenPrices =
        await this.coinGeckoService.getMultipleTokenPrices(uniqueTokenIds);
      const priceMap = new Map(
        tokenPrices.map((price) => [price.id, price.current_price])
      );

      // Group positions by token for efficient processing
      for (const [groupKey, group] of this.positionGroups) {
        const currentPrice = priceMap.get(group.tokenId);
        if (!currentPrice) continue;

        if (group.exitStrategy === "grouped") {
          await this.monitorGroupedPositions(group, currentPrice);
        } else {
          await this.monitorIndividualPositions(group.positions, currentPrice);
        }
      }
    } catch (error) {
      logger.error("Error monitoring positions:", error);
    }
  }

  /**
   * Monitor grouped positions
   */
  private async monitorGroupedPositions(
    group: PositionGroup,
    currentPrice: number
  ): Promise<void> {
    // Calculate group-level metrics
    const totalValue =
      (group.totalExposure * currentPrice) / group.averageEntryPrice;
    const groupPnL = totalValue - group.totalExposure;
    const groupPnLPercent = (groupPnL / group.totalExposure) * 100;

    // Check for group-level exit conditions
    for (const target of group.combinedTargets) {
      const targetReached = this.isTargetReached(group, target, currentPrice);

      if (targetReached) {
        await this.executeGroupPartialExit(group, target, currentPrice);
      }
    }

    // Check for stop loss conditions
    const shouldExitGroup = group.positions.some((p) =>
      this.shouldTriggerStopLoss(p, currentPrice)
    );

    if (shouldExitGroup) {
      await this.executeGroupFullExit(
        group,
        currentPrice,
        "Stop loss triggered"
      );
      return; // Exit early to avoid duplicate processing
    }

    // Check for time-based exit conditions (CRITICAL FIX)
    const shouldTimeExitGroup = group.positions.some((p) =>
      this.shouldTimeExit(p)
    );

    if (shouldTimeExitGroup) {
      await this.executeGroupFullExit(
        group,
        currentPrice,
        "Time-based exit (maxExitTime reached)"
      );
      return; // Exit early to avoid duplicate processing
    }
  }

  /**
   * Monitor individual positions
   */
  private async monitorIndividualPositions(
    positions: Position[],
    currentPrice: number
  ): Promise<void> {
    for (const position of positions) {
      if (position.status !== PositionStatus.ACTIVE) continue;

      // Update trailing stop
      const exitCondition = this.trailingStopService.updatePrice(
        position.id,
        currentPrice
      );

      if (exitCondition.shouldExit) {
        if (exitCondition.isPartialExit) {
          await this.executePartialExit(
            position,
            exitCondition.exitPercentage!,
            currentPrice,
            exitCondition.targetHit!
          );
        } else {
          await this.executeFullExit(
            position,
            currentPrice,
            exitCondition.reason!
          );
        }
      }

      // Check time-based exit
      if (this.shouldTimeExit(position)) {
        await this.executeFullExit(position, currentPrice, "Time-based exit");
      }
    }
  }

  /**
   * Execute partial exit for a position
   */
  private async executePartialExit(
    position: Position,
    exitPercentage: number,
    exitPrice: number,
    targetHit: number
  ): Promise<void> {
    try {
      const exitAmount =
        (position.remainingAmount || 0) * (exitPercentage / 100);

      // Record the exit
      const targetExit: TargetExit = {
        targetIndex: targetHit - 1, // Convert to 0-based index
        targetPrice: position.signal.targets[targetHit - 1] || exitPrice,
        actualExitPrice: exitPrice,
        amountExited: exitAmount,
        percentage: exitPercentage,
        timestamp: new Date(),
      };

      position.targetExitHistory = position.targetExitHistory || [];
      position.targetExitHistory.push(targetExit);
      position.remainingAmount = (position.remainingAmount || 0) - exitAmount;
      position.updatedAt = new Date();

      // Update position group
      const group = this.positionGroups.get(position.signal.tokenId);
      if (group) {
        this.recalculateGroupMetrics(group);
      }

      logger.info(`Executed partial exit for position ${position.id}`, {
        token: position.signal.token,
        targetHit,
        exitPercentage,
        exitAmount,
        remainingAmount: position.remainingAmount,
      });
    } catch (error) {
      logger.error(
        `Error executing partial exit for position ${position.id}:`,
        error
      );
    }
  }

  /**
   * Execute full exit for a position
   */
  private async executeFullExit(
    position: Position,
    exitPrice: number,
    reason: string
  ): Promise<void> {
    try {
      position.exitExecuted = true;
      position.status = PositionStatus.CLOSED;
      position.updatedAt = new Date();

      // Update persistence
      try {
        await this.persistenceService.updatePositionStatus(
          position.id,
          PositionStatus.CLOSED,
          position.exitTxHash
        );
      } catch (error) {
        logger.error(
          `Failed to update position status in persistence: ${position.id}`,
          error
        );
      }

      // Remove from active positions
      this.activePositions.delete(position.id);
      this.trailingStopService.updatePositionStatus(
        position.id,
        PositionStatus.CLOSED
      );

      // Update position group
      const group = this.positionGroups.get(position.signal.tokenId);
      if (group) {
        group.positions = group.positions.filter((p) => p.id !== position.id);
        if (group.positions.length === 0) {
          this.positionGroups.delete(position.signal.tokenId);
        } else {
          this.recalculateGroupMetrics(group);
        }
      }

      logger.info(`Executed full exit for position ${position.id}`, {
        token: position.signal.token,
        reason,
        exitPrice,
        finalPnL: this.calculatePnL(
          position,
          exitPrice,
          position.remainingAmount || 0
        ),
      });
    } catch (error) {
      logger.error(
        `Error executing full exit for position ${position.id}:`,
        error
      );
    }
  }

  /**
   * Execute group partial exit
   */
  private async executeGroupPartialExit(
    group: PositionGroup,
    target: number,
    currentPrice: number
  ): Promise<void> {
    // Calculate weighted exit percentages based on position sizes
    for (const position of group.positions) {
      if (position.status !== PositionStatus.ACTIVE) continue;

      const targetIndex = position.signal.targets.findIndex(
        (t) => Math.abs(t - target) < target * 0.01
      );
      if (targetIndex >= 0) {
        const exitPercentage = this.calculateTargetExitPercentage(targetIndex);
        await this.executePartialExit(
          position,
          exitPercentage,
          currentPrice,
          targetIndex + 1
        );
      }
    }
  }

  /**
   * Execute group full exit
   */
  private async executeGroupFullExit(
    group: PositionGroup,
    currentPrice: number,
    reason: string
  ): Promise<void> {
    for (const position of group.positions) {
      if (position.status === PositionStatus.ACTIVE) {
        await this.executeFullExit(position, currentPrice, reason);
      }
    }
  }

  /**
   * Close a specific position
   */
  async closePosition(positionId: string, reason: string): Promise<boolean> {
    const position = this.activePositions.get(positionId);
    if (!position) {
      logger.warn(`Position ${positionId} not found`);
      return false;
    }

    try {
      // Get current price
      const tokenPrice = await this.coinGeckoService.getTokenPrice(
        position.signal.tokenId
      );
      const currentPrice =
        tokenPrice?.current_price || position.signal.currentPrice;

      await this.executeFullExit(position, currentPrice, reason);
      return true;
    } catch (error) {
      logger.error(`Error closing position ${positionId}:`, error);
      return false;
    }
  }

  // Helper methods
  private getPositionsByToken(tokenId: string): Position[] {
    return Array.from(this.activePositions.values()).filter(
      (p) => p.signal.tokenId === tokenId
    );
  }

  private getTotalExposure(): number {
    return Array.from(this.activePositions.values()).reduce(
      (sum, p) => sum + (p.remainingAmount || 0),
      0
    );
  }

  private getTokenExposure(tokenId: string): number {
    return this.getPositionsByToken(tokenId).reduce(
      (sum, p) => sum + (p.remainingAmount || 0),
      0
    );
  }

  private isTargetReached(
    group: PositionGroup,
    target: number,
    currentPrice: number
  ): boolean {
    // Check if target is reached based on signal type
    const buyPositions = group.positions.filter(
      (p) => p.signal.signal === SignalType.BUY
    );
    const sellPositions = group.positions.filter(
      (p) => p.signal.signal === SignalType.PUT_OPTIONS
    );

    if (buyPositions.length > 0 && currentPrice >= target) return true;
    if (sellPositions.length > 0 && currentPrice <= target) return true;

    return false;
  }

  private shouldTriggerStopLoss(
    position: Position,
    currentPrice: number
  ): boolean {
    if (position.signal.signal === SignalType.BUY) {
      return currentPrice <= position.signal.stopLoss;
    } else if (position.signal.signal === SignalType.PUT_OPTIONS) {
      return currentPrice >= position.signal.stopLoss;
    }
    return false;
  }

  private shouldTimeExit(position: Position): boolean {
    const maxExitTime = new Date(position.signal.maxExitTime);
    const now = new Date();
    const shouldExit = now >= maxExitTime;

    if (shouldExit) {
      logger.info(`⏰ Position ${position.id} reached maxExitTime`, {
        token: position.signal.token,
        maxExitTime: position.signal.maxExitTime,
        currentTime: now.toISOString(),
        minutesOverdue: Math.round(
          (now.getTime() - maxExitTime.getTime()) / (1000 * 60)
        ),
      });
    }

    return shouldExit;
  }

  private calculatePnL(
    position: Position,
    exitPrice: number,
    exitAmount: number
  ): number {
    const entryValue =
      (position.signal.currentPrice * exitAmount) /
      (position.remainingAmount || 1);
    const exitValue =
      (exitPrice * exitAmount) / (position.remainingAmount || 1);
    return exitValue - entryValue;
  }

  private calculateTargetExitPercentage(targetIndex: number): number {
    // Default exit percentages: 50% at TP1, 30% at TP2, 20% at TP3
    const defaultPercentages = [50, 30, 20];
    return defaultPercentages[targetIndex] || 100;
  }

  // Public getters
  getActivePositions(): Position[] {
    return Array.from(this.activePositions.values());
  }

  getPositionGroups(): PositionGroup[] {
    return Array.from(this.positionGroups.values());
  }

  getStats(): {
    totalPositions: number;
    totalExposure: number;
    positionGroups: number;
    conflictingSignals: number;
  } {
    return {
      totalPositions: this.activePositions.size,
      totalExposure: this.getTotalExposure(),
      positionGroups: this.positionGroups.size,
      conflictingSignals: this.conflictQueue.length,
    };
  }

  /**
   * Save position update to persistence
   */
  async savePositionUpdate(position: Position): Promise<void> {
    try {
      await this.persistenceService.savePosition(
        position,
        this.currentUsername,
        this.enzymeService.getVaultAddress()
      );
    } catch (error) {
      logger.error(`Failed to save position update ${position.id}:`, error);
    }
  }

  /**
   * Get persistence service for external access
   */
  getPersistenceService(): PositionPersistenceService {
    return this.persistenceService;
  }

  /**
   * Disconnect persistence service
   */
  async disconnect(): Promise<void> {
    await this.persistenceService.disconnect();
  }
}
