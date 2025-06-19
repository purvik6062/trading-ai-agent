# Trading AI Agent

A sophisticated AI-powered cryptocurrency trading agent that automatically executes trades based on signals, featuring advanced position management with target-based partial exits, trailing stops, and time-based exit strategies.

## 🚀 Key Features

### 🤖 **AI-Powered Trading**

- **Game Engine SDK Integration**: Uses Virtuals Protocol Game Engine for intelligent decision-making
- **Signal Processing**: Supports both legacy text format and new structured object format
- **Smart Execution**: AI decides whether to execute trades based on market conditions and signal quality

### 📊 **Advanced Position Management**

- **Target-Based Partial Exits**: Automatic staged exits when price targets are hit (TP1, TP2, TP3+)
- **Trailing Stops**: Sophisticated trailing stop strategy activated after TP1
- **Time-Based Exits**: Automatic position closure when `maxExitTime` is reached
- **Real-Time Monitoring**: Centralized position monitoring every 30 seconds

### 🔄 **DeFi Integration**

- **Enzyme Protocol**: Executes all trades through Enzyme Protocol vaults
- **Multi-Token Support**: Handles various cryptocurrencies with proper token mapping
- **Slippage Protection**: Configurable slippage tolerance for all trades
- **Gas Optimization**: Efficient transaction management

### 📈 **Risk Management**

- **Position Sizing**: Fixed 10% USDC allocation per trade
- **Stop Loss Protection**: Traditional stop loss before TP1, trailing stops after
- **Market Validation**: Real-time price verification via CoinGecko API
- **Exit Conditions**: Multiple exit strategies for comprehensive risk control

## 🏗️ Architecture

```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│   Game Engine SDK   │    │   Trading AI Agent  │    │ Enzyme Protocol SDK │
│  (Decision Making)  │◄──►│   (Core Logic)      │◄──►│   (Trade Execution) │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
                                        │
                           ┌────────────┼────────────┐
                           ▼            ▼            ▼
                  ┌───────────────┐ ┌───────────┐ ┌─────────────────┐
                  │   CoinGecko   │ │ Trailing  │ │   Position      │
                  │     API       │ │   Stop    │ │   Monitoring    │
                  │ (Price Data)  │ │ Service   │ │   (Real-time)   │
                  └───────────────┘ └───────────┘ └─────────────────┘
```

## 🎯 Signal Processing Flow

### 1. Signal Input (Two Formats Supported)

#### **New Object Format** (Recommended)

```javascript
{
  "signal_data": {
    "token": "Arbitrum",
    "tokenId": "arbitrum",
    "signal": "Buy",
    "currentPrice": 0.3379,
    "targets": [0.4379, 0.5379],
    "stopLoss": 0.2379,
    "timeline": "Short-term (1-7 days)",
    "maxExitTime": "2024-12-20T10:30:00Z",
    "tradeTip": "Strong bullish momentum",
    "twitterHandle": "TradingExpert",
    "tokenMentioned": "ARB"
  }
}
```

#### **Legacy Text Format** (Still Supported)

```javascript
{
  "signal": "🚀 Bullish Alert 🚀\n🏛️ Token: SAGA (saga-2)\n📈 Signal: Buy\n💰 Entry Price: $0.3753\n🎯 Targets:\nTP1: $0.75\nTP2: $0.85\n🛑 Stop Loss: $0.35\n⏳ Timeline: June 2025"
}
```

### 2. AI Decision Process

1. **Signal Validation**: Parse and validate signal structure
2. **Market Analysis**: Get current price from CoinGecko
3. **Risk Assessment**: Evaluate potential gain vs risk
4. **Time Analysis**: Check if maxExitTime allows sufficient trading window
5. **Decision**: AI decides whether to execute or skip the trade

### 3. Trade Execution

