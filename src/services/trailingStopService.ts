import {
  Position,
  SignalType,
  TrailingStopConfig,
  PositionStatus,
} from "../types/trading";
import { logger } from "../utils/logger";
import { config } from "../config";

export class TrailingStopService {
  private positions: Map<string, Position> = new Map();

  /**
   * Add a position to track
   */
  addPosition(position: Position): void {
    this.positions.set(position.id, position);
    logger.info(`Added position to trailing stop tracking: ${position.id}`);
  }

  /**
   * Remove a position from tracking
   */
  removePosition(positionId: string): void {
    this.positions.delete(positionId);
    logger.info(`Removed position from trailing stop tracking: ${positionId}`);
  }

  /**
   * Update price for a position and check trailing stop conditions
   */
  updatePrice(
    positionId: string,
    currentPrice: number
  ): {
    shouldExit: boolean;
    reason?: string;
    exitPrice?: number;
    isPartialExit?: boolean;
    exitPercentage?: number;
    targetHit?: number;
  } {
    const position = this.positions.get(positionId);
    if (!position) {
      return { shouldExit: false };
    }

    // Update current price
    position.currentPrice = currentPrice;
    position.updatedAt = new Date();

    // Check if any new targets have been hit
    const targetResult = this.checkTargetsHit(position, currentPrice);
    if (targetResult.newTargetHit) {
      logger.info(
        `Target ${targetResult.targetIndex + 1} hit for position ${positionId}: $${targetResult.targetPrice}`
      );

      // Mark target as hit
      position.trailingStop.targetsHit[targetResult.targetIndex] = true;

      // If it's TP1 and trailing stop wasn't active, activate it
      if (targetResult.targetIndex === 0 && !position.trailingStop.tp1Hit) {
        position.trailingStop.tp1Hit = true;
        position.trailingStop.isActive = true;
        logger.info(
          `TP1 hit for position ${positionId}, activating trailing stop`
        );
      }

      // Check if this target requires a partial exit
      const exitPercentage = this.getExitPercentageForTarget(
        position,
        targetResult.targetIndex
      );
      if (exitPercentage > 0) {
        return {
          shouldExit: true,
          reason: `target_${targetResult.targetIndex + 1}_hit`,
          exitPrice: currentPrice,
          isPartialExit: exitPercentage < 100,
          exitPercentage,
          targetHit: targetResult.targetIndex + 1,
        };
      }
    }

    // If trailing stop is not active, check regular stop loss
    if (!position.trailingStop.isActive) {
      return this.checkStopLoss(position, currentPrice);
    }

    // Update peak/lowest price and check trailing stop
    this.updatePeakPrice(position, currentPrice);
    return this.checkTrailingStop(position, currentPrice);
  }

  /**
   * Check if any targets have been hit
   */
  private checkTargetsHit(
    position: Position,
    currentPrice: number
  ): {
    newTargetHit: boolean;
    targetIndex: number;
    targetPrice: number;
  } {
    const { signal } = position.signal;
    const targets = position.signal.targets || [];
    const targetsHit = position.trailingStop.targetsHit;

    for (let i = 0; i < targets.length; i++) {
      // Skip if this target was already hit
      if (targetsHit[i]) continue;

      const targetPrice = targets[i];
      let targetHit = false;

      switch (signal.toLowerCase()) {
        case "buy":
          targetHit = currentPrice >= targetPrice;
          break;
        case "put options":
          targetHit = currentPrice <= targetPrice;
          break;
      }

      if (targetHit) {
        return {
          newTargetHit: true,
          targetIndex: i,
          targetPrice,
        };
      }
    }

    return { newTargetHit: false, targetIndex: -1, targetPrice: 0 };
  }

  /**
   * Get exit percentage for a specific target
   */
  private getExitPercentageForTarget(
    position: Position,
    targetIndex: number
  ): number {
    // If custom percentages are defined, use those
    if (
      position.trailingStop.partialExitPercentages &&
      position.trailingStop.partialExitPercentages[targetIndex] !== undefined
    ) {
      return position.trailingStop.partialExitPercentages[targetIndex];
    }

    // Default strategy:
    // - TP1: Exit 50% of position
    // - TP2: Exit remaining 50% (full exit)
    // - TP3+: Full exit if not already exited
    const targets = position.signal.targets || [];

    switch (targetIndex) {
      case 0: // TP1
        return targets.length > 1 ? 50 : 100; // 50% if there are more targets, 100% if only one target
      case 1: // TP2
        return 100; // Exit remaining position
      default: // TP3+
        return 100; // Full exit
    }
  }

  /**
   * Check if TP1 has been hit (legacy method, now uses the new system)
   */
  private checkTP1Hit(position: Position, currentPrice: number): boolean {
    return position.trailingStop.targetsHit[0] || false;
  }

