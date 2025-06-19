# MongoDB Collections Setup

This service uses **MongoDB for everything**. Here's what gets created automatically:

## 📊 Collections Overview

### 1. `trading-signals` (Existing)

Your existing collection for trading signals:

```javascript
{
  "_id": "...",
  "tweet_id": "1930060975870279772",
  "twitterHandle": "Crypt0_Savage",
  "signal_data": {
    "tokenMentioned": "WETH",
    "signal": "Buy",
    "currentPrice": 3200,
    "targets": [3300, 3400],
    "stopLoss": 3100,
    // ... other fields
  },
  "subscribers": [
    { "username": "user1", "sent": false },
    { "username": "user2", "sent": false }
  ]
}
```

### 2. `user_vault_mappings` (New)

Maps usernames to vault addresses:

```javascript
{
  "_id": "...",
  "username": "testuser",
  "vaultAddress": "0x1234567890123456789012345678901234567890",
  "isActive": true,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

### 3. `positions` (New - Critical for Recovery)

Persists active trading positions across service restarts:

```javascript
{
  "_id": "...",
  "id": "pos_1704067200000_abc123def",
  "username": "testuser",
  "vaultAddress": "0x1234567890123456789012345678901234567890",
  "signal": {
    "token": "AAVE",
    "tokenId": "aave",
    "signal": "Buy",
    "currentPrice": 180.5,
    "targets": [190, 200, 210],
    "stopLoss": 170,
    "maxExitTime": "2024-01-10T12:00:00.000Z"
  },
  "status": "active",
  "entryExecuted": true,
  "exitExecuted": false,
  "actualEntryPrice": 181.2,
  "amountSwapped": 1000,
  "remainingAmount": 1000,
  "trailingStop": {
    "isActive": true,
    "peakPrice": 185.3,
    "trailPercent": 5,
    "targetsHit": [false, false, false]
  },
  "createdAt": "2024-01-01T12:00:00.000Z",
  "updatedAt": "2024-01-01T13:30:00.000Z",
  "lastMonitoredAt": "2024-01-01T13:30:00.000Z",
  "recoveredAt": "2024-01-01T14:00:00.000Z"
}
```

### 4. `trade_errors` (New - Critical for Error Tracking)

Stores failed trade attempts with detailed error information:

```javascript
{
  "_id": "...",
  "id": "trade_error_1704067200000_abc123def",
  "username": "testuser",
  "vaultAddress": "0x1234567890123456789012345678901234567890",
  "signal": {
    "token": "AAVE",
    "tokenId": "aave",
    "signal": "Buy",
    "currentPrice": 180.5,
    "targets": [190, 200],
    "stopLoss": 170
  },
  "error": "Insufficient balance of USDC in vault",
  "errorType": "insufficient_balance", // insufficient_balance, network_error, validation_error, execution_error, unknown
  "timestamp": "2024-01-01T12:00:00.000Z",
  "retryCount": 0,
  "resolved": false
}
```

### 5. `user_trading_settings` (Optional)

User-specific trading preferences:

```javascript
{
  "_id": "...",
  "username": "testuser",
  "enableAutomatedTrading": true,
  "maxPositionSize": 10.0,
  "riskLevel": "medium",
  "trailingStopEnabled": true,
  "trailingStopPercentage": 5.0,
  "maxDailyTrades": 10,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

## 🔧 Automatic Setup

The service automatically:

- ✅ **Creates collections** when first document is inserted
- ✅ **Creates indexes** for performance:
  - `user_vault_mappings.username` (unique)
  - `user_vault_mappings.vaultAddress`
  - `user_vault_mappings.isActive`
  - `user_vault_mappings.{isActive, username}` (compound)
  - `positions.id` (unique)
  - `positions.status`
  - `positions.username`
  - `positions.vaultAddress`
  - `positions.signal.tokenId`
  - `positions.{status, username}` (compound)
  - `positions.{status, signal.maxExitTime}` (compound)
  - `trade_errors.id` (unique)
  - `trade_errors.username`
  - `trade_errors.vaultAddress`
  - `trade_errors.errorType`
  - `trade_errors.timestamp`
  - `trade_errors.resolved`
  - `trade_errors.{username, errorType, resolved}` (compound)

## 🧪 Test Your Setup

### 1. Check Existing Signals

```bash
mongosh "your-mongodb-uri"
use ctxbt-signal-flow
db.trading-signals.countDocuments()
db.trading-signals.findOne()
```

### 2. Test User Registration

```bash
# Register a test user via API
curl -X POST http://localhost:3000/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "vaultAddress": "0x1234567890123456789012345678901234567890",
    "email": "test@example.com"
  }'

# Check if user was created
db.user_vault_mappings.findOne({"username": "testuser"})
```

### 3. Monitor Collections

```bash
# Check collection stats
db.trading-signals.stats()
db.user_vault_mappings.stats()
db.user_trading_settings.stats()

# Check indexes
db.user_vault_mappings.getIndexes()
```

## 📈 Performance Considerations

The service creates these indexes automatically:

- Fast user lookups
- Efficient filtering by active status
- Quick vault address searches

## 🔄 Migration from Existing Setup

If you already have user data elsewhere:

1. Export user data from your Next.js database
2. Transform to the `user_vault_mappings` format
3. Import into MongoDB:

```javascript
// Example bulk insert
db.user_vault_mappings.insertMany([
  {
    username: "user1",
    vaultAddress: "0x...",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  // ... more users
]);
```

## 🔄 Position Recovery Testing

Test the new position persistence and recovery:

```bash
# 1. Create positions via API
curl -X POST http://localhost:3000/signal \
  -H "Content-Type: application/json" \
  -d '{"signal_data": {"token": "AAVE", "signal": "Buy", "currentPrice": 180}}'

# 2. Check positions are persisted
curl http://localhost:3000/admin/recovery/status

# 3. Restart the service
# Stop service (Ctrl+C)
# Start service again (npm start)

# 4. Verify positions recovered
curl http://localhost:3000/admin/recovery/status

# 5. Manual recovery trigger (if needed)
curl -X POST http://localhost:3000/admin/recovery/positions
```

## ✅ Ready to Go!

Your MongoDB is now set up for:

- 🎯 **Trading signals** (existing)
- 👥 **User management** (new)
- 💾 **Position persistence** (new - critical for recovery)
- ⚙️ **Trading settings** (optional)

All using the **same database** and **same connection**! 🚀

### 🔥 Key Benefits of Position Persistence:

1. **Service Restart Safety** - No lost positions during restarts
2. **Crash Recovery** - Automatic position recovery on startup
3. **Multi-User Support** - Each user's positions tracked separately
4. **Monitoring Continuity** - Trailing stops and targets preserved
5. **Audit Trail** - Complete position history and recovery logs