1. **Token Mapping**: Convert signal token to tradeable symbol
2. **Enzyme Swap**: Execute USDC → Target Token swap (10% allocation)
3. **Position Creation**: Create tracked position with all metadata
4. **Monitoring Setup**: Add to centralized monitoring system

### 4. Position Lifecycle

```
📥 SIGNAL RECEIVED
        ↓
🤖 AI DECISION MAKING
        ↓
💰 TRADE EXECUTION (10% USDC)
        ↓
📊 POSITION ACTIVE
        ↓
     🎯 TARGET MONITORING
        ↓
┌─── TP1 HIT (50% EXIT) ──→ Trailing Stop Activated
│       ↓
└─── TP2 HIT (50% EXIT) ──→ Position Closed
        ↓
🏁 POSITION COMPLETE
```

## 🎯 Exit Strategies

### **Target-Based Partial Exits**

- **TP1 Hit**: Exit 50% of position, activate trailing stops on remaining 50%
- **TP2 Hit**: Exit remaining 50% (full position closure)
- **TP3+ Hit**: Full exit if any amount remaining

### **Trailing Stop Strategy**

**Activated after TP1 is hit:**

- **Buy Signals**: Trail 2% below peak price
- **Put Options**: Trail 2% above lowest price
- **Dynamic Tracking**: Continuously updates peak/lowest prices

### **Time-Based Exits**

- **maxExitTime Monitoring**: Automatic exit when time limit reached
- **Graceful Closure**: Market price exit with transaction logging
- **Status Update**: Position marked as `EXPIRED`

### **Traditional Stop Loss**

- **Before TP1**: Traditional stop loss protection
- **Immediate Exit**: Full position closure if stop loss hit

## 🛠️ Installation & Setup

### Prerequisites

- Node.js 18+
- npm or yarn
- Ethereum wallet with private key
- Game Engine API key
- Enzyme Protocol vault address

### Quick Start

1. **Clone and Install**

   ```bash
   git clone <repository-url>
   cd trading-ai-agent
   npm install
   ```

2. **Environment Configuration**

   ```bash
   cp env.example .env
   ```

   **Required Environment Variables:**

   ```env
   # Game Engine Configuration
   GAME_ENGINE_API_KEY=your_game_engine_api_key

   # Enzyme Protocol Configuration
   # Note: ENZYME_VAULT_ADDRESS is optional (fallback only) - users have individual vaults
   ENZYME_VAULT_ADDRESS=0xYourVaultAddress  # Optional: Legacy/fallback vault
   ENZYME_PRIVATE_KEY=your_private_key_here
   ETHEREUM_RPC_URL=https://mainnet.infura.io/v3/your_project_id

   # CoinGecko API
   COINGECKO_API_KEY=your_coingecko_api_key

   # Trading Settings
   DEFAULT_TRAIL_PERCENT=0.02  # 2% trailing stop
   MAX_POSITION_SIZE=1000
   MIN_POSITION_SIZE=10

   # Server Settings
   PORT=3000
   NODE_ENV=production
   ```

3. **Build and Start**

   ```bash
   npm run build
   npm start
   ```

   **Development Mode:**

   ```bash
   npm run dev
   ```

## 🌐 API Endpoints

### **Core Trading Endpoints**

#### Process Trading Signal

```http
POST /signal
Content-Type: application/json

{
  "username": "user123",
  "signal_data": {
    "token": "Arbitrum",
    "tokenId": "arbitrum",
    "signal": "Buy",
    "currentPrice": 0.3379,
    "targets": [0.4379, 0.5379],
    "stopLoss": 0.2379,
    "maxExitTime": "2024-12-20T10:30:00Z"
  }
}
```

**Note**: `username` is required for multi-user vault routing. The system will use the vault address associated with this user from the `user_vault_mappings` collection.

**Response:**

```json
{
  "success": true,
  "message": "Signal processed and trade executed",
  "position": {
    "id": "pos_1703075200000",
    "signal": { ... },
    "status": "active",
    "entryTxHash": "0x...",
    "actualEntryPrice": 0.3380,
    "amountSwapped": 100.0
  }
}
```

