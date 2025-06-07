# 🔗 Trading AI Agent - Integration Guide

## 📋 Overview

This guide explains how to integrate the **Trading AI Agent Service** with your applications for **multi-user automated trading**. It includes specific examples for **Next.js applications** and general integration patterns.

> **🔐 Security Update**: This guide has been updated to include the new **MongoDB + Redis** API security implementation with API key authentication, rate limiting, and comprehensive access control.

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────────┐    ┌─────────────────┐
│   Next.js App   │────│ Trading AI Service   │────│     MongoDB     │
│  (Frontend)     │    │   (Express.js)       │    │ • trading-signals│
│   🔑 API Keys   │    │   🛡️ Secured API    │    │ • api_keys       │
└─────────────────┘    └──────────────────────┘    │ • user_mappings  │
        │                         │                 │ • user_settings  │
        │                         ▼                 └─────────────────┘
        │               ┌──────────────────────┐
        │               │       Redis          │
        │               │   🚦 Rate Limiting   │
        │               │   📊 Usage Tracking  │
        ▼               └──────────────────────┘
┌─────────────────┐    ┌──────────────────────┐
│ Your Next.js DB │    │   Enzyme Vaults      │
│ (User Profiles) │    │   (On-chain)         │
└─────────────────┘    └──────────────────────┘
```

### 🔐 Security Features

- **🔑 API Key Authentication**: MongoDB-stored API keys with SHA-256 hashing
- **🚦 Rate Limiting**: Redis-based distributed rate limiting with sliding windows
- **👤 Role-Based Access**: Admin, Trading, Read-Only, Integration, and Webhook keys
- **📊 Usage Tracking**: Per-key quotas (daily/monthly) and comprehensive analytics
- **🛡️ Request Security**: CORS, sanitization, IP whitelisting, and audit trails
- **🛡️ Admin Dashboard**: Complete UI for key management, monitoring, and analytics

### **API Key Roles & Permissions:**

| Role            | Prefix         | Rate Limit | Permissions                                           | Use Case                            |
| --------------- | -------------- | ---------- | ----------------------------------------------------- | ----------------------------------- |
| **Admin**       | `admin_`       | 200/15min  | `["*"]`                                               | System management, dashboard access |
| **Trading**     | `trading_`     | 100/15min  | `["signal:process", "positions:read", "config:read"]` | Core trading operations             |
| **Read-Only**   | `readonly_`    | 50/15min   | `["positions:read", "config:read", "health:read"]`    | Monitoring dashboards               |
| **Integration** | `integration_` | 150/15min  | Custom permissions                                    | Third-party apps                    |
| **Webhook**     | `webhook_`     | 500/15min  | `["webhook:receive", "signal:process"]`               | High-volume processing              |

### **Request Format:**

```bash
# All API requests require this header:
X-API-Key: your_api_key_here

# Example:
curl -H "X-API-Key: trading_abc123_def456..." https://api.example.com/signal
```

## 🎯 Integration Steps

### Step 1: Deploy Trading AI Service

1. **Environment Setup**

```bash
# Required environment variables (.env file)
NODE_ENV=production
PORT=3000

# MongoDB Configuration (same database as your signals)
MONGODB_URI=mongodb://your-mongodb-uri
MONGODB_DATABASE=ctxbt-signal-flow
MONGODB_COLLECTION=trading-signals

# Redis Configuration (for rate limiting)
REDIS_URL=redis://localhost:6379

# Blockchain Configuration
RPC_URL=https://arb1.arbitrum.io/rpc
PRIVATE_KEY=0x... # Your delegated private key for vault operations

# Game Engine Configuration
GAME_ENGINE_API_KEY=your-game-engine-api-key
GAME_ENGINE_BASE_URL=https://api.gameengine.ai

# API Security Configuration (REQUIRED)
API_SECURITY_ENABLED=true

# Note: API keys are now managed via MongoDB database
# Use the admin dashboard or CLI to generate keys:
# npm run generate-keys

# Rate Limiting Configuration
RATE_LIMITING_ENABLED=true
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_DEFAULT_MAX=100   # requests per window
```

2. **API Key Management**

### **Option A: CLI Generation (Development)**

```bash
# Generate initial keys for development
npm run generate-keys

# Output example:
# admin_lx2k9m_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
# trading_lx2k9n_b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a1
# readonly_lx2k9o_c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a1b2
```

### **Option B: Admin Dashboard (Production)**

```bash
# Access admin dashboard at:
# https://your-admin-dashboard.com/admin/dashboard

# Features:
# ✅ Create/revoke API keys with custom permissions
# ✅ Monitor usage and rate limits in real-time
# ✅ Manage user roles and access levels
# ✅ View audit logs and analytics
```

### **Option C: API Endpoints (Programmatic)**

```bash
# Create new key via API
curl -X POST https://your-api.com/api/keys \
  -H "X-API-Key: admin_your_admin_key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Frontend App Key",
    "type": "trading",
    "permissions": ["signal:process", "positions:read"]
  }'
