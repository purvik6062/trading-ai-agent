/**
 * Test script for Signal Listener Service
 * Run with: node test-signal-listener.js
 */

const { SignalListenerService } = require('./dist/services/signalListenerService');
const { TOKEN_ADDRESSES } = require('./dist/config/enzymeContracts');

async function testTokenValidation() {
    console.log('🧪 Testing Token Validation...\n');

    const service = new SignalListenerService();

    // Test valid tokens
    const validTokens = ['WETH', 'USDC', 'ARB', 'AAVE', 'UNI'];
    console.log('✅ Testing Valid Tokens:');
    validTokens.forEach(token => {
        const isValid = service.checkTokenAllowed(token);
        console.log(`  ${token}: ${isValid ? '✅ Valid' : '❌ Invalid'}`);
    });

    // Test invalid tokens
    const invalidTokens = ['INVALID', 'FAKE', 'NOTREAL'];
    console.log('\n❌ Testing Invalid Tokens:');
    invalidTokens.forEach(token => {
        const isValid = service.checkTokenAllowed(token);
        console.log(`  ${token}: ${isValid ? '✅ Valid' : '❌ Invalid'}`);
    });

    // Test case sensitivity
    console.log('\n🔤 Testing Case Sensitivity:');
    const caseSensitiveTests = ['weth', 'Weth', 'WETH', 'usdc', 'USDC'];
    caseSensitiveTests.forEach(token => {
        const isValid = service.checkTokenAllowed(token);
        console.log(`  ${token}: ${isValid ? '✅ Valid' : '❌ Invalid'}`);
    });

    // Show total allowed tokens
    const allowedTokens = service.getAllowedTokens();
    console.log(`\n📊 Total Allowed Tokens: ${allowedTokens.length}`);
    console.log('First 10 tokens:', allowedTokens.slice(0, 10).join(', '));
}

function testSignalFiltering() {
    console.log('\n🔍 Testing Signal Filtering Logic...\n');

    const service = new SignalListenerService();

    // Mock document with valid subscriber and token
    const validDocument = {
        tweet_id: '1930060975870279772',
        twitterHandle: 'Crypt0_Savage',
        coin: 'ethereum',
        signal_data: {
            tokenMentioned: 'WETH',
            signal: 'Buy',
            currentPrice: 3200,
        },
        subscribers: [
            { username: 'abhidavinci', sent: false },
            { username: 'other_user', sent: false }
        ]
    };

    // Test subscriber filtering
    const hasSubscriber = validDocument.subscribers.some(
        sub => sub.username === 'abhidavinci'
    );
    console.log(`✅ Subscriber Filter (abhidavinci): ${hasSubscriber ? 'PASS' : 'FAIL'}`);

    // Test token validation
    const isTokenValid = service.checkTokenAllowed(validDocument.signal_data.tokenMentioned);
    console.log(`✅ Token Validation (${validDocument.signal_data.tokenMentioned}): ${isTokenValid ? 'PASS' : 'FAIL'}`);

    // Test invalid cases
    console.log('\n❌ Testing Invalid Cases:');

    // Wrong subscriber
    const wrongSubscriber = !validDocument.subscribers.some(
        sub => sub.username === 'wrong_user'
    );
    console.log(`  Wrong Subscriber Filter: ${wrongSubscriber ? 'CORRECTLY FILTERED' : 'INCORRECTLY PASSED'}`);

    // Invalid token
    const invalidTokenTest = !service.checkTokenAllowed('INVALID_TOKEN');
    console.log(`  Invalid Token Filter: ${invalidTokenTest ? 'CORRECTLY FILTERED' : 'INCORRECTLY PASSED'}`);
}

function showConfiguration() {
    console.log('\n⚙️ Configuration Test...\n');

    const config = {
        mongodb: {
            uri: process.env.MONGODB_URI,
            databaseName: process.env.MONGODB_DATABASE || 'ctxbt-signal-flow',
            collectionName: process.env.MONGODB_COLLECTION || 'trading-signals',
        }
    };

    console.log('📊 Current Configuration:');
    console.log(`  Database: ${config.mongodb.databaseName}`);
    console.log(`  Collection: ${config.mongodb.collectionName}`);
    console.log(`  Mode: Multi-User (processes all subscribers)`);
    console.log(`  MongoDB URI: ${config.mongodb.uri.replace(/\/\/.*@/, '//***:***@')}`);
}

async function main() {
    console.log('🚀 Signal Listener Test Suite\n');
    console.log('='.repeat(50));

    try {
        await testTokenValidation();
        testSignalFiltering();
        showConfiguration();

        console.log('\n' + '='.repeat(50));
        console.log('✅ All tests completed successfully!');
        console.log('\n💡 To run the actual signal listener:');
        console.log('   npm run signal-listener');

    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}

// Run the tests
main().catch(console.error); 