#### Get Active Positions

```http
GET /positions
```

**Response:**

```json
{
  "vault": [
    {
      "id": "pos_1703075200000",
      "signal": {
        "token": "Arbitrum",
        "targets": [0.4379, 0.5379],
        "maxExitTime": "2024-12-20T10:30:00Z"
      },
      "status": "active",
      "remainingAmount": 295.8,
      "targetExitHistory": []
    }
  ],
  "total": 1
}
```

### **Monitoring Endpoints**

#### Vault Information

```http
GET /vault
```

#### System Health

```http
GET /health
```

#### Configuration

```http
GET /config
```

### **Testing Endpoints**

#### Parse Signal (No Execution)

```http
POST /parse-signal
Content-Type: application/json

{
  "signal": "🚀 Bullish Alert 🚀\n🏛️ Token: SAGA..."
}
```

#### Manual Trade (Testing Only)

```http
POST /trade
Content-Type: application/json

{
  "fromToken": "USDC",
  "toToken": "WETH",
  "amountPercentage": 5,
  "maxSlippage": 1.0
}
```

## 🧪 Testing

### **Comprehensive Test Suite**

Run the included test script to validate all functionality:

```bash
node test-script.js
```

**Test Coverage:**

- ✅ Health check and configuration
- ✅ Signal parsing (both formats)
- ✅ AI decision making
- ✅ Trade execution via Enzyme
- ✅ Position tracking and monitoring
- ✅ Target-based partial exits
- ✅ Time-based exits (2-minute test)
- ✅ Trailing stop activation
- ✅ Real-time price monitoring

### **Test Signals**

The test script includes various signal types:

- **Quick Exit**: 2-minute timeout for rapid testing
- **Multi-Target**: 3 targets for staged exit testing
- **Put Options**: Bearish signal testing
- **Normal Timeframe**: 24-hour standard signals

## 🔧 Services Architecture

### **GameEngineService**

- **AI Decision Making**: Evaluates signals using Game Engine SDK
- **Position Management**: Creates and tracks all positions
- **Centralized Monitoring**: 30-second interval monitoring of all positions
- **Exit Execution**: Handles all types of position exits

### **TrailingStopService**

- **Target Tracking**: Monitors which targets have been hit
- **Partial Exit Logic**: Calculates exit percentages for each target
- **Trailing Stop Logic**: Implements dynamic trailing stops
- **Peak/Lowest Tracking**: Tracks optimal prices for trailing calculations

### **EnzymeVaultService**

- **Swap Execution**: All USDC ⟷ Token swaps via Enzyme Protocol
- **Transaction Management**: Gas estimation and transaction broadcasting
- **Vault Operations**: Share buying/selling for position management
- **Error Handling**: Robust transaction error recovery

### **CoinGeckoService**

- **Real-Time Prices**: Live token price feeds
- **Batch Requests**: Efficient multi-token price fetching
- **Caching**: 30-second TTL for API rate limiting
- **Token Mapping**: Converts symbols to CoinGecko IDs

## 📊 Position States & Transitions

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│   PENDING   │───▶│    ACTIVE    │───▶│   CLOSED    │
└─────────────┘    └──────────────┘    └─────────────┘
                           │                    ▲
                           ▼                    │
                   ┌──────────────┐            │
                   │   EXPIRED    │────────────┘
                   └──────────────┘
                           ▲
                           │
                   ┌──────────────┐
                   │    FAILED    │
                   └──────────────┘