```

3. **Install Dependencies & Start Service**

```bash
# Install dependencies (including new security packages)
npm install mongodb ioredis express-rate-limit

# Build the project
npm run build

# Start the service
npm start
# Service runs on http://localhost:3000

# Check health (now requires API key)
curl -H "X-API-Key: readonly_your_key_here" http://localhost:3000/health
```

### Step 2: Update Your Next.js App

#### 2.1 Create Secure API Integration Service

```typescript
// lib/tradingService.ts
export class TradingServiceClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(
    baseUrl: string = "http://localhost:3000",
    apiKey: string = process.env.TRADING_SERVICE_API_KEY || ""
  ) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;

    if (!this.apiKey) {
      throw new Error("Trading Service API key is required");
    }
  }

  private async makeRequest(endpoint: string, options: RequestInit = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      "Content-Type": "application/json",
      "X-API-Key": this.apiKey,
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        error: `HTTP ${response.status}`,
      }));
      throw new Error(
        error.message || error.error || `Request failed: ${response.status}`
      );
    }

    return response.json();
  }

  // Register user for automated trading
  async registerUser(userData: {
    username: string;
    vaultAddress: string;
    email?: string;
  }) {
    return this.makeRequest("/users/register", {
      method: "POST",
      body: JSON.stringify(userData),
    });
  }

  // Get user trading status
  async getUserInfo(username: string) {
    return this.makeRequest(`/users/${username}`);
  }

  // Get user's vault information
  async getUserVault(username: string) {
    return this.makeRequest(`/users/${username}/vault`);
  }

  // Get user's positions
  async getUserPositions(username: string) {
    return this.makeRequest(`/users/${username}/positions`);
  }

  // Update user settings
  async updateUserSettings(username: string, settings: any) {
    return this.makeRequest(`/users/${username}/settings`, {
      method: "PUT",
      body: JSON.stringify(settings),
    });
  }

  // Process trading signal
  async processSignal(message: string) {
    return this.makeRequest("/signal", {
      method: "POST",
      body: JSON.stringify({ message }),
    });
  }

  // Check service health
  async getHealth() {
    return this.makeRequest("/health");
  }

  // Get API usage statistics (admin only)
  async getUsageStats(keyId?: string) {
    const endpoint = keyId
      ? `/admin/api-keys/stats/usage?keyId=${keyId}`
      : "/admin/api-keys/stats/overview";
    return this.makeRequest(endpoint);
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

### Core Trading Endpoints

| Endpoint        | Method | Required Permission | Description              |
| --------------- | ------ | ------------------- | ------------------------ |
| `/signal`       | POST   | `signal:process`    | Process trading signal   |
| `/positions`    | GET    | `positions:read`    | Get active positions     |
| `/health`       | GET    | `health:read`       | Service health check     |
| `/config`       | GET    | `config:read`       | Service configuration    |
| `/parse-signal` | POST   | `*` (admin only)    | Parse signal for testing |

### API Key Management (Admin Only)

| Endpoint                         | Method | Required Permission | Description         |
| -------------------------------- | ------ | ------------------- | ------------------- |
| `/admin/api-keys`                | GET    | `*`                 | List all API keys   |
| `/admin/api-keys`                | POST   | `*`                 | Create new API key  |
| `/admin/api-keys/:keyId`         | GET    | `*`                 | Get API key details |
| `/admin/api-keys/:keyId/status`  | PUT    | `*`                 | Update key status   |
| `/admin/api-keys/:keyId`         | DELETE | `*`                 | Revoke API key      |
| `/admin/api-keys/stats/overview` | GET    | `*`                 | Usage statistics    |

### Request Headers

All requests must include:

```bash
Content-Type: application/json
X-API-Key: your_api_key_here
```

### Response Format

```json
{
  "success": true,
  "data": {
    // Response data
  },
  "message": "Optional message",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Error Responses

```json
{
  "success": false,
  "error": "Error Type",
  "message": "Detailed error message",
  "code": "ERROR_CODE",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

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

## 🔒 Advanced Security Implementation

### 1. API Key Management

The Trading AI Service now uses a comprehensive security system with MongoDB for API key storage and Redis for rate limiting:

#### API Key Types & Permissions

| Key Type        | Permissions                        | Rate Limit | Use Case                        |
| --------------- | ---------------------------------- | ---------- | ------------------------------- |
| **Admin**       | Full access (`*`)                  | 200/15min  | System management, key creation |
| **Trading**     | `signal:process`, `positions:read` | 100/15min  | Your Next.js app integration    |
| **Read-Only**   | `positions:read`, `config:read`    | 50/15min   | Monitoring dashboards           |
| **Integration** | Custom permissions                 | 150/15min  | Third-party integrations        |

#### Creating API Keys

```bash
# Method 1: Generate via command line
npm run generate-keys

# Method 2: Create via Admin API
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: admin_your_admin_key_here" \
  -d '{
    "name": "Next.js Integration Key",
    "type": "integration",
    "permissions": ["signal:process", "positions:read", "config:read"],
    "quotas": {
      "daily": 10000,
      "monthly": 300000
    },
    "ipWhitelist": ["your.server.ip.address"]
  }' \
  http://localhost:3000/admin/api-keys
```

### 2. Integration Security Setup

#### Environment Variables

```bash
# Trading Service .env
MONGODB_URI=mongodb://...
REDIS_URL=redis://localhost:6379
GAME_ENGINE_API_KEY=...
RPC_URL=...
PRIVATE_KEY=0x... # Delegated private key for all vault operations

# API Security (REQUIRED)
API_SECURITY_ENABLED=true
API_KEY_ADMIN=admin_your_secure_key
API_KEY_INTEGRATION=integration_your_integration_key

# Next.js .env.local
TRADING_SERVICE_API_KEY=integration_your_integration_key
TRADING_SERVICE_URL=https://your-trading-service.com
```

### 3. Rate Limiting & Quotas

#### Understanding Rate Limits

- **Window-based**: 15-minute sliding windows
- **Per-key tracking**: Each API key has independent limits
- **Distributed**: Uses Redis for cluster-safe rate limiting
- **Headers**: Rate limit info included in response headers

```bash
# Response headers include:
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1640995200
```

#### Handling Rate Limits in Your App

```typescript
// Enhanced error handling for rate limits
class RateLimitError extends Error {
  constructor(
    message: string,
    public retryAfter: number
  ) {
    super(message);
    this.name = "RateLimitError";
  }
}

export class TradingServiceClient {
  private async makeRequest(endpoint: string, options: RequestInit = {}) {
    try {
      const response = await fetch(url, { ...options, headers });

      if (response.status === 429) {
        const error = await response.json();
        const retryAfter = response.headers.get("retry-after");
        throw new RateLimitError(error.message, parseInt(retryAfter || "60"));
      }

      // Handle other error cases...
      return response.json();
    } catch (error) {
      if (error instanceof RateLimitError) {
        // Implement exponential backoff
        await new Promise((resolve) =>
          setTimeout(resolve, error.retryAfter * 1000)
        );
        return this.makeRequest(endpoint, options); // Retry once
      }
      throw error;
    }
  }
}
```

### 4. Security Best Practices

```typescript
// ✅ Good: Store API keys securely
const apiKey = process.env.TRADING_SERVICE_API_KEY;

// ❌ Bad: Hard-code API keys
const apiKey = "integration_lx2k9o_c3d4e5f6..."; // Never do this!

// ✅ Good: Validate API key format
if (!apiKey || !apiKey.startsWith("integration_")) {
  throw new Error("Invalid integration API key format");
}

// ✅ Good: Monitor API usage
async function getApiUsageStats() {
  const stats = await tradingService.getUsageStats();
  return {
    dailyUsage: stats.data.keys[0]?.dailyUsage || 0,
    monthlyUsage: stats.data.keys[0]?.monthlyUsage || 0,
    remaining: stats.data.keys[0]?.remaining || 0,
  };
}
```

### 5. Vault Delegation Setup

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

## 🚦 Rate Limiting & Error Handling

### **Rate Limits by Key Type:**

```typescript
// Default rate limits (customizable per key)
const rateLimits = {
  admin: "200 requests per 15 minutes",
  trading: "100 requests per 15 minutes",
  readonly: "50 requests per 15 minutes",
  integration: "150 requests per 15 minutes",
  webhook: "500 requests per 15 minutes",
};
```

### **Handling Rate Limit Errors:**

```typescript
// Example error handling for rate limits
const handleApiCall = async (apiCall: () => Promise<any>) => {
  try {
    return await apiCall();
  } catch (error) {
    if (error.code === "RATE_LIMITED") {
      const retryAfter = error.retryAfter; // seconds
      console.warn(`Rate limited. Retry after ${retryAfter} seconds`);

      // Implement exponential backoff
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));

      return handleApiCall(apiCall); // Retry
    }
    throw error;
  }
};
```

### **Error Response Format:**

```json
{
  "success": false,
  "error": "Rate Limited",
  "message": "Too many requests. Try again in 300 seconds.",
  "code": "RATE_LIMITED",
  "retryAfter": 300,
  "timestamp": "2025-01-20T10:30:00Z"
}
```

### **Security Best Practices:**

```typescript
// ✅ Good: Store API keys securely
const apiKey = process.env.TRADING_SERVICE_API_KEY;

// ❌ Bad: Hard-code API keys
const apiKey = "integration_lx2k9o_c3d4e5f6..."; // Never do this!

// ✅ Good: Validate API key format
if (!apiKey || !apiKey.startsWith("integration_")) {
  throw new Error("Invalid integration API key format");
}

// ✅ Good: Monitor API usage
async function getApiUsageStats() {
  const stats = await tradingService.getUsageStats();
  return {
    dailyUsage: stats.data.keys[0]?.dailyUsage || 0,
    monthlyUsage: stats.data.keys[0]?.monthlyUsage || 0,
    remaining: stats.data.keys[0]?.remaining || 0,
  };
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
