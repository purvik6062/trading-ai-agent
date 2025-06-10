export enum SignalType {
  HOLD = "Hold",
  BUY = "Buy",
  PUT_OPTIONS = "Put Options",
}

export enum TimelineType {
  SHORT_TERM = "Short-term",
  MEDIUM_TERM = "Medium-term",
  LONG_TERM = "Long-term",
}

export interface TradingSignal {
  token: string; // e.g., "COS (contentos)"
  tokenId: string; // CoinGecko token ID e.g., "contentos"
  signal: string; // e.g., "Buy"
  currentPrice: number;
  targets: number[]; // Array of target prices
  stopLoss: number;
  timeline: string; // e.g., "Short-term (1-7 days)"
  maxExitTime: string; // ISO date string
  tradeTip: string;
  tweet_id?: string;
  tweet_link?: string;
  tweet_timestamp?: string;
  priceAtTweet?: number;
  exitValue?: number | null;
  twitterHandle?: string;
  tokenMentioned?: string;
  timestamp?: Date; // Added when processed
}

export interface TrailingStopConfig {
  trailPercent: number;
  isActive: boolean;
  peakPrice?: number; // For buy signals
  lowestPrice?: number; // For put options
  tp1Hit: boolean;
  targetsHit: boolean[]; // Track which targets have been hit
  currentTargetIndex: number; // Which target we're currently aiming for
  partialExitPercentages?: number[]; // Percentage to exit at each target
}

export interface Position {
  id: string;
  signal: TradingSignal;
  trailingStop: TrailingStopConfig;
  currentPrice: number;
  entryExecuted: boolean;
  exitExecuted: boolean;
  status: PositionStatus;
  createdAt: Date;
  updatedAt: Date;
  entryTxHash?: string; // Transaction hash for entry
  exitTxHash?: string; // Transaction hash for exit
  actualEntryPrice?: number; // Actual price at which entry was executed
  amountSwapped?: number; // Amount of USDC swapped
  tokenAmountReceived?: number; // Amount of tokens received
  remainingAmount?: number; // Remaining position size after partial exits
  targetExitHistory?: TargetExit[]; // History of target-based exits
}

export interface TargetExit {
  targetIndex: number;
  targetPrice: number;
  actualExitPrice: number;
  amountExited: number;
  percentage: number;
  timestamp: Date;
  txHash?: string;
}

export enum PositionStatus {
  PENDING = "pending",
  ACTIVE = "active",
  CLOSED = "closed",
  FAILED = "failed",
  EXPIRED = "expired", // New status for time-based exits
}

export interface TokenPrice {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number;
  market_cap: number;
  volume: number;
  last_updated: string;
}

export interface TradeExecution {
  positionId: string;
  action: "entry" | "exit" | "trailing_stop" | "time_exit";
  price: number;
  amount: number;
  timestamp: Date;
  txHash?: string;
  success: boolean;
  error?: string;
}

// Position persistence types
export interface PersistedPosition extends Position {
  username?: string;
  vaultAddress?: string;
  lastMonitoredAt?: Date;
  recoveredAt?: Date;
}

export interface PositionRecoveryResult {
  totalRecovered: number;
  activePositions: number;
  expiredPositions: number;
  failedRecovery: number;
  recoveredPositions: PersistedPosition[];
  errors: string[];
}

export interface PositionGroup {
  id: string;
  token: string;
  tokenId: string;
  positions: Position[];
  totalExposure: number;
  averageEntryPrice: number;
  combinedTargets: number[];
  exitStrategy: "individual" | "grouped";
  status: "active" | "closed" | "partial";
}
