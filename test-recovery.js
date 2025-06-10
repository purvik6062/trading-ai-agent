const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

// Test signal for recovery testing
const recoveryTestSignal = {
    token: "AAVE",
    tokenId: "aave",
    signal: "Buy",
    currentPrice: 180.5,
    targets: [190, 200, 210],
    stopLoss: 170,
    timeline: "Medium-term (1 week)",
    maxExitTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
    tradeTip: "Position recovery test - this should survive service restarts",
    tweet_id: "recovery_test_001",
    tweet_link: "https://x.com/test/status/recovery_test_001",
    tweet_timestamp: new Date().toISOString(),
    priceAtTweet: 180.5,
    exitValue: null,
    twitterHandle: "RecoveryTester",
    tokenMentioned: "AAVE"
};

async function testHealthCheck() {
    console.log('\n🏥 Testing Health Check...');
    try {
        const response = await axios.get(`${BASE_URL}/health`);
        console.log('✅ Health Check:', {
            status: response.data.status,
            multiUserSignal: response.data.services.multiUserSignal.enabled,
            userService: response.data.services.userService.enabled,
        });
        return true;
    } catch (error) {
        console.error('❌ Health Check Failed:', error.message);
        return false;
    }
}

async function registerTestUser() {
    console.log('\n👤 Registering Test User...');
    try {
        const response = await axios.post(`${BASE_URL}/users/register`, {
            username: "recovery_test_user",
            vaultAddress: "0x1234567890123456789012345678901234567890",
            email: "recovery@test.com"
        });

        if (response.data.success) {
            console.log('✅ Test user registered successfully');
            return true;
        } else {
            console.log('⚠️ User registration response:', response.data.message);
            return response.data.message.includes('already') || response.data.message.includes('exists');
        }
    } catch (error) {
        console.error('❌ User registration failed:', error.response?.data || error.message);
        return false;
    }
}

async function createRecoveryTestPosition() {
    console.log('\n📊 Creating Position for Recovery Test...');
    try {
        const response = await axios.post(`${BASE_URL}/signal`, {
            signal_data: recoveryTestSignal
        });

        if (response.data.success && response.data.position) {
            console.log('✅ Position created successfully:', {
                id: response.data.position.id,
                token: response.data.position.signal.token,
                status: response.data.position.status,
                createdAt: response.data.position.createdAt
            });
            return response.data.position.id;
        } else {
            console.log('⚠️ Position creation response:', response.data.message);
            return null;
        }
    } catch (error) {
        console.error('❌ Position creation failed:', error.response?.data || error.message);
        return null;
    }
}

async function checkRecoveryStatus() {
    console.log('\n📋 Checking Recovery Status...');
    try {
        const response = await axios.get(`${BASE_URL}/admin/recovery/status`);

        if (response.data.success) {
            console.log('✅ Recovery Status:', {
                totalUsers: response.data.totalUsers,
                userStats: response.data.userStats.map(stat => ({
                    username: stat.username,
                    activePositions: stat.activePositions,
                    positionStats: stat.positionStats
                }))
            });
            return response.data;
        } else {
            console.error('❌ Recovery status check failed');
            return null;
        }
    } catch (error) {
        console.error('❌ Recovery status request failed:', error.response?.data || error.message);
        return null;
    }
}

async function triggerManualRecovery() {
    console.log('\n🔄 Triggering Manual Recovery...');
    try {
        const response = await axios.post(`${BASE_URL}/admin/recovery/positions`);

        if (response.data.success) {
            console.log('✅ Manual recovery completed:', {
                users: response.data.users,
                results: response.data.results.map(result => ({
                    username: result.username,
                    totalRecovered: result.totalRecovered,
                    activePositions: result.activePositions,
                    errors: result.errors || []
                }))
            });
            return response.data;
        } else {
            console.error('❌ Manual recovery failed');
            return null;
        }
    } catch (error) {
        console.error('❌ Manual recovery request failed:', error.response?.data || error.message);
        return null;
    }
}

async function checkUserPersistedPositions(username) {
    console.log(`\n💾 Checking Persisted Positions for ${username}...`);
    try {
        const response = await axios.get(`${BASE_URL}/users/${username}/positions/persisted`);

        if (response.data.success) {
            console.log('✅ Persisted positions found:', {
                username: response.data.username,
                vaultAddress: response.data.vaultAddress,
                persistedPositions: response.data.persistedPositions.length,
                positions: response.data.persistedPositions.map(pos => ({
                    id: pos.id,
                    token: pos.signal.token,
                    status: pos.status,
                    createdAt: pos.createdAt,
                    recoveredAt: pos.recoveredAt,
                    lastMonitoredAt: pos.lastMonitoredAt
                })),
                stats: response.data.stats
            });
            return response.data;
        } else {
            console.error('❌ Failed to get persisted positions');
            return null;
        }
    } catch (error) {
        console.error('❌ Persisted positions request failed:', error.response?.data || error.message);
        return null;
    }
}

async function getCurrentPositions() {
    console.log('\n📊 Checking Current Positions...');
    try {
        const response = await axios.get(`${BASE_URL}/positions`);
        console.log('✅ Current positions:', {
            vaultPositions: response.data.vault.length,
            trailingStopPositions: response.data.trailingStop.length,
            total: response.data.total
        });
        return response.data;
    } catch (error) {
        console.error('❌ Current positions check failed:', error.response?.data || error.message);
        return null;
    }
}

