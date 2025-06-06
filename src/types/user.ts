export interface User {
  id: string;
  username: string;
  email?: string;
  vaultAddress: string;
  isActive: boolean;
  tradingSettings: TradingSettings;
  createdAt: Date;
  updatedAt: Date;
  // Note: No private key stored - vault is delegated to our service address
}

export interface TradingSettings {
  enableAutomatedTrading: boolean;
  allowedTokens: string[];
  maxPositionSize: number; // Percentage of vault
  riskLevel: "low" | "medium" | "high";
  trailingStopEnabled: boolean;
  trailingStopPercentage: number;
  maxDailyTrades: number;
}

export interface UserVaultMapping {
  username: string;
  vaultAddress: string;
  isActive: boolean;
  // Note: No private key needed - we use delegated permissions
}

export interface UserSession {
  userId: string;
  username: string;
  vaultAddress: string;
  gameEngineService: any; // GameEngineService instance
  enzymeService: any; // EnzymeVaultService instance
}
