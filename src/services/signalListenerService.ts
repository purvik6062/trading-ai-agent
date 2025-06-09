import { MongoClient, Db, Collection, ChangeStream } from "mongodb";
import { logger } from "../utils/logger";
import { config } from "../config";
import { TOKEN_ADDRESSES } from "../config/enzymeContracts";

// Interface for the trading signal document structure
interface TradingSignalDocument {
  _id: string;
  tweet_id: string;
  twitterHandle: string;
  coin: string;
  signal_message: string;
  signal_data: {
    token: string;
    signal: string;
    currentPrice: number;
    targets: number[];
    stopLoss: number;
    timeline: string;
    maxExitTime: string;
    tradeTip: string;
    tweet_id: string;
    tweet_link: string;
    tweet_timestamp: string;
    priceAtTweet: number;
    exitValue: null | number;
    twitterHandle: string;
    tokenMentioned: string;
    tokenId: string;
  };
  generatedAt: {
    $date: string;
  };
  subscribers: Array<{
    username: string;
    sent: boolean;
  }>;
  tweet_link: string;
  messageSent: boolean;
}

// Interface for processed signal data
interface ProcessedSignalData {
  token: string;
  signal: string;
  currentPrice: number;
  targets: number[];
  stopLoss: number;
  timeline: string;
  maxExitTime: string;
  tradeTip: string;
  tweet_id: string;
  tweet_link: string;
  tweet_timestamp: string;
  priceAtTweet: number;
  exitValue: null | number;
  twitterHandle: string;
  tokenMentioned: string;
  tokenId: string;
}

export class SignalListenerService {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private collection: Collection<TradingSignalDocument> | null = null;
  private changeStream: ChangeStream | null = null;
  private isConnected = false;
  private processSignalCallback?: (
    signalData: ProcessedSignalData,
    subscribers: Array<{ username: string; sent: boolean }>
  ) => Promise<void>;

  constructor(
    processSignalCallback?: (
      signalData: ProcessedSignalData,
      subscribers: Array<{ username: string; sent: boolean }>
    ) => Promise<void>
  ) {
    this.processSignalCallback = processSignalCallback;
    logger.info("SignalListenerService initialized");
  }

  /**
   * Connect to MongoDB and initialize the database and collection
   */
  async connect(): Promise<void> {
    try {
      logger.info("Connecting to MongoDB...", {
        uri: config?.mongodb.uri?.replace(/\/\/.*@/, "//***:***@"), // Mask credentials in logs
        database: config.mongodb.databaseName,
        collection: config.mongodb.collectionName,
      });

      this.client = new MongoClient(config?.mongodb?.uri || "");
      await this.client.connect();

      this.db = this.client.db(config.mongodb.databaseName);
      this.collection = this.db.collection<TradingSignalDocument>(
        config.mongodb.collectionName
      );

      this.isConnected = true;
      logger.info("Successfully connected to MongoDB");
    } catch (error) {
      logger.error("Failed to connect to MongoDB:", error);
      throw error;
    }
  }

  /**
   * Disconnect from MongoDB and cleanup resources
   */
  async disconnect(): Promise<void> {
    try {
      if (this.changeStream) {
        await this.changeStream.close();
        this.changeStream = null;
        logger.info("Change stream closed");
      }

      if (this.client) {
        await this.client.close();
        this.client = null;
        this.db = null;
        this.collection = null;
        this.isConnected = false;
        logger.info("Disconnected from MongoDB");
      }
    } catch (error) {
      logger.error("Error during MongoDB disconnection:", error);
      throw error;
    }
  }

  /**
   * Check if the token is allowed for trading
   */
  private isTokenAllowed(tokenMentioned: string): boolean {
    if (!tokenMentioned) {
      return false;
    }

    // Convert to uppercase for comparison (TOKEN_ADDRESSES keys are uppercase)
    const tokenSymbol = tokenMentioned.toUpperCase();
    console.log(tokenSymbol);
    console.log(
      Object.prototype.hasOwnProperty.call(TOKEN_ADDRESSES, tokenSymbol)
    );
    // Check if the token exists in our TOKEN_ADDRESSES object
    return Object.prototype.hasOwnProperty.call(TOKEN_ADDRESSES, tokenSymbol);
  }

  /**
   * Process trading signal
   */
  private async processSignal(
    signalData: ProcessedSignalData,
    subscribers: Array<{ username: string; sent: boolean }>
  ): Promise<void> {
    try {
      logger.info("Processing valid trading signal:", {
        tokenMentioned: signalData.tokenMentioned,
        signal: signalData.signal,
        currentPrice: signalData.currentPrice,
        twitterHandle: signalData.twitterHandle,
        tweet_id: signalData.tweet_id,
        subscribersCount: subscribers.length,
      });

      // Call the external processSignal function if provided
      if (this.processSignalCallback) {
        await this.processSignalCallback(signalData, subscribers);
      } else {
        // Default logging if no callback is set
        console.log("🚀 Processing Signal:", {
          token: signalData.tokenMentioned,
          action: signalData.signal,
          price: signalData.currentPrice,
          targets: signalData.targets,
          stopLoss: signalData.stopLoss,
          source: signalData.twitterHandle,
          subscribers: subscribers.map((s) => s.username),
        });
      }
    } catch (error) {
      logger.error("Error processing signal:", error);
      throw error;
    }
  }

