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
  } {
    const position = this.positions.get(positionId);
    if (!position) {
      return { shouldExit: false };
    }

    // Update current price
    position.currentPrice = currentPrice;
    position.updatedAt = new Date();

    // Check if TP1 has been hit
    const tp1Hit = this.checkTP1Hit(position, currentPrice);
    if (tp1Hit && !position.trailingStop.tp1Hit) {
      position.trailingStop.tp1Hit = true;
      position.trailingStop.isActive = true;
      logger.info(
        `TP1 hit for position ${positionId}, activating trailing stop`
      );
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
   * Check if TP1 has been hit
   */
  private checkTP1Hit(position: Position, currentPrice: number): boolean {
    const { signal, targets } = position.signal;

    switch (signal) {
      case SignalType.BUY:
        return currentPrice >= targets.tp1;
      case SignalType.PUT_OPTIONS:
        return currentPrice <= targets.tp1;
      default:
        return false;
    }
  }

  /**
   * Check regular stop loss (before TP1 is hit)
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

    let shouldExit = false;

    switch (signal) {
      case SignalType.BUY:
        shouldExit = currentPrice <= stopLoss;
        break;
      case SignalType.PUT_OPTIONS:
        shouldExit = currentPrice >= stopLoss;
        break;
      default:
        return { shouldExit: false };
    }

    if (shouldExit) {
      logger.info(
        `Stop loss triggered for position ${position.id} at price ${currentPrice}`
      );
      return {
        shouldExit: true,
        reason: "stop_loss",
        exitPrice: currentPrice,
      };
    }

    return { shouldExit: false };
  }

  /**
   * Update peak price for trailing stop
   */
  private updatePeakPrice(position: Position, currentPrice: number): void {
    const { signal } = position.signal;

    switch (signal) {
      case SignalType.BUY:
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
      case SignalType.PUT_OPTIONS:
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

    switch (signal) {
      case SignalType.BUY:
        if (peakPrice) {
          const trailThreshold = peakPrice * (1 - trailPercent);
          shouldExit = currentPrice <= trailThreshold;
          exitReason = `trailing_stop_buy (peak: ${peakPrice}, threshold: ${trailThreshold})`;
        }
        break;

      case SignalType.PUT_OPTIONS:
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
  static createTrailingStopConfig(trailPercent?: number): TrailingStopConfig {
    return {
      trailPercent: trailPercent || config.trading.defaultTrailPercent,
      isActive: false,
      tp1Hit: false,
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
