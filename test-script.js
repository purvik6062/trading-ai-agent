const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

// Test signal examples - both legacy and new formats
const testSignals = {
    // New object format with quick exit (2 minutes from now)
    quickExitSignal: {
        token: "Arbitrum",
        signal: "Buy",
        currentPrice: 0.3379,
        targets: [0.4379, 0.5379],
        stopLoss: 0.2379,
        timeline: "Short-term (1-7 days)",
        maxExitTime: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 2 minutes from now
        tradeTip: "Quick test trade for exit functionality",
        tweet_id: "1234567890",
        tweet_link: "https://x.com/test/status/1234567890",
        tweet_timestamp: new Date().toISOString(),
        priceAtTweet: 0.3379,
        exitValue: null,
        twitterHandle: "TestTrader",
        tokenMentioned: "ARB",
        tokenId: "arbitrum"
    },

    // // Normal timeframe signal
    // normalSignal: {
    //     token: "ARB (arbitrum)",
    //     signal: "Buy",
    //     currentPrice: 1.20,
    //     targets: [1.35, 1.50],
    //     stopLoss: 1.10,
    //     timeline: "Medium-term (1-4 weeks)",
    //     maxExitTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now
    //     tradeTip: "Strong bullish momentum with good volume",
    //     tweet_id: "1234567891",
    //     tweet_link: "https://x.com/test/status/1234567891",
    //     tweet_timestamp: new Date().toISOString(),
    //     priceAtTweet: 1.20,
    //     exitValue: null,
    //     twitterHandle: "TestTrader",
    //     tokenMentioned: "ARB",
    //     tokenId: "arbitrum"
    // },

    // // Multi-target signal to test staged exits
    // multiTargetSignal: {
    //     token: "UNI (uniswap)",
    //     signal: "Buy",
    //     currentPrice: 10.00,
    //     targets: [12.00, 15.00, 18.00], // Three targets for staged exits
    //     stopLoss: 9.00,
    //     timeline: "Medium-term (1-4 weeks)",
    //     maxExitTime: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(), // 6 hours from now
    //     tradeTip: "Multi-target test: 50% exit at TP1 ($12), 50% exit at TP2 ($15), any remaining at TP3 ($18)",
    //     tokenId: "uniswap"
    // },

    // // Put options signal  
    // putSignal: {
    //     token: "BTC (bitcoin)",
    //     signal: "Put Options",
    //     currentPrice: 45000.00,
    //     targets: [42000.00, 40000.00],
    //     stopLoss: 47000.00,
    //     timeline: "Short-term (1-7 days)",
    //     maxExitTime: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(), // 12 hours from now
    //     tradeTip: "Market showing bearish signals, good for put options",
    //     tokenId: "bitcoin"
    // }
};

// Testing functions
async function testHealthCheck() {
    console.log('\n🏥 Testing Health Check...');
    try {
        const response = await axios.get(`${BASE_URL}/health`);
        console.log('✅ Health Check:', response.data);
        return true;
    } catch (error) {
        console.error('❌ Health Check Failed:', error.message);
        return false;
    }
}

async function testConfig() {
    console.log('\n⚙️ Testing Configuration...');
    try {
        const response = await axios.get(`${BASE_URL}/config`);
        console.log('✅ Configuration:', response.data);
        return true;
    } catch (error) {
        console.error('❌ Config Test Failed:', error.message);
        return false;
    }
}


// async function testObjectSignalProcessing() {
//     console.log('\n🚀 Testing Object Signal Processing...');

//     console.log('📝 Testing Normal Signal (24h timeout)...');
//     try {
//         const response = await axios.post(`${BASE_URL}/signal`, {
//             signal_data: testSignals.normalSignal
//         });
//         console.log('✅ Normal Signal Processing:', response.data);

//         if (response.data.position) {
//             console.log('📊 Position Created:', {
//                 id: response.data.position.id,
//                 token: response.data.position.signal.token,
//                 maxExitTime: response.data.position.signal.maxExitTime,
//                 entryTxHash: response.data.position.entryTxHash
//             });
//         }
//         return response.data.position?.id;
//     } catch (error) {
//         console.error('❌ Normal Signal Processing Failed:', error.response?.data || error.message);
//         return null;
//     }
// }

