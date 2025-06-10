const axios = require('axios');
const chalk = require('chalk');

const API_BASE = 'http://localhost:3000';

async function debugMaxExitTime() {
    try {
        console.log(chalk.blue('\n🔍 MaxExitTime Debug Tool'));
        console.log(chalk.blue('=========================\n'));

        // 1. Check service health
        console.log(chalk.yellow('1. Checking service health...'));
        const health = await axios.get(`${API_BASE}/health`);
        console.log(`✅ Service Status: ${chalk.green(health.data.status)}`);
        console.log(`📊 Active Users: ${health.data.services?.multiUserSignal?.activeUsers || 0}`);
        console.log();

        // 2. Get all users
        console.log(chalk.yellow('2. Getting all users...'));
        const usersResponse = await axios.get(`${API_BASE}/users`);
        const users = usersResponse.data.users || [];
        console.log(`👥 Total Users: ${users.length}`);

        if (users.length === 0) {
            console.log(chalk.red('⚠️ No users found. Register a user first.'));
            return;
        }

        // 3. Check positions for each user
        for (const user of users) {
            console.log(chalk.cyan(`\n🔍 Checking positions for user: ${user.username}`));

            try {
                // Get user's active positions
                const positionsResponse = await axios.get(`${API_BASE}/users/${user.username}/positions`);
                const activePositions = positionsResponse.data.positions || [];

                console.log(`📈 Active Positions: ${activePositions.length}`);

                if (activePositions.length > 0) {
                    for (const position of activePositions) {
                        const maxExitTime = new Date(position.signal.maxExitTime);
                        const now = new Date();
                        const timeUntilExit = maxExitTime.getTime() - now.getTime();
                        const minutesUntilExit = Math.round(timeUntilExit / (1000 * 60));

                        console.log(`  📍 Position ${position.id}:`);
                        console.log(`     Token: ${position.signal.token}`);
                        console.log(`     Status: ${position.status}`);
                        console.log(`     MaxExitTime: ${position.signal.maxExitTime}`);
                        console.log(`     Current Time: ${now.toISOString()}`);

                        if (minutesUntilExit <= 0) {
                            console.log(chalk.red(`     ⏰ OVERDUE by ${Math.abs(minutesUntilExit)} minutes!`));
                        } else {
                            console.log(chalk.green(`     ⏰ ${minutesUntilExit} minutes until exit`));
                        }
                        console.log();
                    }
                }

                // Get user's persisted positions
                const persistedResponse = await axios.get(`${API_BASE}/users/${user.username}/positions/persisted`);
                const persistedPositions = persistedResponse.data.persistedPositions || [];

                console.log(`💾 Persisted Positions: ${persistedPositions.length}`);

                if (persistedPositions.length > 0) {
                    for (const position of persistedPositions) {
                        const maxExitTime = new Date(position.signal.maxExitTime);
                        const now = new Date();
                        const timeUntilExit = maxExitTime.getTime() - now.getTime();
                        const minutesUntilExit = Math.round(timeUntilExit / (1000 * 60));

                        console.log(`  💾 Persisted ${position.id}:`);
                        console.log(`     Token: ${position.signal.token}`);
                        console.log(`     Status: ${position.status}`);
                        console.log(`     MaxExitTime: ${position.signal.maxExitTime}`);

                        if (minutesUntilExit <= 0) {
                            console.log(chalk.red(`     ⏰ SHOULD BE EXPIRED by ${Math.abs(minutesUntilExit)} minutes!`));

                            if (position.status === 'ACTIVE') {
                                console.log(chalk.red(`     🚨 CRITICAL: Position is still ACTIVE but should be expired!`));
                            }
                        } else {
                            console.log(chalk.green(`     ⏰ ${minutesUntilExit} minutes until exit`));
                        }
                        console.log();
                    }
                }

            } catch (error) {
                console.log(chalk.red(`❌ Error checking positions for ${user.username}: ${error.message}`));
            }
        }

        // 4. Check recovery status
        console.log(chalk.yellow('\n4. Checking recovery status...'));
        try {
            const recoveryResponse = await axios.get(`${API_BASE}/admin/recovery/status`);
            const recovery = recoveryResponse.data;

            console.log(`🔄 Total Users in Recovery: ${recovery.totalUsers}`);

            if (recovery.userStats && recovery.userStats.length > 0) {
                for (const userStat of recovery.userStats) {
                    console.log(`  👤 ${userStat.username}: ${userStat.activePositions} active positions`);
                }
            }
        } catch (error) {
            console.log(chalk.red(`❌ Error getting recovery status: ${error.message}`));
        }

    } catch (error) {
        console.log(chalk.red(`❌ Debug failed: ${error.message}`));
    }
}

