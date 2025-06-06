# Multi-Position Management Testing Guide

This guide covers how to test the enhanced Trading AI Agent with multi-position management capabilities.

## 📋 Prerequisites

1. **Server Running**: Make sure your server is running on `http://localhost:3000`
2. **MultiPositionManager Enabled**: Ensure the server has multi-position management configured
3. **Dependencies**: Run `npm install` to install test dependencies

## 🚀 Quick Start

### 1. Basic Connection Test
```bash
npm run test:connection
```
Tests server health and basic connectivity.

### 2. Demo Test (Recommended First Run)
```bash
npm run test:demo
```
Runs connection → single signal → status check sequence.

### 3. Full Multi-Position Test Suite
```bash
npm run test:multi
```
Comprehensive test of all multi-position features (15-20 minutes).

## 🎯 Individual Test Commands

### Basic Tests
```bash
# Test server connection
npm run test:connection

# Test single signal processing
npm run test:single

# Check current position status
npm run test:status
```

### Multi-Position Tests
```bash
# Test multiple positions for same token (AAVE)
npm run test:multiple

# Test conflicting signals (Buy vs Put Options)
npm run test:conflict

# Test multiple different tokens
npm run test:different

# Test position limits (3 per token)
npm run test:limit
```

### Advanced Tests
```bash
# Test risk management scenarios
npm run test:risk

# Quick exit monitoring (2 minutes)
npm run test:quick

# Live position monitoring (3 minutes)
npm run test:monitor
```

### Menu System
```bash
# Show interactive test menu
npm run test:menu
```

## 📁 Test Files Overview

### 1. `test-script-multiposition.js`
**Comprehensive Test Suite**
- ✅ Legacy functionality preservation
- ✅ Multi-position management
- ✅ Conflict resolution (Buy vs Sell)
- ✅ Position grouping and risk management
- ✅ Multiple tokens with different strategies
- ✅ Exposure limits and position sizing
- ✅ Automated monitoring and exits
- ✅ Real-time position tracking

### 2. `test-individual.js`
**Individual Test Runner**
- 🎯 Focused testing of specific features
- 📝 Command-line interface
- ⚡ Quick individual test execution
- 📊 Detailed result reporting

### 3. `test-script.js` (Legacy)
**Original Test Script**
- 🔄 Preserved for backward compatibility
- ✅ Basic signal processing
- ⏰ Quick exit functionality

## 🔬 Test Scenarios Explained

### 1. Multiple Same Token Positions (AAVE)
Tests the system's ability to handle multiple buy signals for the same token:
- **Signal 1**: AAVE @ $180.5, targets [190, 200, 210]
- **Signal 2**: AAVE @ $182.0, targets [195, 205, 215] 
- **Signal 3**: AAVE @ $179.0, targets [188, 198, 208]

**Expected Behavior**: 
- First two may merge or remain separate based on conflict resolution
- Third may be rejected if position limit (3) is reached

### 2. Conflicting Signals (ARB)
Tests conflict resolution between opposing signals:
- **Buy Signal**: ARB @ $1.25, targets [1.35, 1.45, 1.55]
- **Put Signal**: ARB @ $1.28, targets [1.2, 1.1, 1.0]

**Expected Behavior**:
- System applies conflict resolution strategy (default: risk_based)
- Lower risk signal wins or signals are managed separately

### 3. Multiple Different Tokens
Tests parallel management of different assets:
- **WETH**: Buy signal @ $2450
- **UNI**: Buy signal @ $8.5
- **BAL**: Put options @ $4.2
- **COMP**: Buy signal @ $45.8
- **OP**: Buy signal @ $2.15

**Expected Behavior**:
- All positions should be created successfully
- Each managed independently
- Grouped monitoring and risk management

### 4. Risk Management Scenarios
Tests exposure and position limits:
- **Large Position**: WBTC with high exposure
- **Position Limits**: 4th AAVE position (should be rejected)
- **Exposure Limits**: Total and per-token exposure checks

### 5. Quick Exit Monitoring
Tests real-time exit automation:
- **Quick Position**: CRV with 2-minute exit time
- **Live Monitoring**: Real-time price checks and automated exits

## 📊 Understanding Test Output

### Position Status Response
```json
{
  "total": 5,
  "multiPosition": {
    "positionGroups": 3,
    "totalExposure": 2500,
    "conflictingSignals": 0
  },
  "vault": [
    {
      "id": "pos_1234567890_abcdef123",
      "signal": {
        "token": "AAVE",
        "signal": "Buy",
        "currentPrice": 180.5,
        "targets": [190, 200, 210],
        "stopLoss": 170
      },
      "status": "active",
      "remainingAmount": 500
    }
  ]
}
```

