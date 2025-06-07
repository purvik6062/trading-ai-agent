# 🔐 API Security Implementation Guide

## 🛡️ Security Overview

Your Trading AI Agent now has **production-ready API security** implemented with:

✅ **API Key Authentication** - Secure token-based access control  
✅ **Role-Based Permissions** - Different access levels for different users  
✅ **Rate Limiting** - Prevent abuse and DoS attacks  
✅ **Request Sanitization** - Input validation and security headers  
✅ **Comprehensive Logging** - Track all API access and security events

## 🔑 API Key Types & Permissions

### 1. **Admin Key** (`API_KEY_ADMIN`)

- **Permissions**: Full access (`*`)
- **Can access**: All endpoints
- **Rate limit**: 200 requests per 15 minutes
- **Use case**: System administration, debugging, full control

### 2. **Trading Key** (`API_KEY_TRADING`)

- **Permissions**: `signal:process`, `positions:read`, `config:read`
- **Can access**: Trading signals, position data, configuration
- **Rate limit**: 100 requests per 15 minutes
- **Use case**: Automated trading systems, signal processing

### 3. **Read-Only Key** (`API_KEY_READ_ONLY`)

- **Permissions**: `positions:read`, `config:read`, `health:read`
- **Can access**: View-only endpoints
- **Rate limit**: 50 requests per 15 minutes
- **Use case**: Monitoring, dashboards, reporting

## 🚀 Quick Setup

### Step 1: Generate Secure API Keys

```bash
# Generate secure API keys
npm run generate-keys
```

This will output something like:

```
🔑 Generating secure API keys...

Add these to your .env file:
================================
API_KEY_ADMIN=admin_lx2k9m_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
API_KEY_TRADING=trading_lx2k9n_b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a1
API_KEY_READ_ONLY=readonly_lx2k9o_c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a1b2
================================
```

### Step 2: Update Your .env File

```bash
# API Security Configuration
API_SECURITY_ENABLED=true
API_KEY_ADMIN=admin_lx2k9m_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
API_KEY_TRADING=trading_lx2k9n_b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a1
API_KEY_READ_ONLY=readonly_lx2k9o_c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a1b2

# Rate Limiting Configuration
RATE_LIMITING_ENABLED=true
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_DEFAULT_MAX=100   # requests per window
```

### Step 3: Restart Your Service

```bash
npm run build
npm start
```

## 📡 API Usage Examples

### Making Authenticated Requests

All API requests now require the `X-API-Key` header:

```bash
# Health check with read-only key
curl -H "X-API-Key: readonly_lx2k9o_c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a1b2" \
     http://localhost:3000/health

# Process trading signal with trading key
curl -X POST \
     -H "Content-Type: application/json" \
     -H "X-API-Key: trading_lx2k9n_b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a1" \
     -d '{"message": "BUY AAPL 100 shares"}' \
     http://localhost:3000/signal

# Get positions with any valid key
curl -H "X-API-Key: readonly_lx2k9o_c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a1b2" \
     http://localhost:3000/positions
```

### JavaScript/Node.js Example

```javascript
const axios = require("axios");

const apiClient = axios.create({
  baseURL: "http://localhost:3000",
  headers: {
    "X-API-Key":
      "trading_lx2k9n_b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a1",
    "Content-Type": "application/json",
  },
});

// Process a trading signal
async function processSignal(message) {
  try {
    const response = await apiClient.post("/signal", { message });
    console.log("Signal processed:", response.data);
  } catch (error) {
    if (error.response?.status === 401) {
      console.error("Unauthorized: Invalid API key");
    } else if (error.response?.status === 403) {
      console.error("Forbidden: Insufficient permissions");
    } else if (error.response?.status === 429) {
      console.error("Rate limited: Too many requests");
    } else {
      console.error("Error:", error.message);
    }
  }
}
```

### Python Example

```python
import requests

headers = {
    'X-API-Key': 'trading_lx2k9n_b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a1',
    'Content-Type': 'application/json'
}

# Get positions
response = requests.get('http://localhost:3000/positions', headers=headers)

if response.status_code == 200:
    positions = response.json()
    print(f"Active positions: {positions}")
elif response.status_code == 401:
    print("Unauthorized: Invalid API key")
elif response.status_code == 429:
    print("Rate limited: Too many requests")
```

## 🔒 Security Features

### 1. **Secure Key Storage**

- API keys are hashed using SHA-256 before storage
- Timing-safe comparison prevents timing attacks
- Keys are never logged in plaintext

### 2. **Rate Limiting**

- Per-key rate limiting (not just IP-based)
- Different limits for different key types
- Configurable windows and limits
- Standard HTTP 429 responses

### 3. **Request Validation**

- Content-Type validation for POST requests
- Dangerous header removal
- Input sanitization
- CORS configuration