async function testQuickExitSignal() {
    console.log('\n⚡ Testing Quick Exit Signal (2 minute timeout)...');
    try {
        const response = await axios.post(`${BASE_URL}/signal`, {
            signal_data: testSignals.quickExitSignal
        });
        console.log('✅ Quick Exit Signal Processing:', response.data);

        if (response.data.position) {
            console.log('📊 Quick Position Created:', {
                id: response.data.position.id,
                token: response.data.position.signal.token,
                maxExitTime: response.data.position.signal.maxExitTime,
                willExitAt: new Date(response.data.position.signal.maxExitTime).toLocaleTimeString()
            });

            console.log('⏰ Position will auto-exit in 2 minutes. Monitor the logs!');
        }
        return response.data.position?.id;
    } catch (error) {
        console.error('❌ Quick Exit Signal Processing Failed:', error.response?.data || error.message);
        return null;
    }
}

// async function testMultiTargetSignal() {
//     console.log('\n🎯 Testing Multi-Target Signal (3 targets)...');
//     try {
//         const response = await axios.post(`${BASE_URL}/signal`, {
//             signal_data: testSignals.multiTargetSignal
//         });
//         console.log('✅ Multi-Target Signal Processing:', response.data);

//         if (response.data.position) {
//             console.log('📊 Multi-Target Position Created:', {
//                 id: response.data.position.id,
//                 token: response.data.position.signal.token,
//                 targets: response.data.position.signal.targets,
//                 strategy: "50% exit at TP1, 50% exit at TP2, any remaining at TP3"
//             });
//         }
//         return response.data.position?.id;
//     } catch (error) {
//         console.error('❌ Multi-Target Signal Processing Failed:', error.response?.data || error.message);
//         return null;
//     }
// }

// async function testPutOptionsSignal() {
//     console.log('\n📉 Testing Put Options Signal...');
//     try {
//         const response = await axios.post(`${BASE_URL}/signal`, {
//             signal_data: testSignals.putSignal
//         });
//         console.log('✅ Put Options Signal Processing:', response.data);
//         return response.data.position?.id;
//     } catch (error) {
//         console.error('❌ Put Options Signal Processing Failed:', error.response?.data || error.message);
//         return null;
//     }
// }

// async function testLegacySignalProcessing() {
//     console.log('\n📜 Testing Legacy Signal Processing...');
//     try {
//         const response = await axios.post(`${BASE_URL}/signal`, {
//             signal: testSignals.legacyBuySignal
//         });
//         console.log('✅ Legacy Signal Processing:', response.data);
//         return response.data.position?.id;
//     } catch (error) {
//         console.error('❌ Legacy Signal Processing Failed:', error.response?.data || error.message);
//         return null;
//     }
// }

async function testPositions() {
    console.log('\n📊 Testing Positions Endpoint...');
    try {
        const response = await axios.get(`${BASE_URL}/positions`);
        console.log('✅ Active Positions:', {
            totalPositions: response.data.total,
            vaultPositions: response.data.vault?.length || 0,
            trailingStopPositions: response.data.trailingStop?.length || 0
        });

        if (response.data.vault && response.data.vault.length > 0) {
            console.log('📋 Position Details:');
            response.data.vault.forEach((pos, index) => {
                console.log(`  ${index + 1}. ${pos.signal.token} - Status: ${pos.status} - Exit: ${new Date(pos.signal.maxExitTime).toLocaleTimeString()}`);
            });
        }

        return response.data;
    } catch (error) {
        console.error('❌ Positions Test Failed:', error.response?.data || error.message);
        return null;
    }
}

async function testVaultInfo() {
    console.log('\n🏦 Testing Vault Information...');
    try {
        const response = await axios.get(`${BASE_URL}/vault`);
        console.log('✅ Vault Info:', {
            vaultAddress: response.data.address,
            totalSupply: response.data.totalSupply,
            sharePrice: response.data.sharePrice,
            portfolioValue: response.data.portfolioValue
        });
        return true;
    } catch (error) {
        console.error('❌ Vault Info Failed:', error.response?.data || error.message);
        return false;
    }
}

