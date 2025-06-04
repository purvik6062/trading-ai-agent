# MongoDB Trading Signal Listener

A Node.js automation service that monitors MongoDB collections in real-time for trading signals and processes them based on configurable filters.

## 🚀 Features

- **Real-time MongoDB Change Streams**: Listens for new document insertions in real-time
- **Subscriber Filtering**: Filters signals based on target subscriber username
- **Token Validation**: Validates against predefined allowed tokens from `TOKEN_ADDRESSES`
- **Graceful Error Handling**: Robust error handling with automatic retry mechanisms
- **Configurable**: Environment-based configuration for easy deployment
- **TypeScript**: Full TypeScript support with comprehensive type definitions

## 📋 Prerequisites

- Node.js 18+ 
- MongoDB connection (Atlas or local)
- Access to the `ctxbt-signal-flow` database
- Trading signals collection with the required schema

## 🛠️ Installation

1. **Install dependencies** (MongoDB is already included):
   ```bash
   npm install
   ```

2. **Configure environment variables**:
   ```bash
   cp env.example .env
   ```

3. **Update `.env` with your MongoDB credentials**:
   ```env
   # MongoDB Configuration for Signal Listener
   MONGODB_URI=mongodb+srv://username:password@cluster0.ty5vk.mongodb.net/
   MONGODB_DATABASE=ctxbt-signal-flow
   MONGODB_COLLECTION=trading-signals
   TARGET_SUBSCRIBER=abhidavinci
   ```

## 🏃‍♂️ Usage

### Quick Start

The signal listener is now integrated into the main application. Simply run:

```bash
# Development mode
npm run dev

# Or build and run in production
npm run build
npm start
```

The MongoDB signal listener will automatically start when you run the main application, provided you have configured the `MONGODB_URI` environment variable.

## 📊 Expected Document Schema

The service expects MongoDB documents with the following structure:

```typescript
{
  "_id": "683fc985a720d3f1a8c0372a",
  "tweet_id": "1930060975870279772",
  "twitterHandle": "Crypt0_Savage",
  "coin": "illuvium",
  "signal_message": "🚀 **Bullish Alert** 🚀...",
  "signal_data": {
    "token": "ILV (illuvium)",
    "signal": "Buy",
    "currentPrice": 13.145773017747265,
    "targets": [13.5, 14],
    "stopLoss": 12.5,
    "timeline": "Intraday to 48 hours",
    "maxExitTime": "2025-06-05T04:20:04.782Z",
    "tradeTip": "ILV shows minor consolidation...",
    "tweet_id": "1930060975870279772",
    "tweet_link": "https://x.com/Crypt0_Savage/status/1930060975870279772",
    "tweet_timestamp": "2025-06-04T00:36:10.000Z",
    "priceAtTweet": 13.159958768224525,
    "exitValue": null,
    "twitterHandle": "Crypt0_Savage",
    "tokenMentioned": "ILV",
    "tokenId": "illuvium"
  },
  "generatedAt": { "$date": "2025-06-04T04:20:21.297Z" },
  "subscribers": [
    {
      "username": "abhidavinci",
      "sent": false
    }
  ],
  "tweet_link": "https://x.com/Crypt0_Savage/status/1930060975870279772",
  "messageSent": false
}
```

## 🔄 Processing Flow

1. **MongoDB Change Stream**: Monitors the `trading-signals` collection for new insertions
2. **Subscriber Filter**: Checks if `TARGET_SUBSCRIBER` exists in the `subscribers` array
3. **Token Validation**: Validates `signal_data.tokenMentioned` against allowed tokens in `TOKEN_ADDRESSES`
4. **Signal Processing**: If both filters pass, forwards `signal_data` to the `processSignal()` function

## ⚙️ Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGODB_URI` | Required | MongoDB connection string |
| `MONGODB_DATABASE` | `ctxbt-signal-flow` | Database name |
| `MONGODB_COLLECTION` | `trading-signals` | Collection name |
| `TARGET_SUBSCRIBER` | `abhidavinci` | Target subscriber username to filter |
| `LOG_LEVEL` | `info` | Logging level (debug, info, warn, error) |

### Allowed Tokens

The service validates tokens against the `TOKEN_ADDRESSES` object in `src/config/enzymeContracts.ts`. Currently supports 50+ tokens including:

- **Major Tokens**: WETH, WBTC, USDC, USDT, DAI, LINK, UNI, ARB
- **DeFi Tokens**: AAVE, CRV, CVX, GMX, GRT, BAL, COMP
- **LST Tokens**: WSTETH, RETH, SWETH, CBETH, WEETH
- **Aave Arbitrum Tokens**: AARBAAVE, AARBARB, AARBUSDC, etc.

## 🎯 Custom Signal Processing

The signal processing is now integrated with the existing Game Engine AI system. MongoDB signals are automatically converted to the standard `TradingSignal` format and processed through the same pipeline as REST API signals.

To customize the signal processing logic, modify the `processMongoSignal` function in `src/index.ts`:

```typescript
async function processMongoSignal(signalData: any): Promise<void> {
  try {
    // Convert MongoDB signal data to TradingSignal format
    const parsedSignal: TradingSignal = {
      token: signalData.token,
      tokenId: signalData.tokenId,
      signal: signalData.signal,
      currentPrice: signalData.currentPrice,
      targets: signalData.targets,
      stopLoss: signalData.stopLoss,
      timeline: signalData.timeline,
      maxExitTime: signalData.maxExitTime,
      tradeTip: signalData.tradeTip,
      // MongoDB-specific fields
      tweet_id: signalData.tweet_id,
      tweet_link: signalData.tweet_link,
      twitterHandle: signalData.twitterHandle,
    };

    // Process with Game Engine AI (same as REST API)
    const position = await gameEngineService.processTradingSignal(parsedSignal);
    
    if (position) {
      trailingStopService.addPosition(position);
      logger.info("✅ Trade executed for MongoDB signal");
    } else {
      logger.info("✅ Signal processed but no trade executed");
    }
  } catch (error) {
    logger.error("❌ Error processing MongoDB signal:", error);
    throw error;
  }
}
```

## 📝 Logging

The service provides comprehensive logging:

- **Info Level**: Connection status, signal processing, configuration
- **Debug Level**: Detailed filtering information
- **Error Level**: Connection errors, processing errors, retry attempts
- **Warn Level**: Change stream interruptions

Logs are written to console and can be configured for file output.

## 🛡️ Error Handling

### Automatic Recovery
- **Change Stream Errors**: Automatically restarts after 5 seconds
- **Connection Failures**: Retries connection with exponential backoff
- **Processing Errors**: Logs errors but continues monitoring

### Graceful Shutdown
- Handles `SIGINT` and `SIGTERM` signals
- Closes change streams properly
- Cleans up MongoDB connections

## 🧪 Testing

### Check Token Validation
```typescript
import { SignalListenerService } from './src/services/signalListenerService';

const service = new SignalListenerService();
console.log(service.checkTokenAllowed('WETH')); // true
console.log(service.checkTokenAllowed('INVALID')); // false
console.log(service.getAllowedTokens()); // Array of all allowed tokens
```

### Monitor Service Status

Check the signal listener status via the health endpoint:
```bash
curl http://localhost:3000/health
```

Response will include:
```json
{
  "status": "healthy",
  "services": {
    "signalListener": {
      "enabled": true,
      "connected": true,
      "listening": true
    }
  }
}
```

You can also check the configuration:
```bash
curl http://localhost:3000/config
```

## 🚨 Troubleshooting

### Common Issues

1. **Connection Errors**
   - Verify MongoDB URI and credentials
   - Check network connectivity
   - Ensure database and collection exist

2. **No Signals Processing**
   - Verify `TARGET_SUBSCRIBER` matches documents
   - Check if tokens are in `TOKEN_ADDRESSES`
   - Enable debug logging with `LOG_LEVEL=debug`

3. **Change Stream Errors**
   - Ensure MongoDB version supports change streams (3.6+)
   - Check MongoDB Atlas M0 limitations
   - Verify proper permissions

### Debug Mode
```bash
LOG_LEVEL=debug npm run signal-listener
```

## 🔮 Future Enhancements

- Dynamic subscriber management (multiple subscribers)
- Advanced filtering rules (price thresholds, time windows)
- Signal aggregation and deduplication
- Performance metrics and monitoring
- Database connection pooling
- Horizontal scaling support

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📞 Support

For issues and questions:
- Check the troubleshooting section
- Review logs for error details
- Create an issue in the repository 