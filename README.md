# Trading AI Agent

A sophisticated AI-powered trading agent that automatically executes cryptocurrency trades based on signals, using the Game Engine SDK for AI decision-making and Enzyme Protocol SDK for DeFi swapping operations.

## Features

- **Signal Processing**: Automatically parse and validate trading signals from text messages
- **AI Decision Making**: Uses Game Engine SDK for intelligent trade execution decisions
- **DeFi Integration**: Executes trades through Enzyme Protocol vaults
- **Trailing Stop Strategy**: Implements sophisticated trailing stop loss after TP1 is reached
- **Live Price Monitoring**: Real-time token price tracking via CoinGecko API
- **Risk Management**: Position sizing, stop loss, and risk controls
- **RESTful API**: Complete API for signal processing and monitoring

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Game Engine   │    │   Trading AI    │    │ Enzyme Protocol │
│      SDK        │◄──►│     Agent       │◄──►│      SDK        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   CoinGecko     │
                    │      API        │
                    └─────────────────┘
```

## Signal Types Supported

### 1. Buy Signals
```
🚀 Bullish Alert 🚀
🏛️ Token: SAGA (saga-2)
📈 Signal: Buy
💰 Entry Price: $0.3753
🎯 Targets:
TP1: $0.75
TP2: $0.85
🛑 Stop Loss: $0.35
⏳ Timeline: June 2025
💡 Trade Tip: Bullish sentiment from the tweet...
```

### 2. Put Options
```
🐻 Bearish Put Option 🐻
🏛️ Token: HYPE (hyperliquid)
📈 Signal: Put Options
💰 Entry Price: $32.5255
🎯 Targets:
TP1: $30
TP2: $27
🛑 Stop Loss: $33
⏳ Timeline: Short-term (24-48 hours)
```

### 3. Hold Signals
```
⏳ Hold Steady ⏳
🏛️ Token: HYPE (hyperblast)
📈 Signal: Hold
💰 Entry Price: $0.0048
🎯 Targets:
TP1: $0.0054
TP2: $0.0058
🛑 Stop Loss: $0.0036
⏳ Timeline: Short-term (1-3 days)
```

## Installation

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Ethereum wallet with private key
- Game Engine API key
- Enzyme Protocol vault address
- CoinGecko API key (optional but recommended)

### Setup

1. **Clone and install dependencies:**
   ```bash
   git clone <repository-url>
   cd trading-ai-agent
   npm install
   ```

2. **Environment Configuration:**
   ```bash
   cp env.example .env
   ```

   Edit `.env` with your configuration:
   ```env
   # Game Engine API Configuration
   GAME_ENGINE_API_KEY=your_game_api_key_here

   # Enzyme Protocol Configuration
   ENZYME_VAULT_ADDRESS=your_enzyme_vault_address
   ENZYME_PRIVATE_KEY=your_private_key_here
   ETHEREUM_RPC_URL=https://mainnet.infura.io/v3/your_project_id

   # CoinGecko API (optional)
   COINGECKO_API_KEY=your_coingecko_api_key
   COINGECKO_BASE_URL=https://api.coingecko.com/api/v3

   # Trading Configuration
   DEFAULT_TRAIL_PERCENT=0.01
   MAX_POSITION_SIZE=1000
   MIN_POSITION_SIZE=10

   # Server Configuration
   PORT=3000
   NODE_ENV=development
   ```

3. **Build and start:**
   ```bash
   npm run build
   npm start
   ```

   For development:
   ```bash
   npm run dev
   ```

## API Endpoints

### Health Check
```http
GET /health
```
Returns system status and Game Engine initialization state.

### Process Trading Signal
```http
POST /signal
Content-Type: application/json

{
  "message": "🚀 Bullish Alert 🚀\n🏛️ Token: SAGA (saga-2)\n📈 Signal: Buy\n💰 Entry Price: $0.3753\n🎯 Targets:\nTP1: $0.75\nTP2: $0.85\n🛑 Stop Loss: $0.35\n⏳ Timeline: June 2025"
}
```

### Get Active Positions
```http
GET /positions
```
Returns current active positions and trailing stop statistics.

### Parse Signal (Testing)
```http
POST /parse-signal
Content-Type: application/json