```

**State Descriptions:**

- **PENDING**: Position created, waiting for entry execution
- **ACTIVE**: Trade executed, monitoring for exit conditions
- **CLOSED**: Position closed via target/trailing stop
- **EXPIRED**: Position closed due to maxExitTime
- **FAILED**: Position failed during execution

## ⚡ Real-Time Monitoring

### **Centralized Position Monitoring**

- **Frequency**: Every 30 seconds
- **Batch Processing**: Efficient API calls for multiple tokens
- **Exit Detection**: Monitors all exit conditions simultaneously
- **Logging**: Comprehensive logging of all monitoring activities

### **Exit Condition Monitoring**

1. **Target Prices**: Continuous price vs target comparison
2. **Trailing Stops**: Dynamic threshold calculations
3. **Time Limits**: maxExitTime countdown monitoring
4. **Stop Loss**: Traditional stop loss before TP1

### **Automated Actions**

- **Partial Exits**: Automatic execution when targets hit
- **Trailing Stop Updates**: Real-time peak/lowest price tracking
- **Time-Based Exits**: Automatic closure at maxExitTime
- **Transaction Logging**: Complete audit trail of all actions

## 🔒 Security & Risk Management

### **Position Sizing**

- **Fixed Allocation**: 10% of USDC per trade
- **Risk Limits**: Configurable min/max position sizes
- **Exposure Control**: Prevents over-leveraging

### **Transaction Security**

- **Private Key Management**: Secure environment variable storage
- **Gas Optimization**: Efficient gas estimation and pricing
- **Slippage Protection**: Configurable slippage tolerance
- **Transaction Verification**: Post-execution validation

### **Error Handling**

- **Graceful Degradation**: Continues operation despite individual failures
- **Retry Logic**: Automatic retry for transient errors
- **Comprehensive Logging**: Detailed error tracking and reporting
- **Safe Shutdown**: Clean shutdown procedures

## 📈 Performance Features

### **Optimization**

- **Parallel Processing**: Simultaneous operations where possible
- **API Caching**: Reduces external API calls
- **Memory Efficiency**: Optimized data structures
- **Batch Operations**: Grouped API requests for efficiency

### **Scalability**

- **Stateless Design**: Horizontally scalable architecture
- **Resource Management**: Efficient memory and CPU usage
- **Connection Pooling**: Optimized external service connections

## 🚀 Getting Started Example

1. **Start the server:**

   ```bash
   npm start
   ```

2. **Send a test signal:**

   ```bash
   curl -X POST http://localhost:3000/signal \
     -H "Content-Type: application/json" \
     -d '{
       "signal_data": {
         "token": "Arbitrum",
         "tokenId": "arbitrum",
         "signal": "Buy",
         "currentPrice": 0.3379,
         "targets": [0.4379, 0.5379],
         "stopLoss": 0.2379,
         "maxExitTime": "2024-12-20T10:30:00Z"
       }
     }'
   ```

3. **Monitor positions:**

   ```bash
   curl http://localhost:3000/positions
   ```

4. **Watch the logs for real-time monitoring!**

## 📝 Changelog

### **Latest Updates**

- ✅ **Target-Based Partial Exits**: Staged exits at TP1, TP2, TP3+
- ✅ **Time-Based Exit Strategy**: Automatic closure at maxExitTime
- ✅ **Centralized Monitoring**: 30-second interval position monitoring
- ✅ **Enhanced Position Tracking**: Complete exit history and metadata
- ✅ **Improved Error Handling**: Robust transaction and API error recovery
- ✅ **Game Engine Integration**: AI-powered trading decisions
- ✅ **Object Signal Format**: Structured signal input support

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

### **Troubleshooting**

- Check logs in `logs/` directory
- Verify configuration via `/config` endpoint
- Test signal parsing with `/parse-signal`
- Monitor system health via `/health`

### **Common Issues**

- **Transaction Failures**: Check gas limits and vault balance
- **Signal Parsing**: Verify signal format and required fields
- **Price Data**: Ensure CoinGecko API key is valid
- **Position Monitoring**: Check if maxExitTime format is correct

---

**Built with ❤️ for the crypto trading community**
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/purvik6062/trading-ai-agent)
