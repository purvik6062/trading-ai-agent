# Next.js Integration Checklist ✅

Quick checklist for integrating the Trading AI Agent with your existing Next.js application.

## 🚀 Pre-Integration Requirements

- [ ] Trading AI Agent service is running (`npm start`)
- [ ] MongoDB connection is working with trading signals
- [ ] API keys are generated and working (`npm run generate-keys`)
- [ ] Health endpoint responds: `curl -H "X-API-Key: readonly_key" http://localhost:3000/health`

## 📦 Next.js Setup

### 1. Dependencies

```bash
npm install axios chalk  # Basic dependencies
```

### 2. Environment Variables

Add to your `.env.local`:

```bash
TRADING_SERVICE_URL=http://localhost:3000
TRADING_SERVICE_API_KEY=integration_your_generated_key
```

### 3. Core Integration Files

Create these files in your Next.js project:

- [ ] `lib/tradingService.ts` - API client (from integration guide)
- [ ] `components/TradingDashboard.tsx` - User dashboard
- [ ] `components/AdminDashboard.tsx` - Admin management (optional)

## 🔗 Integration Points

### User Registration Flow

- [ ] Update vault creation to register users with trading service
- [ ] Add "Enable Automated Trading" checkbox to vault creation form
- [ ] Handle registration success/failure states

### Dashboard Integration

- [ ] Add trading dashboard to user profile/vault page
- [ ] Include service health monitoring
- [ ] Show active positions and trading status
- [ ] Add error statistics display (new feature)

### Admin Features (Optional)

- [ ] Add admin dashboard for position recovery
- [ ] Include error management interface
- [ ] Add bulk user management features

## 🎛️ Available Endpoints

### For Regular Users (`trading` or `readonly` API key):

```bash
# User Management
GET /users/:username                 # Get user info
PUT /users/:username/settings        # Update settings
GET /users/:username/positions       # Get positions
GET /users/:username/vault          # Get vault info

# Trading Operations
POST /signal                        # Process signal
GET /positions                      # Get all positions
GET /health                         # Service health
```

### For Admins (`admin` API key):

```bash
# Position Recovery
POST /admin/recovery/positions      # Trigger recovery
GET /admin/recovery/status         # Recovery status

# Error Management (NEW)
GET /admin/errors/summary          # Error overview
GET /admin/errors/stats           # Detailed stats
POST /admin/errors/cleanup        # Cleanup old errors
```

## 🔧 Testing Your Integration

### 1. Test Service Connection

```bash
# In your Next.js project
npm run build
npm run dev

# Test the trading service client
curl -H "X-API-Key: $YOUR_API_KEY" http://localhost:3000/health
```

### 2. Test User Registration

```javascript
// In your browser console or test file
const tradingService = new TradingServiceClient();

await tradingService.registerUser({
  username: "testuser",
  vaultAddress: "0x1234...",
  email: "test@example.com",
});
```

### 3. Test Dashboard Components

- [ ] User dashboard loads correctly
- [ ] Service health shows "healthy" status
- [ ] Error statistics display properly (should show 0 initially)
- [ ] Position recovery status accessible (admin only)

## 🚨 Error Management Features (NEW)

Your integration now includes smart error management:

- **Console Flooding Prevention**: CoinGecko and other API errors are rate-limited
- **Error Categorization**: Similar errors are grouped and suppressed
- **Admin Monitoring**: Real-time error statistics and management
- **Automatic Cleanup**: Old errors are cleaned automatically

### Quick Error Management Test:

```bash
# View current error stats
npm run errors:summary

# View detailed error breakdown
npm run errors:stats

# Cleanup old errors
npm run errors:cleanup
```

## 🎯 Next Steps After Integration

1. **Deploy Trading Service** to production environment
2. **Update API URLs** in environment variables
3. **Set up monitoring** for service health
4. **Configure SSL/domain** for production
5. **Test with real users** in staging environment

## 🆘 Troubleshooting

### Common Issues:

**Service not responding:**

- Check if service is running: `ps aux | grep node`
- Verify MongoDB connection
- Check API key format

**API key errors:**

- Regenerate keys: `npm run generate-keys`
- Verify key prefix matches role requirements
- Check environment variable names

**Database connection issues:**

- Verify MongoDB URI in `.env`
- Check MongoDB collection exists: `trading-signals`
- Ensure proper database permissions

**Error flooding (old issue, now solved):**

- This is automatically handled by the new error management system
- Check error stats: `npm run errors:summary`
- Manual cleanup if needed: `npm run errors:cleanup`

## 📞 Support Resources

- **Integration Guide**: `INTEGRATION_GUIDE.md` - Complete documentation
- **Error Management**: `docs/error-management.md` - Error system details
- **API Reference**: See integration guide for complete endpoint list
- **Testing Scripts**: `npm run test:recovery` - Test position recovery

---

**🎉 Your Trading AI Agent is ready for frontend integration!**

The system now includes advanced error management, position persistence, and comprehensive monitoring - perfect for production use with your Next.js application.
