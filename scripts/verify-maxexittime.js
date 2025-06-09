const axios = require('axios');
const chalk = require('chalk');

const API_BASE = 'http://localhost:3000';

console.log(chalk.blue('\n🔍 MaxExitTime Verification Tool'));
console.log(chalk.blue('=====================================\n'));

async function testMaxExitTimeScenarios() {
    const scenarios = [
        {
            name: "✅ Valid Future MaxExitTime",
            signalData: {
                token: "ETH (ethereum)",
                tokenId: "ethereum",
                signal: "Buy",
                currentPrice: 3200,
                targets: [3300, 3400],
                stopLoss: 3100,
                timeline: "Test scenario",
                maxExitTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours from now
                tradeTip: "Valid maxExitTime test"
            },
            expectedResult: "success"
        },
        {
            name: "❌ Past MaxExitTime",
            signalData: {
                token: "BTC (bitcoin)",
                tokenId: "bitcoin",
                signal: "Buy",
                currentPrice: 45000,
                targets: [46000, 47000],
                stopLoss: 44000,
                timeline: "Test scenario",
                maxExitTime: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago
                tradeTip: "Past maxExitTime test"
            },
            expectedResult: "failure"
        },
        {
            name: "❌ Missing MaxExitTime",
            signalData: {
                token: "ADA (cardano)",
                tokenId: "cardano",
                signal: "Buy",
                currentPrice: 0.5,
                targets: [0.55, 0.6],
                stopLoss: 0.45,
                timeline: "Test scenario",
                // maxExitTime: missing
                tradeTip: "Missing maxExitTime test"
            },
            expectedResult: "failure"
        },
        {
            name: "❌ Invalid MaxExitTime Format",
            signalData: {
                token: "SOL (solana)",
                tokenId: "solana",
                signal: "Buy",
                currentPrice: 100,
                targets: [105, 110],
                stopLoss: 95,
                timeline: "Test scenario",
                maxExitTime: "invalid-date-format",
                tradeTip: "Invalid maxExitTime format test"
            },
            expectedResult: "failure"
        },
        {
            name: "⚠️ Legacy Text Format (7-day fallback)",
            signal: `🏛️ Token: MATIC (polygon)
📈 Signal: Buy
💰 Entry Price: $0.85
🎯 Targets:
  TP1: $0.90
  TP2: $0.95
🛑 Stop Loss: $0.80
⏳ Timeline: Legacy format test
💡 Trade Tip: Testing 7-day fallback`,
            expectedResult: "success_with_warning"
        }
    ];

    for (const scenario of scenarios) {
        console.log(chalk.yellow(`\n📋 Testing: ${scenario.name}`));
        console.log(chalk.gray('─'.repeat(50)));

        try {
            let response;

            if (scenario.signalData) {
                // Test object format
                response = await axios.post(`${API_BASE}/signal`, {
                    signal_data: scenario.signalData
                });
            } else if (scenario.signal) {
                // Test legacy text format
                response = await axios.post(`${API_BASE}/signal`, {
                    signal: scenario.signal
                });
            }

            if (response.data.success) {
                console.log(chalk.green('✅ Request succeeded'));

                if (response.data.position) {
                    console.log(`   Position ID: ${response.data.position.id}`);
                    console.log(`   MaxExitTime: ${response.data.position.signal.maxExitTime}`);
                    console.log(`   Will expire: ${new Date(response.data.position.signal.maxExitTime).toLocaleString()}`);

                    // Check if it's a 7-day fallback
                    const exitTime = new Date(response.data.position.signal.maxExitTime);
                    const now = new Date();
                    const daysUntilExit = (exitTime.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

                    if (daysUntilExit >= 6.9 && daysUntilExit <= 7.1) {
                        console.log(chalk.yellow('   ⚠️ Applied 7-day fallback (legacy format)'));
                    }
                } else {
                    console.log('   No position created (AI decision)');
                }

                if (scenario.expectedResult === "failure") {
                    console.log(chalk.red('   🚨 UNEXPECTED: Should have failed validation!'));
                }
            } else {
                console.log(chalk.red('❌ Request failed'));
                console.log(`   Message: ${response.data.message || 'No message'}`);

                if (scenario.expectedResult === "success") {
                    console.log(chalk.red('   🚨 UNEXPECTED: Should have succeeded!'));
                }
            }

        } catch (error) {
            console.log(chalk.red('❌ Request failed with error'));

            if (error.response?.data) {
                console.log(`   Error: ${error.response.data.error}`);
                console.log(`   Details: ${error.response.data.details || 'No details'}`);
            } else {
                console.log(`   Error: ${error.message}`);
            }

            if (scenario.expectedResult === "success") {
                console.log(chalk.red('   🚨 UNEXPECTED: Should have succeeded!'));
            }
        }
    }
}

async function verifyCurrentPositions() {
    console.log(chalk.blue('\n🔍 Checking Current Positions for MaxExitTime'));
    console.log(chalk.blue('============================================\n'));

    try {
        const response = await axios.get(`${API_BASE}/positions`);
        const positions = response.data.vault || [];

        if (positions.length === 0) {
            console.log(chalk.gray('No active positions found.'));
            return;
        }

        for (const position of positions) {
            if (position.signal?.maxExitTime) {
                const maxExitTime = new Date(position.signal.maxExitTime);
                const now = new Date();
                const timeUntilExit = maxExitTime.getTime() - now.getTime();
                const minutesUntilExit = Math.round(timeUntilExit / (1000 * 60));

                console.log(`📍 Position: ${position.id}`);
                console.log(`   Token: ${position.signal.token}`);
                console.log(`   Status: ${position.status}`);
                console.log(`   MaxExitTime: ${position.signal.maxExitTime}`);

                if (minutesUntilExit <= 0) {
                    console.log(chalk.red(`   ⏰ EXPIRED by ${Math.abs(minutesUntilExit)} minutes!`));
                    if (position.status === 'ACTIVE') {
                        console.log(chalk.red(`   🚨 CRITICAL: Still active but should be expired!`));
                    }
                } else {
                    console.log(chalk.green(`   ⏰ ${minutesUntilExit} minutes until exit`));
                }
                console.log();
            }
        }

    } catch (error) {
        console.log(chalk.red(`❌ Error checking positions: ${error.message}`));
    }
}

async function main() {
    try {
        // Test maxExitTime validation scenarios
        await testMaxExitTimeScenarios();

        // Check current positions
        await verifyCurrentPositions();

        console.log(chalk.blue('\n✅ MaxExitTime verification complete!'));
        console.log(chalk.gray('\nNote: Check server logs for detailed validation messages.'));

    } catch (error) {
        console.log(chalk.red(`\n❌ Verification failed: ${error.message}`));
        process.exit(1);
    }
}

main(); 