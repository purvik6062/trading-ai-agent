# 🚀 Production Deployment Guide

## 📋 Pre-Deployment Checklist

Before hosting your Trading AI Agent Service, ensure you have:

### ✅ **Required Infrastructure:**

- [ ] **VPS/Cloud Server** (AWS, DigitalOcean, etc.)

- [ ] **Domain name** (optional but recommended)
- [ ] **SSL Certificate** (Let's Encrypt)
- [ ] **MongoDB access** (for trading signals and user data)

### ✅ **Required Credentials:**

- [ ] **Game Engine API Key**
- [ ] **MongoDB connection string**
- [ ] **RPC URL** (Arbitrum/Ethereum)
- [ ] **Delegated private key** (for vault operations)

## 🗄️ **Step 1: MongoDB Setup**

Your service uses **MongoDB for everything**:

- ✅ Trading signals (existing)
- ✅ User vault mappings (new collections)
- ✅ Trading settings (optional)

### **Ensure MongoDB Collections Exist**

The service will automatically create these collections:

- `trading-signals` (existing)
- `user_vault_mappings` (new)
- `user_trading_settings` (new)

### **MongoDB Connection String**

```bash
# Your existing MongoDB URI will be used for everything
MONGODB_URI=mongodb://your-mongodb-uri
MONGODB_DATABASE=ctxbt-signal-flow  # Same database
```

### **Test MongoDB Connection**

```bash
# Test your connection
mongosh "your-mongodb-uri"
use ctxbt-signal-flow
db.trading-signals.countDocuments()  # Should show existing signals
```

## 📦 **Step 2: Server Setup**

### **Install Dependencies**

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2

# Install nginx for reverse proxy
sudo apt install nginx

# Install certbot for SSL
sudo apt install certbot python3-certbot-nginx
```

### **Clone and Setup Project**

```bash
# Clone your repository
git clone https://github.com/your-repo/trading-ai-agent.git
cd trading-ai-agent

# Install dependencies
npm install

# Build the project
npm run build
```

## ⚙️ **Step 3: Environment Configuration**

### **Create Production Environment File**

```bash
# Create .env.production
cat > .env.production << EOF
# Server Configuration
NODE_ENV=production
PORT=3000

# MongoDB Configuration (for everything: signals + user data)
MONGODB_URI=mongodb://your-mongodb-uri
MONGODB_DATABASE=ctxbt-signal-flow
MONGODB_COLLECTION=trading-signals

# Blockchain Configuration
RPC_URL=https://arb1.arbitrum.io/rpc
PRIVATE_KEY=0x... # Your delegated private key
VAULT_ADDRESS=0x... # Default vault address (if needed)

# Game Engine Configuration
GAME_ENGINE_API_KEY=your-game-engine-api-key
GAME_ENGINE_BASE_URL=https://api.gameengine.ai

# Security
API_SECRET_KEY=your-long-random-secret-key
JWT_SECRET=another-long-random-secret

# Logging
LOG_LEVEL=info
EOF

# Secure the environment file
chmod 600 .env.production
```

## 🔄 **Step 4: Process Management with PM2**

### **Create PM2 Ecosystem File**

```bash
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'trading-ai-agent',
    script: 'dist/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    max_memory_restart: '1G',
    restart_delay: 4000,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
EOF

# Create logs directory
mkdir -p logs

# Start with PM2
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Setup PM2 startup
pm2 startup
# Follow the instructions shown
```

## 🌐 **Step 5: Nginx Reverse Proxy**

### **Create Nginx Configuration**

```bash
sudo cat > /etc/nginx/sites-available/trading-ai-agent << EOF
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://localhost:3000/health;
        access_log off;
    }

    # Rate limiting for API endpoints
    location /users/ {
        limit_req zone=api burst=10 nodelay;
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}

# Rate limiting zone
limit_req_zone \$binary_remote_addr zone=api:10m rate=10r/s;
EOF

# Enable the site
sudo ln -s /etc/nginx/sites-available/trading-ai-agent /etc/nginx/sites-enabled/

# Test nginx configuration
sudo nginx -t

