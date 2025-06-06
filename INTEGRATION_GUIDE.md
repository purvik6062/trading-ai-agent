# 🔗 Trading AI Agent - Integration Guide

## 📋 Overview

This guide explains how to integrate the **Trading AI Agent Service** with your existing **Next.js application** for **multi-user automated trading**.

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────────┐    ┌─────────────────┐
│   Next.js App   │────│ Trading AI Service   │────│     MongoDB     │
│  (Frontend)     │    │   (Express.js)       │    │ • trading-signals│
└─────────────────┘    └──────────────────────┘    │ • user_mappings  │
        │                         │                 │ • user_settings  │
        │                         │                 └─────────────────┘
        ▼                         ▼
┌─────────────────┐    ┌──────────────────────┐
│ Your Next.js DB │    │   Enzyme Vaults      │
│ (User Profiles) │    │   (On-chain)         │
└─────────────────┘    └──────────────────────┘
```

## 🎯 Integration Steps

### Step 1: Deploy Trading AI Service

1. **Environment Setup**

```bash
# Required environment variables (.env file)
NODE_ENV=development
PORT=3000

# MongoDB Configuration (same database as your signals)
MONGODB_URI=mongodb://your-mongodb-uri
MONGODB_DATABASE=ctxbt-signal-flow
MONGODB_COLLECTION=trading-signals

# Blockchain Configuration
RPC_URL=https://arb1.arbitrum.io/rpc
PRIVATE_KEY=0x... # Your delegated private key for vault operations

# Game Engine Configuration
GAME_ENGINE_API_KEY=your-game-engine-api-key
GAME_ENGINE_BASE_URL=https://api.gameengine.ai

# Optional: API Security
API_SECRET_KEY=your-api-secret-key
```

2. **Install & Start the Service**

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Start the service
npm start
# Service runs on http://localhost:3000

# Check health
curl http://localhost:3000/health
```

### Step 2: Update Your Next.js App

#### 2.1 Create API Integration Service