async function createQuickTestPosition() {
    try {
        console.log(chalk.blue('\n⚡ Creating Quick Test Position (2 minute expiry)'));
        console.log(chalk.blue('==================================================\n'));

        const quickTestSignal = {
            token: "ETH (ethereum)",
            tokenId: "ethereum",
            tokenMentioned: "ETH",
            signal: "Buy",
            currentPrice: 3200,
            targets: [3300, 3400, 3500],
            stopLoss: 3100,
            timeline: "Quick test - 2 minutes",
            maxExitTime: new Date(Date.now() + 2 * 60 * 1000).toISOString(), // 2 minutes from now
            tradeTip: "Quick test position for maxExitTime debugging"
        };

        console.log(`Creating position with maxExitTime: ${quickTestSignal.maxExitTime}`);
        console.log(`Will expire at: ${new Date(quickTestSignal.maxExitTime).toLocaleString()}`);

        const response = await axios.post(`${API_BASE}/signal`, {
            signal_data: quickTestSignal
        });

        if (response.data.success && response.data.position) {
            console.log(chalk.green('✅ Quick test position created!'));
            console.log(`📍 Position ID: ${response.data.position.id}`);
            console.log(`🕐 Will auto-exit in 2 minutes`);
            console.log(chalk.yellow('\n⏰ Monitor the logs for "Time-based exit" message!'));
            return response.data.position.id;
        } else {
            console.log(chalk.red('❌ Failed to create test position'));
            console.log(response.data);
        }

    } catch (error) {
        console.log(chalk.red(`❌ Error creating test position: ${error.message}`));
    }
}

async function monitorPosition(positionId) {
    console.log(chalk.blue(`\n👀 Monitoring position ${positionId} for maxExitTime behavior...`));

    const startTime = Date.now();
    const maxMonitorTime = 5 * 60 * 1000; // Monitor for 5 minutes max

    const monitor = setInterval(async () => {
        try {
            const health = await axios.get(`${API_BASE}/health`);
            const elapsed = Math.round((Date.now() - startTime) / 1000);

            console.log(`[${elapsed}s] Service status: ${health.data.status}, Active positions: ${health.data.services?.multiUserSignal?.activeUsers || 0}`);

            // Check if position still exists
            try {
                const usersResponse = await axios.get(`${API_BASE}/users`);
                const users = usersResponse.data.users || [];

                for (const user of users) {
                    const positionsResponse = await axios.get(`${API_BASE}/users/${user.username}/positions`);
                    const activePositions = positionsResponse.data.positions || [];

                    const position = activePositions.find(p => p.id === positionId);
                    if (position) {
                        const maxExitTime = new Date(position.signal.maxExitTime);
                        const now = new Date();
                        const overdue = now > maxExitTime;

                        if (overdue) {
                            console.log(chalk.red(`[${elapsed}s] 🚨 Position ${positionId} is OVERDUE and still active!`));
                        } else {
                            console.log(chalk.green(`[${elapsed}s] Position ${positionId} still active, not yet due`));
                        }
                        return;
                    }
                }

                console.log(chalk.yellow(`[${elapsed}s] Position ${positionId} no longer in active positions - may have been exited`));
                clearInterval(monitor);

            } catch (posError) {
                console.log(chalk.red(`[${elapsed}s] Error checking position: ${posError.message}`));
            }

            if (Date.now() - startTime > maxMonitorTime) {
                console.log(chalk.yellow('\n⏰ Monitoring timeout reached'));
                clearInterval(monitor);
            }

        } catch (error) {
            console.log(chalk.red(`Monitoring error: ${error.message}`));
        }
    }, 15000); // Check every 15 seconds
}

async function showMenu() {
    console.log(chalk.blue('\n🔧 MaxExitTime Debug Menu'));
    console.log(chalk.blue('=========================\n'));
    console.log('1. Debug Current MaxExitTime Issues');
    console.log('2. Create Quick Test Position (2 min expiry)');
    console.log('3. Create & Monitor Test Position');
    console.log('4. Trigger Position Recovery');
    console.log('5. Exit\n');
}

async function main() {
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    // If command line argument provided, execute directly
    const command = process.argv[2];
    if (command) {
        switch (command) {
            case 'debug':
                await debugMaxExitTime();
                break;
            case 'test':
                await createQuickTestPosition();
                break;
            case 'monitor':
                const positionId = process.argv[3];
                if (positionId) {
                    await monitorPosition(positionId);
                } else {
                    console.log(chalk.red('Please provide position ID: node debug-maxexittime.js monitor <positionId>'));
                }
                break;
            default:
                console.log(chalk.red('Unknown command. Available: debug, test, monitor <positionId>'));
        }
        process.exit(0);
    }

    // Interactive mode
    while (true) {
        await showMenu();

        const choice = await new Promise((resolve) => {
            rl.question(chalk.cyan('Enter your choice (1-5): '), resolve);
        });

        switch (choice) {
            case '1':
                await debugMaxExitTime();
                break;
            case '2':
                await createQuickTestPosition();
                break;
            case '3':
                const positionId = await createQuickTestPosition();
                if (positionId) {
                    await monitorPosition(positionId);
                }
                break;
            case '4':
                try {
                    console.log(chalk.yellow('Triggering position recovery...'));
                    const response = await axios.post(`${API_BASE}/admin/recovery/positions`);
                    console.log(chalk.green('✅ Recovery triggered:'), response.data);
                } catch (error) {
                    console.log(chalk.red('❌ Recovery failed:'), error.message);
                }
                break;
            case '5':
                console.log(chalk.green('👋 Goodbye!'));
                process.exit(0);
                break;
            default:
                console.log(chalk.red('Invalid choice. Please try again.'));
        }

        // Wait for user to press enter before showing menu again
        if (choice !== '5') {
            await new Promise((resolve) => {
                rl.question(chalk.gray('\nPress Enter to continue...'), resolve);
            });
        }
    }
}

main().catch(console.error); 