  /**
   * Handle new document insertions from the change stream
   */
  private async handleNewDocument(
    document: TradingSignalDocument
  ): Promise<void> {
    try {
      logger.info("New trading signal document detected:", {
        tweet_id: document.tweet_id,
        coin: document.coin,
        twitterHandle: document.twitterHandle,
        tokenMentioned: document.signal_data?.tokenMentioned,
        subscribersCount: document.subscribers?.length || 0,
      });

      // Filter: Check if token is allowed for trading
      const isAllowed = this.isTokenAllowed(
        document.signal_data?.tokenMentioned
      );

      if (!isAllowed) {
        logger.info("Document filtered out: token not allowed");
        logger.debug("Document filtered out: token not allowed", {
          tokenMentioned: document.signal_data?.tokenMentioned,
          allowedTokens: Object.keys(TOKEN_ADDRESSES).slice(0, 10) + "...", // Show first 10 for brevity
        });
        return;
      }

      // Check if there are any subscribers
      if (!document.subscribers || document.subscribers.length === 0) {
        logger.debug("Document filtered out: no subscribers", {
          tweet_id: document.tweet_id,
        });
        return;
      }

      // Token filter passed - process the signal with all subscribers
      logger.info("Document passed filters, processing signal:", {
        tweet_id: document.tweet_id,
        tokenMentioned: document.signal_data.tokenMentioned,
        subscribersCount: document.subscribers.length,
        subscribers: document.subscribers.map((s) => s.username),
      });

      await this.processSignal(document.signal_data, document.subscribers);
    } catch (error) {
      logger.error("Error handling new document:", error);
    }
  }

  /**
   * Start listening for real-time changes in the trading-signals collection
   */
  async startListening(): Promise<void> {
    if (!this.isConnected || !this.collection) {
      throw new Error("Must connect to MongoDB before starting to listen");
    }

    try {
      logger.info("Starting MongoDB change stream listener...");

      // Create change stream to watch for insert operations
      this.changeStream = this.collection.watch(
        [{ $match: { operationType: "insert" } }],
        {
          fullDocument: "updateLookup",
          resumeAfter: undefined, // Start from the current time
        }
      );

      logger.info("Change stream started successfully");

      // Listen for change events
      this.changeStream.on("change", async (change) => {
        try {
          if (change.operationType === "insert" && change.fullDocument) {
            await this.handleNewDocument(
              change.fullDocument as TradingSignalDocument
            );
          }
        } catch (error) {
          logger.error("Error in change stream event handler:", error);
        }
      });

      // Handle change stream errors
      this.changeStream.on("error", (error) => {
        logger.error("Change stream error:", error);
        // Attempt to restart the change stream after a delay
        setTimeout(() => {
          this.restartChangeStream();
        }, 5000);
      });

      // Handle change stream close
      this.changeStream.on("close", () => {
        logger.warn("Change stream closed");
      });

      logger.info("MongoDB signal listener is now active", {
        mode: "multi-user",
        allowedTokensCount: Object.keys(TOKEN_ADDRESSES).length,
      });
    } catch (error) {
      logger.error("Failed to start change stream:", error);
      throw error;
    }
  }

  /**
   * Restart the change stream in case of errors
   */
  private async restartChangeStream(): Promise<void> {
    try {
      logger.info("Attempting to restart change stream...");

      if (this.changeStream) {
        await this.changeStream.close();
        this.changeStream = null;
      }

      await this.startListening();
      logger.info("Change stream restarted successfully");
    } catch (error) {
      logger.error("Failed to restart change stream:", error);
      // Retry after a longer delay
      setTimeout(() => {
        this.restartChangeStream();
      }, 15000);
    }
  }

  /**
   * Stop listening for changes
   */
  async stopListening(): Promise<void> {
    if (this.changeStream) {
      await this.changeStream.close();
      this.changeStream = null;
      logger.info("Stopped listening for trading signal changes");
    }
  }

  /**
   * Get connection status
   */
  getStatus(): { connected: boolean; listening: boolean } {
    return {
      connected: this.isConnected,
      listening: !!this.changeStream,
    };
  }

  /**
   * Test method to check if a token is allowed
   */
  checkTokenAllowed(tokenSymbol: string): boolean {
    return this.isTokenAllowed(tokenSymbol);
  }

  /**
   * Get list of allowed tokens
   */
  getAllowedTokens(): string[] {
    return Object.keys(TOKEN_ADDRESSES);
  }
}
