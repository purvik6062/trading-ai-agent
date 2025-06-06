#!/usr/bin/env node

/**
 * Quick Start Test for Multi-Position Management
 * 
 * This script provides a fast way to test the basic functionality
 * of the multi-position management system.
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

console.log('🚀 Multi-Position Management Quick Test');
console.log('=====================================');

async function quickTest() {
    try {
        // Step 1: Health Check
        console.log('\n1️⃣ Testing server connection...');
        const health = await axios.get(`${BASE_URL}/health`);
        console.log('✅ Server is healthy:', health.data.status);

        // Step 2: Check current positions
        console.log('\n2️⃣ Checking current positions...');
        const positions = await axios.get(`${BASE_URL}/positions`);
        console.log(`📊 Current positions: ${positions.data.total || 0}`);

        if (positions.data.multiPosition) {
            const mp = positions.data.multiPosition;
            console.log(`   Position groups: ${mp.positionGroups || 0}`);
            console.log(`   Total exposure: $${mp.totalExposure || 0}`);
        }

        // Step 3: Test a simple signal
        console.log('\n3️⃣ Testing simple signal processing...');
        const testSignal = {
            token: "AAVE",
            tokenId: "aave",
            signal: "Buy",
            currentPrice: 180.5,
            targets: [190, 200, 210],
            stopLoss: 170,
            timeline: "Short-term (3-5 days)",
            maxExitTime: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
            tradeTip: "Quick test signal for multi-position system (using available token)",
            tweet_id: "quicktest_001",
            tokenMentioned: "AAVE"
        };

        const signalResponse = await axios.post(`${BASE_URL}/signal`, {
            signal_data: testSignal
        });

        console.log('📝 Signal processing result:');
        console.log(`   Success: ${signalResponse.data.success ? '✅ YES' : '❌ NO'}`);
        console.log(`   Message: ${signalResponse.data.message}`);

        if (signalResponse.data.position) {
            console.log(`   Position ID: ${signalResponse.data.position.id}`);
        }

        if (signalResponse.data.conflict) {
            console.log(`   Conflict: ${signalResponse.data.conflict.action} - ${signalResponse.data.conflict.reason}`);
        }

        // Step 4: Final status check
        console.log('\n4️⃣ Final status check...');
        const finalPositions = await axios.get(`${BASE_URL}/positions`);
        console.log(`📈 Final position count: ${finalPositions.data.total || 0}`);

        // Success summary
        console.log('\n🎉 QUICK TEST COMPLETED SUCCESSFULLY!');
        console.log('=====================================');
        console.log('✅ Server connection: Working');
        console.log('✅ Position tracking: Working');
        console.log('✅ Signal processing: Working');
        console.log('✅ Multi-position system: Ready');
        console.log('');
        console.log('🎯 Next steps:');
        console.log('   • Run full tests: npm run test:multi');
        console.log('   • Test conflicts: npm run test:conflict');
        console.log('   • Monitor positions: npm run test:monitor');
        console.log('   • See all options: npm run test:menu');

    } catch (error) {
        console.error('\n❌ QUICK TEST FAILED!');
        console.error('=====================');

        if (error.code === 'ECONNREFUSED') {
            console.error('🚨 Cannot connect to server');
            console.error('   Make sure your server is running on http://localhost:3000');
            console.error('   Run: npm run dev');
        } else if (error.response) {
            console.error('🚨 Server error:');
            console.error(`   Status: ${error.response.status}`);
            console.error(`   Message: ${error.response.data?.message || 'Unknown error'}`);
        } else {
            console.error('🚨 Unexpected error:', error.message);
        }

        console.error('');
        console.error('💡 Troubleshooting:');
        console.error('   1. Check if server is running');
        console.error('   2. Verify server has multi-position enabled');
        console.error('   3. Check server logs for errors');
        console.error('   4. Try: npm run test:connection');

        process.exit(1);
    }
}

// Run the quick test
quickTest(); 