{
  "message": "trading signal text..."
}
```
Parse and validate signal without executing trades.

### Get Configuration
```http
GET /config
```
Returns current system configuration (non-sensitive data only).

## Trailing Stop Strategy

The trailing stop strategy is designed to maximize profits while protecting against significant losses:

### Implementation Logic

**For Buy Signals:**
1. Monitor price until TP1 is hit
2. Once TP1 is reached, activate trailing stop
3. Track highest price reached (peak price)
4. Exit when price falls `trailPercent` below peak price

**For Put Options:**
1. Monitor price until TP1 is hit
2. Once TP1 is reached, activate trailing stop  
3. Track lowest price reached (lowest price)
4. Exit when price rises `trailPercent` above lowest price

### Configuration
- Default trail percent: 1% (configurable via `DEFAULT_TRAIL_PERCENT`)
- Trail percent range: 0.1% - 50%
- Activation: Only after TP1 is hit

## Game Engine Integration

The AI agent uses Game Engine SDK with the following capabilities:

### Agent Configuration
- **Goal**: Execute profitable trading strategies with proper risk management
- **Description**: Specialized cryptocurrency trading agent
- **Functions**: Signal parsing, trade execution, position monitoring, market data

### Worker Functions
1. `parse_trading_signal` - Parse and validate trading signals
2. `execute_trade_entry` - Execute trade entries via Enzyme Protocol
3. `monitor_positions` - Monitor active positions and trailing stops
4. `get_market_data` - Fetch live market data via CoinGecko

## Enzyme Protocol Integration

Trades are executed through Enzyme Protocol vaults with the following operations:

### Buy Shares (Entry)
- Converts USDC to vault shares
- Handles token approvals automatically
- Returns transaction hash on success

### Redeem Shares (Exit)
- Converts vault shares back to specified tokens
- Supports custom payout asset percentages
- Implements slippage protection

### Risk Management
- Position size validation
- Gas estimation and price checking
- Vault status verification before trading

## Development

### Project Structure
```
src/
├── config/           # Configuration management
├── services/         # Core business logic services
├── types/           # TypeScript type definitions
├── utils/           # Utility functions and helpers
├── server.ts        # Express server setup
└── index.ts         # Application entry point
```

### Key Services
- **GameEngineService**: Game Engine SDK integration and AI functions
- **EnzymeService**: Enzyme Protocol SDK integration
- **CoinGeckoService**: Live price data with caching
- **TrailingStopService**: Trailing stop strategy implementation

### Testing Signal Parsing
```bash
curl -X POST http://localhost:3000/parse-signal \
  -H "Content-Type: application/json" \
  -d '{"message": "🚀 Bullish Alert 🚀\n🏛️ Token: SAGA (saga-2)\n📈 Signal: Buy\n💰 Entry Price: $0.3753\n🎯 Targets:\nTP1: $0.75\nTP2: $0.85\n🛑 Stop Loss: $0.35"}'
```

## Security Considerations

- Private keys are stored in environment variables only
- API endpoints validate input parameters
- Sensitive configuration is not exposed in API responses
- Transaction signing is handled securely via ethers.js
- Position size limits prevent excessive risk

## Monitoring and Logging

- Comprehensive logging via Winston
- Structured log format with timestamps
- Separate error and combined log files
- Console output with color coding
- Request/response logging for API endpoints

## Performance Optimization

- CoinGecko API response caching (30s TTL)
- Parallel execution of independent operations
- Efficient position tracking data structures
- Optimized database-like operations in memory

## Error Handling

- Graceful handling of API failures
- Automatic retry logic for transient errors
- Detailed error logging and reporting
- Fallback mechanisms for critical operations
- Clean shutdown procedures

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with proper TypeScript types
4. Add tests for new functionality
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For support and questions:
- Check the logs in `logs/` directory
- Review configuration in `/config` endpoint
- Test signal parsing with `/parse-signal` endpoint
- Monitor system health via `/health` endpoint

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/purvik6062/ctxbt-cron-jobs)