### 4. **Security Headers**

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security` for HTTPS
- Removes `X-Powered-By` header

### 5. **Comprehensive Logging**

- All authentication attempts logged
- Failed requests with key prefixes (not full keys)
- Rate limiting events
- Permission violations
- IP addresses and user agents

## 🚨 Error Responses

### 401 Unauthorized - Missing API Key

```json
{
  "success": false,
  "error": "Unauthorized",
  "message": "API key required. Include X-API-Key header."
}
```

### 401 Unauthorized - Invalid API Key

```json
{
  "success": false,
  "error": "Unauthorized",
  "message": "Invalid API key."
}
```

### 403 Forbidden - Insufficient Permissions

```json
{
  "success": false,
  "error": "Forbidden",
  "message": "Insufficient permissions for this operation."
}
```

### 429 Too Many Requests - Rate Limited

```json
{
  "success": false,
  "error": "Too many requests",
  "message": "Rate limit exceeded. Please try again later."
}
```

## 🛠️ Configuration Options

### Environment Variables

```bash
# Enable/disable security (default: enabled)
API_SECURITY_ENABLED=true

# API Keys (generate with npm run generate-keys)
API_KEY_ADMIN=your_admin_key_here
API_KEY_TRADING=your_trading_key_here
API_KEY_READ_ONLY=your_readonly_key_here

# Rate limiting
RATE_LIMITING_ENABLED=true
RATE_LIMIT_WINDOW_MS=900000    # 15 minutes in milliseconds
RATE_LIMIT_DEFAULT_MAX=100     # Default max requests per window
```

### Disabling Security (Development Only)

```bash
# ⚠️ NOT RECOMMENDED FOR PRODUCTION
API_SECURITY_ENABLED=false
```

When disabled, all endpoints are accessible without authentication.

## 🔄 Key Rotation

### Regular Key Rotation (Recommended)

1. **Generate new keys**:

   ```bash
   npm run generate-keys
   ```

2. **Update environment variables** with new keys

3. **Restart the service**:

   ```bash
   npm restart
   ```

4. **Update all clients** with new keys

5. **Monitor logs** for any authentication failures

### Emergency Key Rotation

If a key is compromised:

1. **Immediately disable the compromised key** by removing it from `.env`
2. **Restart the service**
3. **Generate and deploy new keys**
4. **Review logs** for unauthorized access
5. **Notify affected users**

## 📊 Monitoring & Alerting

### Log Monitoring

Monitor these log patterns for security events:

```bash
# Failed authentication attempts
grep "API request with invalid key" logs/app.log

# Permission violations
grep "insufficient permissions" logs/app.log

# Rate limiting events
grep "Rate limit exceeded" logs/app.log

# Successful authentications by key type
grep "Authenticated API request" logs/app.log
```

### Recommended Alerts

Set up alerts for:

- Multiple failed authentication attempts from same IP
- Unusual API usage patterns
- Rate limiting triggers
- Permission violation attempts
- New IP addresses accessing admin endpoints

## 🔧 Troubleshooting

### Common Issues

**Q: Getting 401 Unauthorized even with correct key**

- Check key format (should be `prefix_timestamp_64charhex`)
- Ensure no extra spaces or characters
- Verify key is in environment variables
- Check server logs for specific error

**Q: Rate limiting too restrictive**

- Adjust `RATE_LIMIT_DEFAULT_MAX` in environment
- Consider different limits for different key types
- Monitor actual usage patterns

**Q: Need to add custom permissions**

- Modify the `initializeSecurity()` method in `server.ts`
- Add new permission strings to key configurations
- Update route middleware with new permission requirements

### Debug Mode

Enable debug logging:

```bash
LOG_LEVEL=debug npm start
```

This will show detailed authentication and authorization logs.

## 🚀 Production Deployment

### Security Checklist

- [ ] **Strong API keys generated** (64+ characters)
- [ ] **Keys stored securely** (not in code/git)
- [ ] **HTTPS enabled** with valid certificates
- [ ] **Rate limiting configured** appropriately
- [ ] **Monitoring set up** for security events
- [ ] **Log rotation configured** to prevent disk filling
- [ ] **Backup procedures** for key recovery
- [ ] **Key rotation schedule** established

### Recommended Production Settings

```bash
# Production environment
NODE_ENV=production
API_SECURITY_ENABLED=true

# Stricter rate limiting for production
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_DEFAULT_MAX=50    # Lower limit for production

# Enhanced logging
LOG_LEVEL=info
```

## 📞 Support

If you need help with the security implementation:

1. **Check the logs** first for specific error messages
2. **Review this guide** for configuration options
3. **Test with curl** to isolate client vs server issues
4. **Verify environment variables** are loaded correctly

---

**🔐 Your Trading AI Agent is now secured with production-ready API authentication!**
