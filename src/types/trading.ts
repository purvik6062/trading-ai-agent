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
  token: string;
  tokenId: string; // CoinGecko token ID
  signal: SignalType;
  entryPrice: number;
  targets: {
    tp1: number;
    tp2: number;
  };
  stopLoss: number;
  timeline: string;
  tradeTip?: string;
  timestamp: Date;
}

export interface TrailingStopConfig {
  trailPercent: number;
  isActive: boolean;
  peakPrice?: number; // For buy signals
  lowestPrice?: number; // For put options
  tp1Hit: boolean;
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
}

export enum PositionStatus {
  PENDING = "pending",
  ACTIVE = "active",
  CLOSED = "closed",
  FAILED = "failed",
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
  action: "entry" | "exit" | "trailing_stop";
  price: number;
  amount: number;
  timestamp: Date;
  txHash?: string;
  success: boolean;
  error?: string;
}