# Restart nginx
sudo systemctl restart nginx
```

## 🔒 **Step 6: SSL Certificate**

```bash
# Get SSL certificate
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Test auto-renewal
sudo certbot renew --dry-run
```

## 🔥 **Step 7: Firewall Configuration**

```bash
# Setup UFW firewall
sudo ufw enable
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw deny 3000  # Block direct access to Node.js port
sudo ufw status
```

## 📊 **Step 8: Monitoring & Logging**

### **Setup Log Rotation**

```bash
sudo cat > /etc/logrotate.d/trading-ai-agent << EOF
/home/ubuntu/trading-ai-agent/logs/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 ubuntu ubuntu
    postrotate
        pm2 reload trading-ai-agent
    endscript
}
EOF
```

### **Setup Health Monitoring**

```bash
# Create health check script
cat > health-check.sh << EOF
#!/bin/bash
HEALTH_URL="https://your-domain.com/health"
RESPONSE=\$(curl -s -o /dev/null -w "%{http_code}" \$HEALTH_URL)

if [ \$RESPONSE -ne 200 ]; then
    echo "Health check failed with status \$RESPONSE"
    # Send alert (email, Slack, etc.)
    # Restart service if needed
    pm2 restart trading-ai-agent
fi
EOF

chmod +x health-check.sh

# Add to crontab (check every 5 minutes)
(crontab -l 2>/dev/null; echo "*/5 * * * * /home/ubuntu/trading-ai-agent/health-check.sh") | crontab -
```

## 🚀 **Step 9: Test Deployment**

### **Verify Service is Running**

```bash
# Check PM2 status
pm2 status

# Check logs
pm2 logs trading-ai-agent

# Test health endpoint
curl https://your-domain.com/health

# Test user registration
curl -X POST https://your-domain.com/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "vaultAddress": "0x1234567890123456789012345678901234567890",
    "email": "test@example.com"
  }'
```

## 🔄 **Step 10: Deployment Automation**

### **Create Deploy Script**

```bash
cat > deploy.sh << EOF
#!/bin/bash
set -e

echo "🚀 Deploying Trading AI Agent..."

# Pull latest code
git pull origin main

# Install dependencies
npm install

# Build project
npm run build

# Run database migrations (if any)
# npm run migrate

# Restart PM2
pm2 restart trading-ai-agent

# Wait for startup
sleep 10

# Health check
HEALTH=\$(curl -s https://your-domain.com/health | jq -r '.status')
if [ "\$HEALTH" = "healthy" ]; then
    echo "✅ Deployment successful!"
else
    echo "❌ Deployment failed - health check failed"
    exit 1
fi
EOF

chmod +x deploy.sh
```

## 📈 **Step 11: Performance Optimization**

### **Database Optimization**

```sql
-- Add database indexes for performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_vault_mappings_active_username
ON user_vault_mappings(is_active, username) WHERE is_active = true;

-- Analyze tables
ANALYZE user_vault_mappings;
```

### **Node.js Optimization**

```bash
# Add to .env.production
UV_THREADPOOL_SIZE=128
NODE_OPTIONS="--max-old-space-size=4096"
```

## 🎯 **Final Checklist**

Before going live:

- [ ] **Database is set up and accessible**
- [ ] **All environment variables are configured**
- [ ] **PM2 is running the service**
- [ ] **Nginx is proxying requests**
- [ ] **SSL certificate is installed**
- [ ] **Firewall is configured**
- [ ] **Health checks are working**
- [ ] **Monitoring is set up**
- [ ] **Backups are configured**
- [ ] **Integration with Next.js app is tested**

## 🆘 **Troubleshooting**

### **Common Issues:**

1. **Service won't start:**

   ```bash
   pm2 logs trading-ai-agent --lines 100
   ```

2. **Database connection issues:**

   ```bash
   # Test database connection
   psql -h your-db-host -U your-user -d your-db -c "SELECT 1;"
   ```

3. **MongoDB connection issues:**

   ```bash
   # Test MongoDB connection
   mongosh "your-mongodb-uri"
   ```

4. **SSL issues:**
   ```bash
   sudo certbot certificates
   sudo nginx -t
   ```

## 🎉 **You're Live!**

Your Trading AI Agent service is now running in production! 🚀

Next steps:

1. **Integrate with your Next.js app** using the API endpoints
2. **Add users** to start automated trading
3. **Monitor performance** and logs
4. **Scale horizontally** as needed

🎯 **Service URL:** `https://your-domain.com`
📊 **Health Check:** `https://your-domain.com/health`
📚 **API Docs:** See `INTEGRATION_GUIDE.md`
