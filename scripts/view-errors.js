const axios = require('axios');
const chalk = require('chalk');

const API_BASE = 'http://localhost:3000';

async function viewErrorSummary() {
    try {
        console.log(chalk.blue('\n📊 Error Summary'));
        console.log(chalk.blue('================\n'));

        const response = await axios.get(`${API_BASE}/admin/errors/summary`);
        const data = response.data;

        if (!data.success) {
            console.log(chalk.red('❌ Failed to get error summary'));
            return;
        }

        console.log(`Total Unique Errors: ${chalk.yellow(data.totalUniqueErrors)}`);
        console.log(`Total Error Count: ${chalk.yellow(data.totalErrorCount)}`);
        console.log(`Total Suppressed: ${chalk.red(data.totalSuppressed)}`);
        console.log(`Timestamp: ${chalk.gray(data.timestamp)}\n`);

        if (data.topErrors && data.topErrors.length > 0) {
            console.log(chalk.blue('🔥 Top Error Sources:'));
            console.log(chalk.blue('--------------------'));

            data.topErrors.forEach((error, index) => {
                const totalImpact = error.count + error.suppressed;
                console.log(
                    `${index + 1}. ${chalk.cyan(error.key.substring(0, 60))}${error.key.length > 60 ? '...' : ''}`
                );
                console.log(
                    `   Count: ${chalk.yellow(error.count)} | Suppressed: ${chalk.red(error.suppressed)} | Impact: ${chalk.magenta(totalImpact)}\n`
                );
            });
        }

    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            console.log(chalk.red('❌ Server not running. Start the server first: npm start'));
        } else {
            console.log(chalk.red('❌ Error fetching summary:', error.message));
        }
    }
}

async function viewDetailedStats() {
    try {
        console.log(chalk.blue('\n📋 Detailed Error Statistics'));
        console.log(chalk.blue('==============================\n'));

        const response = await axios.get(`${API_BASE}/admin/errors/stats`);
        const data = response.data;

        if (!data.success) {
            console.log(chalk.red('❌ Failed to get error stats'));
            return;
        }

        if (!data.errors || data.errors.length === 0) {
            console.log(chalk.green('✅ No errors recorded'));
            return;
        }

        // Sort by total impact (count + suppressed)
        const sortedErrors = data.errors.sort((a, b) =>
            (b.count + b.suppressed) - (a.count + a.suppressed)
        );

        sortedErrors.forEach((error, index) => {
            const totalImpact = error.count + error.suppressed;
            const firstTime = new Date(error.firstOccurrence).toLocaleString();
            const lastTime = new Date(error.lastOccurrence).toLocaleString();

            console.log(`${chalk.yellow(index + 1)}. ${chalk.cyan(error.errorKey)}`);
            console.log(`   📊 Count: ${chalk.yellow(error.count)} | Suppressed: ${chalk.red(error.suppressed)} | Total Impact: ${chalk.magenta(totalImpact)}`);
            console.log(`   ⏰ First: ${chalk.gray(firstTime)}`);
            console.log(`   🕒 Last:  ${chalk.gray(lastTime)}\n`);
        });

        console.log(`${chalk.gray('Timestamp:')} ${data.timestamp}`);

    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            console.log(chalk.red('❌ Server not running. Start the server first: npm start'));
        } else {
            console.log(chalk.red('❌ Error fetching stats:', error.message));
        }
    }
}

async function cleanupErrors(olderThanMinutes = 60) {
    try {
        console.log(chalk.blue(`\n🧹 Cleaning up errors older than ${olderThanMinutes} minutes...`));

        const response = await axios.post(`${API_BASE}/admin/errors/cleanup`, {
            olderThanMinutes
        });
        const data = response.data;

        if (data.success) {
            console.log(chalk.green(`✅ ${data.message}`));
        } else {
            console.log(chalk.red('❌ Cleanup failed'));
        }

    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            console.log(chalk.red('❌ Server not running. Start the server first: npm start'));
        } else {
            console.log(chalk.red('❌ Error during cleanup:', error.message));
        }
    }
}

async function showMenu() {
    console.log(chalk.blue('\n🔧 Error Management Tool'));
    console.log(chalk.blue('========================\n'));
    console.log('1. View Error Summary');
    console.log('2. View Detailed Statistics');
    console.log('3. Cleanup Old Errors (60 minutes)');
    console.log('4. Cleanup Old Errors (30 minutes)');
    console.log('5. Exit\n');
}

async function handleChoice(choice) {
    switch (choice) {
        case '1':
            await viewErrorSummary();
            break;
        case '2':
            await viewDetailedStats();
            break;
        case '3':
            await cleanupErrors(60);
            break;
        case '4':
            await cleanupErrors(30);
            break;
        case '5':
            console.log(chalk.green('👋 Goodbye!'));
            process.exit(0);
            break;
        default:
            console.log(chalk.red('Invalid choice. Please try again.'));
    }
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
            case 'summary':
                await viewErrorSummary();
                break;
            case 'stats':
                await viewDetailedStats();
                break;
            case 'cleanup':
                const minutes = parseInt(process.argv[3]) || 60;
                await cleanupErrors(minutes);
                break;
            default:
                console.log(chalk.red('Unknown command. Available: summary, stats, cleanup [minutes]'));
        }
        process.exit(0);
    }

    // Interactive mode
    while (true) {
        await showMenu();

        const choice = await new Promise((resolve) => {
            rl.question(chalk.cyan('Enter your choice (1-5): '), resolve);
        });

        await handleChoice(choice);

        // Wait for user to press enter before showing menu again
        if (choice !== '5') {
            await new Promise((resolve) => {
                rl.question(chalk.gray('\nPress Enter to continue...'), resolve);
            });
        }
    }
}

main().catch(console.error); 