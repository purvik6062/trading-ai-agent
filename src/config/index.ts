import dotenv from "dotenv";

dotenv.config();

export const config = {
  // Game Engine Configuration
  gameEngine: {
    apiKey: process.env.GAME_ENGINE_API_KEY || "",
    baseUrl: process.env.GAME_ENGINE_BASE_URL || "https://api.virtuals.io",
  },

  // Enzyme Protocol Configuration
  enzyme: {
    vaultAddress: process.env.ENZYME_VAULT_ADDRESS || "",
    privateKey: process.env.ENZYME_PRIVATE_KEY || "",
    ethereumRpcUrl: process.env.ETHEREUM_RPC_URL || "",
  },

  // Wallet Configuration
  wallet: {
    privateKey: process.env.ENZYME_PRIVATE_KEY || "",
  },

  // RPC Configuration
  rpc: {
    url: process.env.ETHEREUM_RPC_URL || "https://arb1.arbitrum.io/rpc",
  },

  // CoinGecko API Configuration
  coinGecko: {
    apiKey: process.env.COINGECKO_API_KEY || "",
    baseUrl: "https://api.coingecko.com/api/v3",
  },

  // Trading Configuration
  trading: {
    defaultTrailPercent: parseFloat(
      process.env.DEFAULT_TRAIL_PERCENT || "0.02"
    ), // 2% trailing stop as decimal
    maxPositionSize: 25.0, // 25% max position size
    minPositionSize: 5.0, // 5% min position size
  },

  // Trailing Stop Configuration
  trailingStop: {
    enabled: process.env.TRAILING_STOP_ENABLED === "true" || true,
    percentage: parseFloat(process.env.TRAILING_STOP_PERCENTAGE || "2.0"),
  },

  // Server Configuration
  server: {
    port: parseInt(process.env.PORT || "3000"),
    cors: {
      enabled: process.env.CORS_ENABLED === "true" || true,
      origin: process.env.CORS_ORIGIN || "*",
    },
    nodeEnv: process.env.NODE_ENV || "development",
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || "info",
    file: process.env.LOG_FILE || "logs/app.log",
  },

  // MongoDB Configuration
  mongodb: {
    uri: process.env.MONGODB_URI,
    databaseName: process.env.MONGODB_DATABASE || "ctxbt-signal-flow",
    collectionName: process.env.MONGODB_COLLECTION || "trading-signals",
  },

  // API Security Configuration
  apiSecurity: {
    enabled: process.env.API_SECURITY_ENABLED !== "false", // Default enabled
    keys: {
      admin: process.env.API_KEY_ADMIN || "",
      trading: process.env.API_KEY_TRADING || "",
      readOnly: process.env.API_KEY_READ_ONLY || "",
    },
    rateLimiting: {
      enabled: process.env.RATE_LIMITING_ENABLED !== "false", // Default enabled
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000"), // 15 minutes
      defaultMax: parseInt(process.env.RATE_LIMIT_DEFAULT_MAX || "100"),
    },
  },
};

// Validate required environment variables
export const validateConfig = (): void => {
  const required = [
    "GAME_ENGINE_API_KEY",
    "ENZYME_VAULT_ADDRESS",
    "ENZYME_PRIVATE_KEY",
    "ETHEREUM_RPC_URL",
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }

  // Validate API security configuration
  if (config.apiSecurity.enabled) {
    const apiKeys = config.apiSecurity.keys;
    const securityWarnings: string[] = [];

    if (!apiKeys.admin && !apiKeys.trading && !apiKeys.readOnly) {
      securityWarnings.push("No API keys configured - API will be unsecured");
    }

    if (apiKeys.admin && apiKeys.admin.length < 32) {
      securityWarnings.push("Admin API key should be at least 32 characters");
    }

    if (apiKeys.trading && apiKeys.trading.length < 32) {
      securityWarnings.push("Trading API key should be at least 32 characters");
    }

    if (securityWarnings.length > 0) {
      console.warn("Security warnings:", securityWarnings.join(", "));
    }
  }
};