```typescript
// lib/tradingService.ts
export class TradingServiceClient {
  private baseUrl: string;

  constructor(baseUrl: string = "http://localhost:3000") {
    this.baseUrl = baseUrl;
  }

  // Register user for automated trading
  async registerUser(userData: {
    username: string;
    vaultAddress: string;
    email?: string;
  }) {
    const response = await fetch(`${this.baseUrl}/users/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userData),
    });
    return response.json();
  }

  // Get user trading status
  async getUserInfo(username: string) {
    const response = await fetch(`${this.baseUrl}/users/${username}`);
    return response.json();
  }

  // Get user's vault information
  async getUserVault(username: string) {
    const response = await fetch(`${this.baseUrl}/users/${username}/vault`);
    return response.json();
  }

  // Get user's positions
  async getUserPositions(username: string) {
    const response = await fetch(`${this.baseUrl}/users/${username}/positions`);
    return response.json();
  }

  // Update user settings
  async updateUserSettings(username: string, settings: any) {
    const response = await fetch(`${this.baseUrl}/users/${username}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    return response.json();
  }

  // Check service health
  async getHealth() {
    const response = await fetch(`${this.baseUrl}/health`);
    return response.json();
  }
}
```

#### 2.2 Update Vault Creation Flow

```typescript
// pages/api/vault/create.ts (or app/api/vault/create/route.ts for App Router)
import { TradingServiceClient } from "@/lib/tradingService";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { userId, vaultData, enableAutomatedTrading } = req.body;

    // 1. Create vault using your existing logic
    const vault = await createEnzymeVault(vaultData);

    // 2. Save vault to your database
    await saveVaultToDatabase({
      userId,
      vaultAddress: vault.address,
      // ... other vault data
    });

    // 3. If user wants automated trading, register with Trading AI Service
    if (enableAutomatedTrading) {
      const tradingService = new TradingServiceClient();

      const result = await tradingService.registerUser({
        username: userId, // or use actual username
        vaultAddress: vault.address,
        email: user.email,
      });

      if (result.success) {
        // Update user record to indicate automated trading is enabled
        await updateUserAutomatedTrading(userId, true);
      }
    }

    res.json({
      success: true,
      vault,
      automatedTradingEnabled: enableAutomatedTrading && result?.success,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
```

#### 2.3 Add Trading Dashboard Components

```tsx
// components/TradingDashboard.tsx
import { useState, useEffect } from "react";
import { TradingServiceClient } from "@/lib/tradingService";

interface TradingDashboardProps {
  username: string;
}

export function TradingDashboard({ username }: TradingDashboardProps) {
  const [userInfo, setUserInfo] = useState(null);
  const [positions, setPositions] = useState([]);
  const [vaultInfo, setVaultInfo] = useState(null);
  const [serviceHealth, setServiceHealth] = useState(null);

  const tradingService = new TradingServiceClient();

  useEffect(() => {
    loadDashboardData();
  }, [username]);

  const loadDashboardData = async () => {
    try {
      const [user, userPositions, vault, health] = await Promise.all([
        tradingService.getUserInfo(username),
        tradingService.getUserPositions(username),
        tradingService.getUserVault(username),
        tradingService.getHealth(),
      ]);

      setUserInfo(user);
      setPositions(userPositions.positions || []);
      setVaultInfo(vault);
      setServiceHealth(health);
    } catch (error) {
      console.error("Error loading dashboard data:", error);
    }
  };

  const toggleAutomatedTrading = async (enabled: boolean) => {
    try {
      await tradingService.updateUserSettings(username, { isActive: enabled });
      await loadDashboardData(); // Refresh data
    } catch (error) {
      console.error("Error updating settings:", error);
    }
  };

  return (
    <div className="trading-dashboard">
      <h2>Automated Trading Dashboard</h2>

      {/* Service Status */}
      <div className="service-status">
        <h3>Service Status</h3>
        <div
          className={`status ${serviceHealth?.status === "healthy" ? "healthy" : "unhealthy"}`}
        >
          {serviceHealth?.status || "Unknown"}
        </div>
        <p>
          Active Users:{" "}
          {serviceHealth?.services?.multiUserSignal?.activeUsers || 0}
        </p>
      </div>

      {/* User Settings */}
      <div className="user-settings">
        <h3>Trading Settings</h3>
        <label>
          <input
            type="checkbox"
            checked={userInfo?.user?.isActive || false}
            onChange={(e) => toggleAutomatedTrading(e.target.checked)}
          />
          Enable Automated Trading
        </label>
      </div>

      {/* Vault Information */}
      <div className="vault-info">
        <h3>Vault Information</h3>
        <p>Address: {vaultInfo?.vaultAddress}</p>
        <p>Portfolio Value: ${vaultInfo?.portfolioValue?.totalValueUSD}</p>
      </div>

      {/* Active Positions */}
      <div className="positions">
        <h3>Active Positions ({positions.length})</h3>
        {positions.map((position, index) => (
          <div key={index} className="position-card">
            <p>Token: {position.signal?.tokenMentioned}</p>
            <p>Status: {position.status}</p>
            <p>Entry Price: ${position.actualEntryPrice}</p>
            <p>Amount: {position.amountSwapped}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Step 3: MongoDB Collections Setup

The trading service uses **MongoDB for everything** (same database as your trading signals):

#### 3.1 Automatic Collections Created

The service automatically creates these collections in your existing MongoDB:

- ✅ `trading-signals` (your existing collection)
- ✅ `user_vault_mappings` (new - maps usernames to vault addresses)
- ✅ `user_trading_settings` (new - optional user preferences)

#### 3.2 Update Your Next.js Database (Optional)

You may want to track which users have automated trading enabled:

```sql
-- Add to your existing user table
ALTER TABLE users ADD COLUMN automated_trading_enabled BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN trading_service_registered_at TIMESTAMP;
```

**Note:** The trading service stores its own user mappings in MongoDB, so this is just for your Next.js app's reference.

### Step 4: MongoDB Signal Integration

#### 4.1 Your Existing Trading Signals Collection

Your existing `trading-signals` collection works as-is:

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
    // ... other signal fields
  },
  "subscribers": [
    { "username": "user1", "sent": false },
    { "username": "user2", "sent": false },
    // Add usernames of registered users who should receive signals
  ]
}
```

#### 4.2 New User Collections (Auto-Created)

**`user_vault_mappings`** - Maps users to their vaults:

```javascript
{
  "_id": "...",
  "username": "user1",
  "vaultAddress": "0x1234567890123456789012345678901234567890",
  "isActive": true,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

**`user_trading_settings`** - Optional user preferences:

```javascript
{
  "_id": "...",
  "username": "user1",
  "enableAutomatedTrading": true,
  "maxPositionSize": 10.0,
  "riskLevel": "medium",
  // ... other settings
}
```

## 🔄 Complete Integration Flow

### 1. User Creates Vault (Next.js App)

```
User → Next.js → Create Vault → Save to Database
```

### 2. User Enables Automated Trading

```
User → Next.js → Call Trading Service API → Register User
```

### 3. Signal Processing (Automated)

```
MongoDB Signal → Trading Service → Process for All Users → Execute Trades
```

### 4. User Views Results (Next.js App)

```
User → Next.js → Call Trading Service API → Display Positions/Results
```

## 📡 API Endpoints Reference

### User Management

- `POST /users/register` - Register user for automated trading
- `GET /users/:username` - Get user information
- `PUT /users/:username/settings` - Update user settings
- `GET /users` - Get all active users

### Vault & Trading

- `GET /users/:username/vault` - Get user's vault information
- `GET /users/:username/positions` - Get user's active positions
- `POST /users/:username/signal` - Test signal processing for specific user

### System

- `GET /health` - Service health check
- `GET /config` - Service configuration

## 🔒 Security Model: Vault Delegation

### ✅ **Correct Approach: No Private Keys Needed**

The trading service uses **vault delegation** instead of storing user private keys:

1. **During vault creation** (in your Next.js app):

   ```typescript
   // When user creates vault, delegate trading permissions
   await vault.delegate(TRADING_SERVICE_ADDRESS);
   ```

2. **Trading service only needs**:

   - ✅ User's vault address
   - ✅ Username for mapping
   - ✅ One delegated private key (from environment)

3. **Benefits**:
   - ✅ **More secure** - Users keep their private keys
   - ✅ **Better UX** - Users don't share sensitive data
   - ✅ **Revocable** - Users can revoke delegation anytime
   - ✅ **Simpler** - One key manages all vaults

## 🔒 Security Considerations

### 1. API Authentication

```typescript
// Add authentication middleware to Trading Service
app.use("/users", authenticateRequest);

function authenticateRequest(req, res, next) {
  const apiKey = req.headers["x-api-key"];
  if (!apiKey || !isValidApiKey(apiKey)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}
```

### 2. Environment Variables

```bash
# Trading Service .env
MONGODB_URI=mongodb://...
GAME_ENGINE_API_KEY=...
RPC_URL=...
PRIVATE_KEY=0x... # Delegated private key for all vault operations
API_SECRET_KEY=your-secret-key

# Next.js .env.local
TRADING_SERVICE_URL=http://localhost:3000
TRADING_SERVICE_API_KEY=your-api-key
```

### 3. Vault Delegation Setup

```typescript
// In your Next.js vault creation process
export async function createVaultWithDelegation(userWallet: Wallet) {
  // 1. Create the vault
  const vault = await createEnzymeVault(userWallet);

  // 2. Delegate trading permissions to your service
  const TRADING_SERVICE_ADDRESS = process.env.TRADING_SERVICE_ADDRESS;
  await vault.setOwner(TRADING_SERVICE_ADDRESS); // or appropriate delegation method

  // 3. Register with trading service
  await registerUserForTrading({
    username: user.id,
    vaultAddress: vault.address,
  });

  return vault;
}
```

## 🚀 Production Deployment

### 1. Deploy Trading Service

```bash
# Use PM2 or Docker
pm2 start src/index.js --name "trading-ai-agent"

# Or with Docker
docker build -t trading-ai-agent .
docker run -d -p 3000:3000 --env-file .env trading-ai-agent
```

### 2. Load Balancing

```nginx
# nginx.conf
upstream trading_service {
    server localhost:3000;
    server localhost:3001; # Multiple instances
}

server {
    listen 80;
    location /api/trading/ {
        proxy_pass http://trading_service/;
    }
}
```

### 3. Monitoring

```typescript
// Add monitoring to your Next.js app
const checkTradingServiceHealth = async () => {
  try {
    const health = await tradingService.getHealth();
    if (health.status !== "healthy") {
      // Alert administrators
      await sendAlert("Trading service is unhealthy");
    }
  } catch (error) {
    await sendAlert("Trading service is unreachable");
  }
};

// Run every 5 minutes
setInterval(checkTradingServiceHealth, 5 * 60 * 1000);
```

## 🎯 Testing

### 1. Test User Registration

```bash
curl -X POST http://localhost:3000/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "vaultAddress": "0x...",
    "email": "test@example.com"
  }'
```

### 2. Test Signal Processing

```bash
curl -X POST http://localhost:3000/users/testuser/signal \
  -H "Content-Type: application/json" \
  -d '{
    "signal_data": {
      "tokenMentioned": "WETH",
      "signal": "Buy",
      "currentPrice": 3200,
      "targets": [3300, 3400],
      "stopLoss": 3100
    }
  }'
```

## ✅ Quick Integration Checklist

### **Before Integration:**

- [ ] MongoDB is accessible with trading signals collection
- [ ] Game Engine API key is working
- [ ] Delegated private key has vault permissions
- [ ] Trading service starts successfully (`npm start`)
- [ ] Health endpoint returns healthy status

### **Integration Steps:**

- [ ] Add `TradingServiceClient` to your Next.js app
- [ ] Update vault creation to register users
- [ ] Add trading dashboard component
- [ ] Test user registration API
- [ ] Test signal processing for registered users

### **Production Deployment:**

- [ ] Follow the `DEPLOYMENT_GUIDE.md`
- [ ] Set up monitoring and alerts
- [ ] Configure SSL and domain
- [ ] Test with real trading signals

## 🤝 Next Steps

1. **Deploy the Trading Service** on your infrastructure
2. **Update your Next.js app** with the integration code
3. **Test with a few users** in staging environment
4. **Monitor and optimize** performance
5. **Scale horizontally** as user base grows

## 📚 Additional Resources

- 📖 **`DEPLOYMENT_GUIDE.md`** - Complete production deployment guide
- 🗄️ **`database/mongodb-setup.md`** - MongoDB collections reference
- 🔧 **API Endpoints** - All available endpoints documented above

The trading service is now ready for production use with multi-user support! 🎉
