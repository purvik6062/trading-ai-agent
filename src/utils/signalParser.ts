import { TradingSignal, SignalType } from "../types/trading";
import { logger } from "./logger";

export class SignalParser {
  /**
   * Parse trading signal from text message
   */
  static parseSignal(message: string): TradingSignal | null {
    try {
      logger.debug("Parsing trading signal from message:", message);

      // Extract token information
      const tokenMatch = message.match(/🏛️\s*Token:\s*([A-Z]+)\s*\(([^)]+)\)/i);
      if (!tokenMatch) {
        logger.warn("No token information found in message");
        return null;
      }

      const token = tokenMatch[1].toUpperCase();
      const tokenId = tokenMatch[2].toLowerCase();

      // Extract signal type
      const signalMatch = message.match(/📈\s*Signal:\s*([^📈💰🎯🛑⏳💡]+)/i);
      if (!signalMatch) {
        logger.warn("No signal type found in message");
        return null;
      }

      const signalText = signalMatch[1].trim();
      let signal: SignalType;

      switch (signalText.toLowerCase()) {
        case "hold":
          signal = SignalType.HOLD;
          break;
        case "buy":
          signal = SignalType.BUY;
          break;
        case "put options":
          signal = SignalType.PUT_OPTIONS;
          break;
        default:
          logger.warn(`Unknown signal type: ${signalText}`);
          return null;
      }

      // Extract entry price
      const entryPriceMatch = message.match(
        /💰\s*Entry Price:\s*\$?([0-9,.]+)/i
      );
      if (!entryPriceMatch) {
        logger.warn("No entry price found in message");
        return null;
      }

      const entryPrice = parseFloat(entryPriceMatch[1].replace(/,/g, ""));

      // Extract targets
      const tp1Match = message.match(/TP1:\s*\$?([0-9,.]+)/i);
      const tp2Match = message.match(/TP2:\s*\$?([0-9,.]+)/i);

      if (!tp1Match || !tp2Match) {
        logger.warn("Target prices not found in message");
        return null;
      }

      const tp1 = parseFloat(tp1Match[1].replace(/,/g, ""));
      const tp2 = parseFloat(tp2Match[1].replace(/,/g, ""));

      // Extract stop loss
      const stopLossMatch = message.match(/🛑\s*Stop Loss:\s*\$?([0-9,.]+)/i);
      if (!stopLossMatch) {
        logger.warn("Stop loss not found in message");
        return null;
      }

      const stopLoss = parseFloat(stopLossMatch[1].replace(/,/g, ""));

      // Extract timeline
      const timelineMatch = message.match(/⏳\s*Timeline:\s*([^💡]+)/i);
      const timeline = timelineMatch
        ? timelineMatch[1].trim()
        : "Not specified";

      // Extract trade tip (optional)
      const tradeTipMatch = message.match(
        /💡\s*Trade Tip:\s*([^]+?)(?=\n\n|$)/i
      );
      const tradeTip = tradeTipMatch ? tradeTipMatch[1].trim() : undefined;

      const parsedSignal: TradingSignal = {
        token,
        tokenId,
        signal,
        entryPrice,
        targets: {
          tp1,
          tp2,
        },
        stopLoss,
        timeline,
        tradeTip,
        timestamp: new Date(),
      };

      logger.info("Successfully parsed trading signal:", {
        token,
        signal: signalText,
        entryPrice,
        tp1,
        tp2,
        stopLoss,
      });

      return parsedSignal;
    } catch (error) {
      logger.error("Error parsing trading signal:", error);
      return null;
    }
  }

  /**
   * Validate parsed signal
   */
  static validateSignal(signal: TradingSignal): boolean {
    try {
      // Basic validation
      if (!signal.token || !signal.tokenId) {
        logger.warn("Invalid signal: missing token information");
        return false;
      }

      if (signal.entryPrice <= 0) {
        logger.warn("Invalid signal: entry price must be positive");
        return false;
      }

      if (signal.targets.tp1 <= 0 || signal.targets.tp2 <= 0) {
        logger.warn("Invalid signal: target prices must be positive");
        return false;
      }

      if (signal.stopLoss <= 0) {
        logger.warn("Invalid signal: stop loss must be positive");
        return false;
      }

      // Signal-specific validation
      switch (signal.signal) {
        case SignalType.BUY:
          if (
            signal.targets.tp1 <= signal.entryPrice ||
            signal.targets.tp2 <= signal.entryPrice
          ) {
            logger.warn(
              "Invalid BUY signal: targets must be above entry price"
            );
            return false;
          }
          if (signal.stopLoss >= signal.entryPrice) {
            logger.warn(
              "Invalid BUY signal: stop loss must be below entry price"
            );
            return false;
          }
          break;

        case SignalType.PUT_OPTIONS:
          if (
            signal.targets.tp1 >= signal.entryPrice ||
            signal.targets.tp2 >= signal.entryPrice
          ) {
            logger.warn(
              "Invalid PUT signal: targets must be below entry price"
            );
            return false;
          }
          if (signal.stopLoss <= signal.entryPrice) {
            logger.warn(
              "Invalid PUT signal: stop loss must be above entry price"
            );
            return false;
          }
          break;

        case SignalType.HOLD:
          // HOLD signals are generally valid if basic validation passes
          break;

        default:
          logger.warn("Invalid signal: unknown signal type");
          return false;
      }

      logger.debug("Signal validation passed");
      return true;
    } catch (error) {
      logger.error("Error validating signal:", error);
      return false;
    }
  }

  /**
   * Extract multiple signals from a message (if any)
   */
  static parseMultipleSignals(message: string): TradingSignal[] {
    const signals: TradingSignal[] = [];

    // Split message by common separators
    const sections = message.split(/(?=🏛️\s*Token:)/g);

    for (const section of sections) {
      if (section.trim()) {
        const signal = this.parseSignal(section);
        if (signal && this.validateSignal(signal)) {
          signals.push(signal);
        }
      }
    }

    logger.info(`Parsed ${signals.length} valid signals from message`);
    return signals;
  }

  /**
   * Get signal summary for logging
   */
  static getSignalSummary(signal: TradingSignal): string {
    return `${signal.signal} ${signal.token} @ $${signal.entryPrice} | TP1: $${signal.targets.tp1} | TP2: $${signal.targets.tp2} | SL: $${signal.stopLoss}`;
  }

  /**
   * Format signal for display
   */
  static formatSignal(signal: TradingSignal): string {
    return `
🏛️ Token: ${signal.token} (${signal.tokenId})
📈 Signal: ${signal.signal}
💰 Entry Price: $${signal.entryPrice}
🎯 Targets:
  TP1: $${signal.targets.tp1}
  TP2: $${signal.targets.tp2}
🛑 Stop Loss: $${signal.stopLoss}
⏳ Timeline: ${signal.timeline}
${signal.tradeTip ? `💡 Trade Tip: ${signal.tradeTip}` : ""}
🕒 Parsed at: ${signal.timestamp.toISOString()}
    `.trim();
  }
}