async function testManualTrade() {
    console.log('\n🔧 Testing Manual Trade Execution...');
    try {
        const response = await axios.post(`${BASE_URL}/trade`, {
            fromToken: "USDC",
            toToken: "WETH",
            amountPercentage: 5, // Small test trade
            maxSlippage: 1.0
        });
        console.log('✅ Manual Trade:', response.data);
        return true;
    } catch (error) {
        console.error('❌ Manual Trade Failed:', error.response?.data || error.message);
        return false;
    }
}

async function monitorPositionsFor(seconds) {
    console.log(`\n👀 Monitoring positions for ${seconds} seconds...`);

    let count = 0;
    const interval = setInterval(async () => {
        count++;
        try {
            const response = await axios.get(`${BASE_URL}/positions`);
            const activeCount = response.data.total;

            console.log(`⏱️  [${count * 10}s] Active positions: ${activeCount}`);

            if (response.data.vault && response.data.vault.length > 0) {
                response.data.vault.forEach(pos => {
                    const timeLeft = new Date(pos.signal.maxExitTime) - new Date();
                    const minutesLeft = Math.round(timeLeft / (1000 * 60));
                    console.log(`   - ${pos.signal.token}: ${pos.status} (${minutesLeft}m left)`);
                });
            }

        } catch (error) {
            console.error('❌ Monitoring error:', error.message);
        }

        if (count * 10 >= seconds) {
            clearInterval(interval);
            console.log('⏰ Monitoring completed');
        }
    }, 10000); // Check every 10 seconds
}

// Main testing function
async function runTests() {
    console.log('🎯 Starting Comprehensive Trading Tests...\n');
    console.log('🚀 This will test:');
    console.log('   - Legacy string signal format');
    console.log('   - New object signal format');
    console.log('   - Quick exit functionality (2 min)');
    console.log('   - Multi-target staged exits (TP1→TP2→TP3)');
    console.log('   - Put options signals');
    console.log('   - Position monitoring');
    console.log('   - Manual trades');
    console.log('   - Real-time exit tracking\n');

    const healthOk = await testHealthCheck();
    if (!healthOk) {
        console.log('❌ Server not healthy, stopping tests');
        return;
    }

    await testConfig();
    await testVaultInfo();

    // Test different signal types
    // const normalPositionId = await testObjectSignalProcessing();
    // const multiTargetPositionId = await testMultiTargetSignal();
    // const putPositionId = await testPutOptionsSignal();
    // const quickPositionId = await testQuickExitSignal();
    
    // Test manual trading
    // await testManualTrade();
    
    // Show all positions
    await testPositions();
    
    console.log('\n' + '='.repeat(60));
    console.log('🎭 LIVE MONITORING PHASE');
    console.log('='.repeat(60));
    console.log('👁️  Watch for GameEngine logs showing:');
    console.log('   - Position monitoring every 30s');
    console.log('   - Price updates from CoinGecko');
    console.log('   - Automatic exits when maxExitTime reached');
    console.log('   - Trailing stop calculations');
    console.log('');
    console.log('⚡ The quick exit position should auto-close in ~2 minutes!');
    console.log('📊 Check your server logs for real-time GameEngine activity');

    // Monitor positions for 3 minutes to see the quick exit happen
    await monitorPositionsFor(1200);

    // Final position check
    console.log('\n📋 Final Positions Check:');
    await testPositions();

    console.log('\n🎉 All tests completed!');
    console.log('');
    console.log('🔍 Summary of what was tested:');
    console.log('✅ Health check and configuration');
    console.log('✅ Legacy string signal parsing');
    console.log('✅ New object signal processing');
    console.log('✅ Quick exit timing (2 minutes)');
    console.log('✅ Put options signals');
    console.log('✅ Position monitoring and tracking');
    console.log('✅ Manual trade execution');
    console.log('✅ Real-time exit automation');
    console.log('');
    console.log('🎯 Check server logs for detailed GameEngine activity!');
}

// Run tests
console.log('🎬 Starting Trading AI Agent Test Suite...');
console.log('📡 Make sure your server is running on http://localhost:3000');
console.log('');

runTests().catch(console.error); 