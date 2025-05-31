const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

// Test signal examples
const testSignals = {
    buySignal: `🏛️ Token: ARB (arbitrum)  
📈 Signal: Buy
💰 Entry Price: $1.20
🎯 Targets: TP1: $1.35 | TP2: $1.50
🛑 Stop Loss: $1.10
⏳ Timeline: Medium-term
💡 Trade Tip: Strong bullish momentum`,
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

async function testSignalParsing() {
    console.log('\n🧠 Testing Signal Parsing...');

    for (const [type, signal] of Object.entries(testSignals)) {
        try {
            const response = await axios.post(`${BASE_URL}/parse-signal`, {
                signal: signal
            });
            console.log(`✅ ${type} parsed successfully:`, response.data.parsed);
        } catch (error) {
            console.error(`❌ ${type} parsing failed:`, error.response?.data || error.message);
        }
    }
}

async function testSignalProcessing() {
    console.log('\n🚀 Testing Signal Processing...');
    console.log(testSignals.buySignal);
    // Test with BUY signal first (safer)
    try {
        const response = await axios.post(`${BASE_URL}/signal`, {
            signal: testSignals.buySignal
        });
        console.log('✅ Signal Processing:', response.data);
    } catch (error) {
        console.error('❌ Signal Processing Failed:', error.response?.data || error.message);
    }
}

async function testPositions() {
    console.log('\n📊 Testing Positions Endpoint...');
    try {
        const response = await axios.get(`${BASE_URL}/positions`);
        console.log('✅ Positions:', response.data);
    } catch (error) {
        console.error('❌ Positions Test Failed:', error.response?.data || error.message);
    }
}

async function testVaultInfo() {
    console.log('\n🏦 Testing Vault Information...');
    try {
        const response = await axios.get(`${BASE_URL}/vault`);
        console.log('✅ Vault Info:', response.data);
    } catch (error) {
        console.error('❌ Vault Info Failed:', error.response?.data || error.message);
    }
}

// Main testing function
async function runTests() {
    console.log('🎯 Starting API Tests...\n');

    const healthOk = await testHealthCheck();
    if (!healthOk) {
        console.log('❌ Server not healthy, stopping tests');
        return;
    }

    await testConfig();
    await testSignalParsing();
    await testPositions();
    await testVaultInfo();
    await testSignalProcessing();

    console.log('\n🎉 All tests completed!');
}

// Run tests
runTests().catch(console.error); 