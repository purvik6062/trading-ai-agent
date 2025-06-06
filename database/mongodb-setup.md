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

### 3. `user_trading_settings` (Optional)

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

## ✅ Ready to Go!

Your MongoDB is now set up for:

- 🎯 **Trading signals** (existing)
- 👥 **User management** (new)
- ⚙️ **Trading settings** (optional)

All using the **same database** and **same connection**! 🚀
