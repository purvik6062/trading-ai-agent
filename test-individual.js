const {
    testHealthCheck,
    testMultipleSameTokenPositions,
    testConflictingSignals,
    testMultipleDifferentTokens,
    testRiskManagement,
    testMultiPositionStatus,
    testQuickMultiPositionExit,
    monitorMultiPositions,
    multiPositionTestSignals
} = require('./test-script-multiposition');

const axios = require('axios');
const BASE_URL = 'http://localhost:3000';

// ===============================================================
// INDIVIDUAL TEST RUNNERS
// ===============================================================

async function testBasicConnection() {
    console.log('🔗 BASIC CONNECTION TEST');
    console.log('='.repeat(40));

    const healthy = await testHealthCheck();
    if (!healthy) {
        console.log('❌ Cannot proceed - server not healthy');
        return false;
    }

    console.log('✅ Connection test passed');
    return true;
}

async function testSingleSignal() {
    console.log('\n📝 SINGLE SIGNAL TEST');
    console.log('='.repeat(40));

    try {
        const response = await axios.post(`${BASE_URL}/signal`, {
            signal_data: multiPositionTestSignals.aaveBuy1
        });

        console.log('✅ Single Signal Result:', {
            success: response.data.success,
            message: response.data.message,
            positionId: response.data.position?.id || 'None',
            conflict: response.data.conflict?.action || 'None'
        });

        return response.data.position?.id || null;
    } catch (error) {
        console.error('❌ Single Signal Test Failed:', error.response?.data || error.message);
        return null;
    }
}

async function testPositionLimit() {
    console.log('\n🔢 POSITION LIMIT TEST');
    console.log('='.repeat(40));
    console.log('Testing 4 AAVE positions to verify 3-position limit...');

    const signals = [
        multiPositionTestSignals.aaveBuy1,
        multiPositionTestSignals.aaveBuy2,
        multiPositionTestSignals.aaveBuy3,
        {
            ...multiPositionTestSignals.aaveBuy1,
            tweet_id: "test_aave_buy_4",
            tradeTip: "Fourth position - should be rejected (testing position limits)"
        }
    ];

    for (let i = 0; i < signals.length; i++) {
        console.log(`\n📝 Testing AAVE position ${i + 1}/4:`);
        try {
            const response = await axios.post(`${BASE_URL}/signal`, {
                signal_data: signals[i]
            });

            console.log(`   Result: ${response.data.success ? '✅ Accepted' : '❌ Rejected'}`);
            console.log(`   Message: ${response.data.message}`);

            if (i === 3 && response.data.success) {
                console.log('⚠️  Warning: 4th position was accepted (limit may not be enforced)');
            } else if (i === 3 && !response.data.success) {
                console.log('✅ Position limit working correctly');
            }

        } catch (error) {
            console.error(`   ❌ Position ${i + 1} failed:`, error.response?.data || error.message);
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

async function testQuickExit() {
    console.log('\n⚡ QUICK EXIT TEST');
    console.log('='.repeat(40));

    const positionId = await testQuickMultiPositionExit();

    if (positionId) {
        console.log('\n👁️ Monitoring for 2.5 minutes to see exit...');
        await monitorMultiPositions(150); // 2.5 minutes
    }

    return positionId;
}

async function runSpecificTest(testName) {
    console.log(`🎯 RUNNING SPECIFIC TEST: ${testName}`);
    console.log('='.repeat(50));

    const connected = await testBasicConnection();
    if (!connected) return;

    switch (testName.toLowerCase()) {
        case 'connection':
            // Already tested in testBasicConnection
            break;

        case 'single':
            await testSingleSignal();
            break;

        case 'multiple':
            await testMultipleSameTokenPositions();
            break;

        case 'conflict':
            await testConflictingSignals();
            break;

        case 'different':
            await testMultipleDifferentTokens();
            break;

        case 'risk':
            await testRiskManagement();
            break;

        case 'limit':
            await testPositionLimit();
            break;

        case 'quick':
            await testQuickExit();
            break;

        case 'status':
            await testMultiPositionStatus();
            break;

        case 'monitor':
            console.log('Starting 3-minute monitoring session...');
            await monitorMultiPositions(180);
            break;

        default:
            console.log('❌ Unknown test name. Available tests:');
            console.log('   connection, single, multiple, conflict, different');
            console.log('   risk, limit, quick, status, monitor');
            return;
    }

    console.log(`\n✅ Test '${testName}' completed!`);
}

// ===============================================================
// COMMAND LINE INTERFACE
// ===============================================================

async function showMenu() {
    console.log('\n🎯 MULTI-POSITION TEST MENU');
    console.log('='.repeat(40));
    console.log('Choose a test to run:');
    console.log('');
    console.log('Basic Tests:');
    console.log('  1. connection  - Test server connection');
    console.log('  2. single      - Test single signal processing');
    console.log('  3. status      - Check current position status');
    console.log('');
    console.log('Multi-Position Tests:');
    console.log('  4. multiple    - Multiple positions same token');
    console.log('  5. conflict    - Conflicting Buy vs Put signals');
    console.log('  6. different   - Multiple different tokens');
    console.log('  7. limit       - Test position limits (3 per token)');
    console.log('');
    console.log('Advanced Tests:');
    console.log('  8. risk        - Risk management scenarios');
    console.log('  9. quick       - Quick exit monitoring (2 min)');
    console.log(' 10. monitor     - Live monitoring (3 min)');
    console.log('');
    console.log('Usage: node test-individual.js [test-name]');
    console.log('Example: node test-individual.js conflict');
}

async function main() {
    const testName = process.argv[2];

    if (!testName) {
        await showMenu();
        return;
    }

    await runSpecificTest(testName);
}

// ===============================================================
// UTILITY FUNCTIONS
// ===============================================================

async function clearAllPositions() {
    console.log('\n🧹 CLEAR POSITIONS (Demo)');
    console.log('='.repeat(40));
    console.log('💡 This would clear all positions if implemented');
    console.log('   Would require API endpoint: DELETE /positions/all');

    const status = await testMultiPositionStatus();
    if (status && status.vault && status.vault.length > 0) {
        console.log(`📊 Found ${status.vault.length} positions that would be cleared:`);
        status.vault.forEach((pos, i) => {
            console.log(`   ${i + 1}. ${pos.signal.token} ${pos.signal.signal} (${pos.id})`);
        });
    }
}

async function showPositionSummary() {
    console.log('\n📊 POSITION SUMMARY');
    console.log('='.repeat(40));

    const status = await testMultiPositionStatus();
    return status;
}

// Export for external use
module.exports = {
    runSpecificTest,
    testBasicConnection,
    testSingleSignal,
    testPositionLimit,
    testQuickExit,
    clearAllPositions,
    showPositionSummary,
    showMenu
};

// Run if called directly
if (require.main === module) {
    main().catch(error => {
        console.error('💥 Test failed:', error);
        process.exit(1);
    });
} 