async function waitForUserInput(message) {
    console.log(`\n⏸️  ${message}`);
    console.log('Press Enter to continue...');

    return new Promise((resolve) => {
        process.stdin.once('data', () => {
            resolve();
        });
    });
}

async function runRecoveryTest() {
    console.log('🚀 POSITION RECOVERY TEST SUITE');
    console.log('='.repeat(60));
    console.log('This test verifies that positions survive service restarts.');
    console.log('='.repeat(60));

    // Step 1: Health check
    const healthOk = await testHealthCheck();
    if (!healthOk) {
        console.log('❌ Service not healthy, stopping test');
        return;
    }

    // Step 2: Register test user
    const userRegistered = await registerTestUser();
    if (!userRegistered) {
        console.log('❌ User registration failed, stopping test');
        return;
    }

    // Step 3: Check initial state
    console.log('\n📋 PHASE 1: Initial State');
    await checkRecoveryStatus();
    await getCurrentPositions();

    // Step 4: Create test position
    console.log('\n📋 PHASE 2: Create Test Position');
    const positionId = await createRecoveryTestPosition();
    if (!positionId) {
        console.log('❌ Failed to create position, stopping test');
        return;
    }

    // Step 5: Verify position is created and persisted
    console.log('\n📋 PHASE 3: Verify Position Persistence');
    await checkRecoveryStatus();
    await checkUserPersistedPositions('recovery_test_user');
    await getCurrentPositions();

    // Step 6: Wait for restart
    await waitForUserInput('🔄 NOW RESTART THE SERVICE (Ctrl+C, then npm start)');

    // Step 7: Check recovery after restart
    console.log('\n📋 PHASE 4: Post-Restart Recovery Verification');

    // Give some time for the service to restart and recover
    console.log('⏳ Waiting 5 seconds for service to fully initialize...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Check if health endpoint is back
    let retries = 0;
    while (retries < 5) {
        try {
            const healthCheck = await testHealthCheck();
            if (healthCheck) break;
        } catch (error) {
            retries++;
            console.log(`⏳ Waiting for service to come back online... (attempt ${retries}/5)`);
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }

    // Step 8: Verify positions recovered
    const postRestartStatus = await checkRecoveryStatus();
    const postRestartPersisted = await checkUserPersistedPositions('recovery_test_user');
    const postRestartCurrent = await getCurrentPositions();

    // Step 9: Results analysis
    console.log('\n📋 PHASE 5: Recovery Test Results');
    console.log('='.repeat(60));

    if (postRestartStatus && postRestartPersisted && postRestartCurrent) {
        const hasRecoveredPositions = postRestartPersisted.persistedPositions.length > 0;
        const hasActivePositions = postRestartCurrent.total > 0;

        if (hasRecoveredPositions && hasActivePositions) {
            console.log('🎉 ✅ RECOVERY TEST PASSED!');
            console.log('   - Positions were persisted before restart');
            console.log('   - Positions were recovered after restart');
            console.log('   - Monitoring is active for recovered positions');
        } else if (hasRecoveredPositions && !hasActivePositions) {
            console.log('⚠️ ⚠️  PARTIAL RECOVERY - Positions persisted but not active');
            console.log('   - Try manual recovery trigger');
        } else {
            console.log('❌ ❌ RECOVERY TEST FAILED');
            console.log('   - Positions were not properly persisted or recovered');
        }
    } else {
        console.log('❌ ❌ RECOVERY TEST INCONCLUSIVE');
        console.log('   - Unable to verify recovery status');
    }

    // Optional manual recovery
    console.log('\n📋 PHASE 6: Manual Recovery (if needed)');
    await triggerManualRecovery();
    await checkRecoveryStatus();

    console.log('\n🏁 Recovery test completed!');
}

// Menu system
async function showMenu() {
    console.log('\n🧪 POSITION RECOVERY TESTING MENU');
    console.log('='.repeat(40));
    console.log('1. Full Recovery Test');
    console.log('2. Check Recovery Status');
    console.log('3. Create Test Position');
    console.log('4. Trigger Manual Recovery');
    console.log('5. Check Persisted Positions');
    console.log('6. Health Check');
    console.log('0. Exit');
    console.log('='.repeat(40));

    return new Promise((resolve) => {
        process.stdin.once('data', (data) => {
            resolve(data.toString().trim());
        });
    });
}

async function runMenu() {
    while (true) {
        const choice = await showMenu();

        switch (choice) {
            case '1':
                await runRecoveryTest();
                break;
            case '2':
                await checkRecoveryStatus();
                break;
            case '3':
                await registerTestUser();
                await createRecoveryTestPosition();
                break;
            case '4':
                await triggerManualRecovery();
                break;
            case '5':
                await checkUserPersistedPositions('recovery_test_user');
                break;
            case '6':
                await testHealthCheck();
                break;
            case '0':
                console.log('👋 Goodbye!');
                process.exit(0);
                break;
            default:
                console.log('❌ Invalid choice. Please try again.');
        }
    }
}

// Main execution
if (require.main === module) {
    console.log('🚀 Starting Position Recovery Testing...');
    runMenu().catch(console.error);
} 