# 🔒 Security Guide for Trading AI Agent

## 🛡️ API Security Implementation

Your Trading AI Agent has **production-ready API security** implemented with:

✅ **API Key Authentication** - MongoDB-stored secure token-based access control  
✅ **Role-Based Permissions** - Different access levels for different users  
✅ **Rate Limiting** - Redis-based distributed rate limiting to prevent abuse  
✅ **Request Sanitization** - Input validation and security headers  
✅ **Comprehensive Logging** - Track all API access and security events
✅ **Admin Dashboard** - Complete UI for key management and monitoring

### 🔑 API Key Types & Permissions

| Role            | Prefix         | Rate Limit | Permissions                                           | Use Case                            |
| --------------- | -------------- | ---------- | ----------------------------------------------------- | ----------------------------------- |
| **Admin**       | `admin_`       | 200/15min  | `["*"]`                                               | System management, dashboard access |
| **Trading**     | `trading_`     | 100/15min  | `["signal:process", "positions:read", "config:read"]` | Core trading operations             |
| **Read-Only**   | `readonly_`    | 50/15min   | `["positions:read", "config:read", "health:read"]`    | Monitoring dashboards               |
| **Integration** | `integration_` | 150/15min  | Custom permissions                                    | Third-party apps                    |
| **Webhook**     | `webhook_`     | 500/15min  | `["webhook:receive", "signal:process"]`               | High-volume processing              |

### 🚀 API Key Management

#### Generate Secure API Keys

```bash
# Development: CLI Generation
npm run generate-keys

# Production: Admin Dashboard
# Access: https://your-admin-dashboard.com/admin/dashboard

# Programmatic: API Endpoints
curl -X POST https://your-api.com/api/keys \
  -H "X-API-Key: admin_your_admin_key" \
  -H "Content-Type: application/json" \
  -d '{"name": "Frontend App Key", "type": "trading"}'
```

#### Making Authenticated Requests

```bash
# All API requests require this header:
X-API-Key: your_api_key_here

# Example usage:
curl -H "X-API-Key: trading_abc123_def456..." https://api.example.com/signal
```

### 🔒 Security Features

#### 1. **Secure Key Storage**

- API keys are hashed using SHA-256 before MongoDB storage
- Timing-safe comparison prevents timing attacks
- Keys are never logged in plaintext
- Distributed across MongoDB (keys) + Redis (rate limiting)

#### 2. **Rate Limiting**

- Per-key rate limiting (not just IP-based)
- Redis-based sliding window implementation
- Different limits for different key types
- Configurable windows and quotas
- Standard HTTP 429 responses with retry headers

#### 3. **Request Validation**

- Content-Type validation for POST requests
- Dangerous header removal
- Input sanitization and validation
- CORS configuration with origin whitelisting

#### 4. **Security Headers**

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security` for HTTPS
- Removes `X-Powered-By` header

#### 5. **Comprehensive Logging**

- All authentication attempts logged
- Failed requests with key prefixes (not full keys)
- Rate limiting events and quota tracking
- Permission violations and access patterns
- IP addresses and user agents for audit trails

### 🚨 API Error Responses

#### 401 Unauthorized - Missing/Invalid API Key

```json
{
  "success": false,
  "error": "Unauthorized",
  "message": "Valid API key required",
  "code": "MISSING_API_KEY"
}
```

#### 403 Forbidden - Insufficient Permissions

```json
{
  "success": false,
  "error": "Forbidden",
  "message": "Insufficient permissions for this endpoint",
  "code": "INSUFFICIENT_PERMISSIONS",
  "required": ["signal:process"],
  "provided": ["positions:read"]
}
```

#### 429 Too Many Requests - Rate Limited

```json
{
  "success": false,
  "error": "Too Many Requests",
  "message": "Rate limit exceeded",
  "code": "RATE_LIMITED",
  "retryAfter": 300,
  "resetTime": "2024-01-15T10:30:00Z"
}
```

## 🛡️ Infrastructure Security

### 1. Environment Variables Security

- ✅ Never commit `.env` files to git
- ✅ Use strong, unique private keys
- ✅ Rotate API keys regularly
- ✅ Use environment-specific configurations

### 2. Network Security

```bash
# Configure firewall (UFW example)
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 80/tcp    # HTTP (redirect to HTTPS)
sudo ufw enable
```

### 3. SSL/TLS Configuration

```nginx
# Nginx reverse proxy configuration
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
    ssl_prefer_server_ciphers off;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-API-Key $http_x_api_key;
    }
}
```

### 4. Container Security

```dockerfile
# Security-hardened Dockerfile additions
FROM node:18-alpine

# Security updates
RUN apk update && apk upgrade && apk add --no-cache dumb-init

# Non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S trading -u 1001 -G nodejs

# Read-only root filesystem
COPY --chown=trading:nodejs . .
USER trading

# Run with dumb-init
ENTRYPOINT ["dumb-init", "--"]
```

### 5. Private Key Management

- ✅ Use hardware wallets for production keys
- ✅ Implement key rotation policies
- ✅ Monitor wallet transactions continuously
- ✅ Set up transaction amount limits
- ✅ Use multi-signature wallets for high-value operations

### 6. Database Security

```bash
# MongoDB security
- Use authentication and authorization
- Enable SSL/TLS connections
- Restrict network access with IP whitelisting
- Regular backups with encryption
- Monitor for unusual queries

# Redis security
- Use AUTH passwords
- Disable dangerous commands
- Use SSL/TLS connections
- Monitor memory usage and connections
```

### 7. Monitoring & Alerting

- ✅ Monitor failed authentication attempts
- ✅ Track unusual API usage patterns
- ✅ Alert on large transactions or positions
- ✅ Monitor position sizes and risk exposure
- ✅ Set up automated incident response

### 8. Backup & Recovery

- ✅ Regular configuration backups (encrypted)
- ✅ Trading history backups with retention policies
- ✅ Database backups with point-in-time recovery
- ✅ Disaster recovery plan with RTO/RPO targets
- ✅ Test recovery procedures regularly

## 🚨 Security Incident Response

### Immediate Actions:

1. **Stop the service**: `pm2 stop trading-ai-agent`
2. **Secure the wallet**: Transfer funds to secure wallet
3. **Revoke API keys**: Disable all compromised keys immediately
4. **Analyze logs**: Check for suspicious activity patterns
5. **Restore from backup**: Use clean configuration and data

### Investigation:

- Review transaction history and patterns
- Check API access logs for unauthorized usage
- Analyze trading patterns for anomalies
- Verify system integrity and file changes
- Document incident timeline and impact

## 📝 Security Audit Checklist

### Weekly:

- [ ] Review active positions and trading patterns
- [ ] Check transaction logs for unusual activity
- [ ] Monitor API usage and rate limiting effectiveness
- [ ] Verify wallet balances and transaction history
- [ ] Review failed authentication attempts

### Monthly:

- [ ] Rotate API keys and update client applications
- [ ] Update dependencies and security patches
- [ ] Review access logs and user permissions
- [ ] Test backup and recovery procedures
- [ ] Update firewall rules and security configurations

### Quarterly:

- [ ] Comprehensive security audit and penetration testing
- [ ] Review and update security policies
- [ ] Audit user permissions and access controls
- [ ] Update incident response procedures
- [ ] Security training and awareness updates
