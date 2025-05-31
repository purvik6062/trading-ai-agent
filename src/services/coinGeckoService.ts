import axios, { AxiosInstance } from "axios";
import { config } from "../config";
import { TokenPrice } from "../types/trading";
import { logger } from "../utils/logger";

export class CoinGeckoService {
  private api: AxiosInstance;
  private priceCache: Map<string, { price: TokenPrice; timestamp: number }> =
    new Map();
  private readonly CACHE_DURATION = 30000; // 30 seconds

  constructor() {
    this.api = axios.create({
      baseURL: config.coinGecko.baseUrl,
      timeout: 10000,
      headers: {
        "Content-Type": "application/json",
        ...(config.coinGecko.apiKey && {
          "x-cg-demo-api-key": config.coinGecko.apiKey,
        }),
      },
    });
  }

  /**
   * Get token price by CoinGecko ID
   */
  async getTokenPrice(tokenId: string): Promise<TokenPrice | null> {
    try {
      // Check cache first
      const cached = this.priceCache.get(tokenId);
      if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
        logger.debug(`Using cached price for ${tokenId}`);
        return cached.price;
      }

      logger.info(`Fetching price for token: ${tokenId}`);

      const response = await this.api.get("/coins/markets", {
        params: {
          vs_currency: "usd",
          ids: tokenId,
          order: "market_cap_desc",
          per_page: 1,
          page: 1,
          sparkline: false,
          price_change_percentage: "24h",
        },
      });

      if (response.data && response.data.length > 0) {
        const tokenData = response.data[0];
        const tokenPrice: TokenPrice = {
          id: tokenData.id,
          symbol: tokenData.symbol,
          name: tokenData.name,
          current_price: tokenData.current_price,
          price_change_percentage_24h: tokenData.price_change_percentage_24h,
          market_cap: tokenData.market_cap,
          volume: tokenData.total_volume,
          last_updated: tokenData.last_updated,
        };

        // Cache the result
        this.priceCache.set(tokenId, {
          price: tokenPrice,
          timestamp: Date.now(),
        });

        logger.info(
          `Successfully fetched price for ${tokenId}: $${tokenPrice.current_price}`
        );
        return tokenPrice;
      }

      logger.warn(`No price data found for token: ${tokenId}`);
      return null;
    } catch (error) {
      logger.error(`Error fetching price for ${tokenId}:`, error);
      return null;
    }
  }

  /**
   * Get multiple token prices
   */
  async getMultipleTokenPrices(tokenIds: string[]): Promise<TokenPrice[]> {
    try {
      const uniqueTokenIds = [...new Set(tokenIds)];

      // Check cache for each token
      const cachedPrices: TokenPrice[] = [];
      const uncachedTokenIds: string[] = [];

      uniqueTokenIds.forEach((tokenId) => {
        const cached = this.priceCache.get(tokenId);
        if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
          cachedPrices.push(cached.price);
        } else {
          uncachedTokenIds.push(tokenId);
        }
      });

      if (uncachedTokenIds.length === 0) {
        return cachedPrices;
      }

      logger.info(`Fetching prices for tokens: ${uncachedTokenIds.join(", ")}`);

      const response = await this.api.get("/coins/markets", {
        params: {
          vs_currency: "usd",
          ids: uncachedTokenIds.join(","),
          order: "market_cap_desc",
          per_page: 250,
          page: 1,
          sparkline: false,
          price_change_percentage: "24h",
        },
      });

      const newPrices: TokenPrice[] = response.data.map((tokenData: any) => {
        const tokenPrice: TokenPrice = {
          id: tokenData.id,
          symbol: tokenData.symbol,
          name: tokenData.name,
          current_price: tokenData.current_price,
          price_change_percentage_24h: tokenData.price_change_percentage_24h,
          market_cap: tokenData.market_cap,
          volume: tokenData.total_volume,
          last_updated: tokenData.last_updated,
        };

        // Cache the result
        this.priceCache.set(tokenData.id, {
          price: tokenPrice,
          timestamp: Date.now(),
        });

        return tokenPrice;
      });

      return [...cachedPrices, ...newPrices];
    } catch (error) {
      logger.error("Error fetching multiple token prices:", error);
      return [];
    }
  }

  /**
   * Search for token by symbol
   */
  async searchToken(symbol: string): Promise<string | null> {
    try {
      logger.info(`Searching for token with symbol: ${symbol}`);

      const response = await this.api.get("/search", {
        params: {
          query: symbol,
        },
      });

      if (
        response.data &&
        response.data.coins &&
        response.data.coins.length > 0
      ) {
        // Return the first match's ID
        const tokenId = response.data.coins[0].id;
        logger.info(`Found token ID for ${symbol}: ${tokenId}`);
        return tokenId;
      }

      logger.warn(`No token found for symbol: ${symbol}`);
      return null;
    } catch (error) {
      logger.error(`Error searching for token ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Clear price cache
   */
  clearCache(): void {
    this.priceCache.clear();
    logger.info("Price cache cleared");
  }

  /**
   * Get cache size
   */
  getCacheSize(): number {
    return this.priceCache.size;
  }
}