  /**
   * Check regular stop loss condition
   */
  private checkStopLoss(
    position: Position,
    currentPrice: number
  ): {
    shouldExit: boolean;
    reason?: string;
    exitPrice?: number;
  } {
    const { signal, stopLoss } = position.signal;

    switch (signal.toLowerCase()) {
      case "buy":
        if (currentPrice <= stopLoss) {
          logger.info(
            `Stop loss triggered for BUY position ${position.id}: ${currentPrice} <= ${stopLoss}`
          );
          return {
            shouldExit: true,
            reason: "stop_loss_buy",
            exitPrice: currentPrice,
          };
        }
        break;

      case "put options":
        if (currentPrice >= stopLoss) {
          logger.info(
            `Stop loss triggered for PUT position ${position.id}: ${currentPrice} >= ${stopLoss}`
          );
          return {
            shouldExit: true,
            reason: "stop_loss_put",
            exitPrice: currentPrice,
          };
        }
        break;
    }

    return { shouldExit: false };
  }

  /**
   * Update peak/lowest price for trailing stop
   */
  private updatePeakPrice(position: Position, currentPrice: number): void {
    const { signal } = position.signal;

    switch (signal.toLowerCase()) {
      case "buy":
        if (
          !position.trailingStop.peakPrice ||
          currentPrice > position.trailingStop.peakPrice
        ) {
          position.trailingStop.peakPrice = currentPrice;
          logger.debug(
            `Updated peak price for position ${position.id}: ${currentPrice}`
          );
        }
        break;

      case "put options":
        if (
          !position.trailingStop.lowestPrice ||
          currentPrice < position.trailingStop.lowestPrice
        ) {
          position.trailingStop.lowestPrice = currentPrice;
          logger.debug(
            `Updated lowest price for position ${position.id}: ${currentPrice}`
          );
        }
        break;
    }
  }

  /**
   * Check trailing stop condition
   */
  private checkTrailingStop(
    position: Position,
    currentPrice: number
  ): {
    shouldExit: boolean;
    reason?: string;
    exitPrice?: number;
  } {
    const { signal } = position.signal;
    const { trailPercent, peakPrice, lowestPrice } = position.trailingStop;

    let shouldExit = false;
    let exitReason = "";

    switch (signal.toLowerCase()) {
      case "buy":
        if (peakPrice) {
          const trailThreshold = peakPrice * (1 - trailPercent);
          shouldExit = currentPrice <= trailThreshold;
          exitReason = `trailing_stop_buy (peak: ${peakPrice}, threshold: ${trailThreshold})`;
        }
        break;

      case "put options":
        if (lowestPrice) {
          const trailThreshold = lowestPrice * (1 + trailPercent);
          shouldExit = currentPrice >= trailThreshold;
          exitReason = `trailing_stop_put (lowest: ${lowestPrice}, threshold: ${trailThreshold})`;
        }
        break;
    }

    if (shouldExit) {
      logger.info(
        `Trailing stop triggered for position ${position.id}: ${exitReason}`
      );
      return {
        shouldExit: true,
        reason: exitReason,
        exitPrice: currentPrice,
      };
    }

    return { shouldExit: false };
  }

  /**
   * Get all active positions
   */
  getActivePositions(): Position[] {
    return Array.from(this.positions.values()).filter(
      (position) => position.status === PositionStatus.ACTIVE
    );
  }

  /**
   * Get position by ID
   */
  getPosition(positionId: string): Position | undefined {
    return this.positions.get(positionId);
  }

  /**
   * Update position status
   */
  updatePositionStatus(positionId: string, status: PositionStatus): void {
    const position = this.positions.get(positionId);
    if (position) {
      position.status = status;
      position.updatedAt = new Date();

      if (status === PositionStatus.CLOSED) {
        // Remove from active tracking after a delay
        setTimeout(() => {
          this.removePosition(positionId);
        }, 60000); // Keep for 1 minute for logging purposes
      }
    }
  }

  /**
   * Get trailing stop statistics
   */
  getTrailingStopStats(): {
    totalPositions: number;
    activePositions: number;
    trailingStopActive: number;
    averageTrailPercent: number;
  } {
    const positions = Array.from(this.positions.values());
    const activePositions = positions.filter(
      (p) => p.status === PositionStatus.ACTIVE
    );
    const trailingStopActive = activePositions.filter(
      (p) => p.trailingStop.isActive
    );

    const averageTrailPercent =
      positions.length > 0
        ? positions.reduce((sum, p) => sum + p.trailingStop.trailPercent, 0) /
          positions.length
        : 0;

    return {
      totalPositions: positions.length,
      activePositions: activePositions.length,
      trailingStopActive: trailingStopActive.length,
      averageTrailPercent,
    };
  }

  /**
   * Create a new trailing stop configuration
   */
  static createTrailingStopConfig(
    targetsCount: number = 2,
    trailPercent?: number,
    customExitPercentages?: number[]
  ): TrailingStopConfig {
    return {
      trailPercent: trailPercent || config.trading.defaultTrailPercent,
      isActive: false,
      tp1Hit: false,
      targetsHit: new Array(targetsCount).fill(false),
      currentTargetIndex: 0,
      partialExitPercentages: customExitPercentages,
    };
  }

  /**
   * Validate trailing stop configuration
   */
  static validateTrailingStopConfig(trailingStop: TrailingStopConfig): boolean {
    return (
      trailingStop.trailPercent > 0 &&
      trailingStop.trailPercent <= 0.5 && // Max 50% trail
      typeof trailingStop.isActive === "boolean" &&
      typeof trailingStop.tp1Hit === "boolean"
    );
  }
}
