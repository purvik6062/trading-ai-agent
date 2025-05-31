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
    defaultTrailPercent: 1.0, // 1% trailing stop
    maxPositionSize: 25.0, // 25% max position size
    minPositionSize: 5.0, // 5% min position size
  },

  // Trailing Stop Configuration
  trailingStop: {
    enabled: process.env.TRAILING_STOP_ENABLED === "true" || true,
    percentage: parseFloat(process.env.TRAILING_STOP_PERCENTAGE || "1.0"),
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
};
