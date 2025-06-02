import { TradingSignal, SignalType } from "../types/trading";
import { logger } from "./logger";

export class SignalParser {
  /**
   * Parse trading signal from new object format
   */
  static parseSignalObject(signalData: any): TradingSignal | null {
    try {
      logger.debug("Parsing trading signal from object:", signalData);

      // Validate required fields
      if (!signalData.token || !signalData.tokenId || !signalData.signal) {
        logger.warn("Missing required fields in signal object");
        return null;
      }

      // Extract token symbol from token field (e.g., "COS (contentos)" -> "COS")
      const tokenMatch = signalData.token.match(/^([A-Z]+)/);
      const tokenSymbol = tokenMatch
        ? tokenMatch[1]
        : signalData.tokenMentioned || signalData.token;

      const parsedSignal: TradingSignal = {
        token: signalData.token,
        tokenId: signalData.tokenId,
        signal: signalData.signal,
        currentPrice: signalData.currentPrice || 0,
        targets: Array.isArray(signalData.targets) ? signalData.targets : [],
        stopLoss: signalData.stopLoss || 0,
        timeline: signalData.timeline || "Not specified",
        maxExitTime: signalData.maxExitTime,
        tradeTip: signalData.tradeTip || "",
        tweet_id: signalData.tweet_id,
        tweet_link: signalData.tweet_link,
        tweet_timestamp: signalData.tweet_timestamp,
        priceAtTweet: signalData.priceAtTweet,
        exitValue: signalData.exitValue,
        twitterHandle: signalData.twitterHandle,
        tokenMentioned: signalData.tokenMentioned,
        timestamp: new Date(),
      };

      logger.info("Successfully parsed signal object:", {
        token: parsedSignal.token,
        tokenId: parsedSignal.tokenId,
        signal: parsedSignal.signal,
        currentPrice: parsedSignal.currentPrice,
        targets: parsedSignal.targets,
        stopLoss: parsedSignal.stopLoss,
        maxExitTime: parsedSignal.maxExitTime,
      });

      return parsedSignal;
    } catch (error) {
      logger.error("Error parsing signal object:", error);
      return null;
    }
  }

  /**
   * Parse trading signal from text message (legacy format)
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

      const token = `${tokenMatch[1].toUpperCase()} (${tokenMatch[2]})`;
      const tokenId = tokenMatch[2].toLowerCase();

      // Extract signal type
      const signalMatch = message.match(/📈\s*Signal:\s*([^📈💰🎯🛑⏳💡]+)/i);
      if (!signalMatch) {
        logger.warn("No signal type found in message");
        return null;
      }

      const signalText = signalMatch[1].trim();

      // Extract entry price (now currentPrice)
      const entryPriceMatch = message.match(
        /💰\s*Entry Price:\s*\$?([0-9,.]+)/i
      );
      if (!entryPriceMatch) {
        logger.warn("No entry price found in message");
        return null;
      }

      const currentPrice = parseFloat(entryPriceMatch[1].replace(/,/g, ""));

      // Extract targets
      const tp1Match = message.match(/TP1:\s*\$?([0-9,.]+)/i);
      const tp2Match = message.match(/TP2:\s*\$?([0-9,.]+)/i);

      const targets: number[] = [];
      if (tp1Match) {
        targets.push(parseFloat(tp1Match[1].replace(/,/g, "")));
      }
      if (tp2Match) {
        targets.push(parseFloat(tp2Match[1].replace(/,/g, "")));
      }

      if (targets.length === 0) {
        logger.warn("No target prices found in message");
        return null;
      }

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
      const tradeTip = tradeTipMatch ? tradeTipMatch[1].trim() : "";

      // Set maxExitTime to 7 days from now for legacy signals
      const maxExitTime = new Date();
      maxExitTime.setDate(maxExitTime.getDate() + 7);

      const parsedSignal: TradingSignal = {
        token,
        tokenId,
        signal: signalText,
        currentPrice,
        targets,
        stopLoss,
        timeline,
        maxExitTime: maxExitTime.toISOString(),
        tradeTip,
        timestamp: new Date(),
      };

      logger.info("Successfully parsed trading signal:", {
        token,
        signal: signalText,
        currentPrice,
        targets,
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

      if (signal.currentPrice <= 0) {
        logger.warn("Invalid signal: entry price must be positive");
        return false;
      }

      if (signal.targets.length === 0) {
        logger.warn("Invalid signal: targets must be specified");
        return false;
      }

      if (signal.stopLoss <= 0) {
        logger.warn("Invalid signal: stop loss must be positive");
        return false;
      }

      // Signal-specific validation
      switch (signal.signal) {
        case SignalType.BUY:
          if (signal.targets.some((target) => target <= signal.currentPrice)) {
            logger.warn(
              "Invalid BUY signal: targets must be above entry price"
            );
            return false;
          }
          if (signal.stopLoss >= signal.currentPrice) {
            logger.warn(
              "Invalid BUY signal: stop loss must be below entry price"
            );
            return false;
          }
          break;

        case SignalType.PUT_OPTIONS:
          if (signal.targets.some((target) => target >= signal.currentPrice)) {
            logger.warn(
              "Invalid PUT signal: targets must be below entry price"
            );
            return false;
          }
          if (signal.stopLoss <= signal.currentPrice) {
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
    return `${signal.signal} ${signal.token} @ $${signal.currentPrice} | TP1: $${signal.targets[0]} | TP2: $${signal.targets[1]} | SL: $${signal.stopLoss}`;
  }

  /**
   * Format signal as text for display
   */
  static formatSignal(signal: TradingSignal): string {
    return `
🏛️ Token: ${signal.token} (${signal.tokenId})
📈 Signal: ${signal.signal}
💰 Entry Price: $${signal.currentPrice}
🎯 Targets:
  TP1: $${signal.targets[0]}
  TP2: $${signal.targets[1]}
🛑 Stop Loss: $${signal.stopLoss}
⏳ Timeline: ${signal.timeline}
💡 Trade Tip: ${signal.tradeTip}
📅 Timestamp: ${signal.timestamp ? signal.timestamp.toISOString() : new Date().toISOString()}
    `.trim();
  }
}