### Conflict Resolution Response
```json
{
  "success": false,
  "message": "Position created but conflicted with existing position",
  "conflict": {
    "action": "cancel",
    "reason": "Existing signal has lower risk score for ARB"
  }
}
```

## 🔧 Configuration

### Multi-Position Settings
The test suite uses these default configurations:
```javascript
multiPosition: {
  maxConcurrentPositions: 15,
  maxPositionsPerToken: 3,
  conflictResolution: "risk_based",
  riskManagement: {
    maxTotalExposure: 50000,      // $50K total
    maxSingleTokenExposure: 10000, // $10K per token
    correlationThreshold: 0.8
  },
  exitStrategy: {
    allowPartialExits: true,
    consolidateSmallPositions: true,
    minimumPositionSize: 100
  }
}
```

## 🐛 Troubleshooting

### Common Issues

**1. Connection Failed**
```bash
❌ Health Check Failed: connect ECONNREFUSED 127.0.0.1:3000
```
**Solution**: Make sure your server is running on port 3000

**2. Positions Not Created**
```bash
❌ Signal Processing Failed: Position size outside allowed range
```
**Solution**: Check your trading configuration limits

**3. All Positions Rejected**
```bash
❌ Maximum concurrent positions (15) reached
```
**Solution**: Clear existing positions or increase limits

### Test Debugging

**Enable Verbose Logging**:
```bash
DEBUG=* npm run test:status
```

**Check Server Logs**: Monitor your server console for GameEngine activity

**Manual Position Check**:
```bash
curl http://localhost:3000/positions | jq
```

## 📈 Monitoring Real-Time Activity

### Server Logs to Watch
- `🤖 GameEngine: Position created and trade executed`
- `🤖 GameEngine: Monitoring X positions across Y groups`
- `🤖 GameEngine: Signal not executed - [reason]`
- `🤖 GameEngine: Conflict resolution: [action]`

### Key Metrics
- **Active Positions**: Current number of open positions
- **Position Groups**: Number of token groups being managed
- **Total Exposure**: Sum of all position values
- **Conflicting Signals**: Pending conflict resolutions

## 🎯 Best Practices for Testing

### 1. Start Small
```bash
npm run test:connection  # Always start here
npm run test:single      # Test one signal
npm run test:status      # Check what happened
```

### 2. Progressive Testing
```bash
npm run test:multiple    # Multiple same token
npm run test:different   # Multiple different tokens
npm run test:conflict    # Conflicting signals
```

### 3. Monitor Live Activity
```bash
npm run test:quick       # 2-minute exit test
npm run test:monitor     # 3-minute monitoring
```

### 4. Comprehensive Validation
```bash
npm run test:multi       # Full test suite
```

## 📝 Test Data

### Pre-configured Test Signals
The test suite includes realistic trading signals for:
- **AAVE**: DeFi token with strong fundamentals
- **ARB**: Layer 2 token with growth potential
- **WETH**: Ethereum with institutional interest
- **UNI**: DEX governance token
- **BAL**: Balancer protocol token
- **COMP**: Compound lending protocol
- **OP**: Optimism Layer 2 scaling
- **GMX**: Arbitrum perpetual exchange
- **WBTC**: Bitcoin wrapper token
- **LINK**: Oracle network token  
- **CRV**: Curve DAO token

### Signal Formats
All test signals include:
- ✅ Token identification (symbol and CoinGecko ID)
- ✅ Signal type (Buy, Put Options, Hold)
- ✅ Current price and targets
- ✅ Stop loss and timeline
- ✅ Exit times for automation testing
- ✅ Realistic trade tips and metadata

## 🚨 Emergency Procedures

### Stop All Tests
```bash
Ctrl+C  # Stop current test
```

### Clear Test Environment
```bash
# Restart server to clear all positions
npm run dev
```

### Reset Test State
1. Stop server
2. Clear any persistent storage
3. Restart server
4. Run `npm run test:connection`

## 📞 Support

If you encounter issues:
1. Check server logs for error details
2. Verify all dependencies are installed
3. Ensure MultiPositionManager is properly configured
4. Test with individual commands before running full suite

---

**Happy Testing! 🚀**

The multi-position management system is designed to handle complex trading scenarios with intelligence and safety. These tests will help you verify all functionality works as expected. 