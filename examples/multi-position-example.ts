/**
 * Multi-Position Management Example
 *
 * This example demonstrates how the enhanced GameEngineService with MultiPositionManager
 * can handle multiple concurrent trades in a single vault with different signals, targets,
 * and exit strategies.
 */

import { GameEngineService } from "../src/services/gameEngineService";
import { TradingSignal, SignalType } from "../src/types/trading";
import { logger } from "../src/utils/logger";

// Example configuration
const gameEngineConfig = {
  apiKey: process.env.GAME_ENGINE_API_KEY || "your-api-key",
  rpcUrl: process.env.ETHEREUM_RPC_URL || "https://arb1.arbitrum.io/rpc",
  privateKey: process.env.ENZYME_PRIVATE_KEY || "your-private-key",
  vaultAddress: process.env.ENZYME_VAULT_ADDRESS || "your-vault-address",
  multiPosition: {
    maxConcurrentPositions: 15,
    maxPositionsPerToken: 3,
    conflictResolution: "risk_based" as const,
    riskManagement: {
      maxTotalExposure: 50000, // $50K max total exposure
      maxSingleTokenExposure: 10000, // $10K max per token
      correlationThreshold: 0.8,
    },
    exitStrategy: {
      allowPartialExits: true,
      consolidateSmallPositions: true,
      minimumPositionSize: 100, // $100 minimum
    },
  },
};

async function demonstrateMultiPositionManagement() {
  try {
    // Initialize the GameEngine service
    console.log(
      "🚀 Initializing GameEngine service with multi-position management..."
    );
    const gameEngine = new GameEngineService(gameEngineConfig);
    await gameEngine.init();

    // Example 1: Handling multiple Buy signals for the same token
    console.log("\n📊 Example 1: Multiple Buy signals for AAVE");

    const aaveBuySignal1: TradingSignal = {
      token: "AAVE",
      tokenId: "aave",
      signal: SignalType.BUY,
      currentPrice: 180.5,
      targets: [190, 200, 210],
      stopLoss: 170,
      timeline: "Short-term (3-5 days)",
      maxExitTime: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      tradeTip: "Strong support at $175, breaking resistance at $185",
    };

    const aaveBuySignal2: TradingSignal = {
      token: "AAVE",
      tokenId: "aave",
      signal: SignalType.BUY,
      currentPrice: 182.0,
      targets: [195, 205, 215],
      stopLoss: 172,
      timeline: "Medium-term (1-2 weeks)",
      maxExitTime: new Date(
        Date.now() + 14 * 24 * 60 * 60 * 1000
      ).toISOString(),
      tradeTip: "DeFi momentum building, institutional interest increasing",
    };

    // Process both signals - should handle merging or separate positions
    const position1 = await gameEngine.processTradingSignal(aaveBuySignal1);
    console.log(
      `✅ AAVE Buy Signal 1 processed: ${position1?.id || "Not executed"}`
    );

    const position2 = await gameEngine.processTradingSignal(aaveBuySignal2);
    console.log(
      `✅ AAVE Buy Signal 2 processed: ${position2?.id || "Merged/Conflicted"}`
    );

    // Example 2: Conflicting signals (Buy vs Put Options)
    console.log("\n🔄 Example 2: Conflicting signals for ARB");

    const arbBuySignal: TradingSignal = {
      token: "ARB",
      tokenId: "arbitrum",
      signal: SignalType.BUY,
      currentPrice: 1.25,
      targets: [1.35, 1.45, 1.55],
      stopLoss: 1.15,
      timeline: "Short-term (1-3 days)",
      maxExitTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      tradeTip: "Layer 2 adoption growing, bullish momentum",
    };

    const arbPutSignal: TradingSignal = {
      token: "ARB",
      tokenId: "arbitrum",
      signal: SignalType.PUT_OPTIONS,
      currentPrice: 1.28,
      targets: [1.2, 1.1, 1.0],
      stopLoss: 1.35,
      timeline: "Short-term (24-48 hours)",
      maxExitTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      tradeTip: "Overbought conditions, expect pullback",
    };

    // Process conflicting signals - system should handle conflict resolution
    const arbBuyPosition = await gameEngine.processTradingSignal(arbBuySignal);
    console.log(
      `📈 ARB Buy Signal processed: ${arbBuyPosition?.id || "Not executed"}`
    );

    const arbPutPosition = await gameEngine.processTradingSignal(arbPutSignal);
    console.log(
      `📉 ARB Put Signal processed: ${arbPutPosition?.id || "Conflicted"}`
    );

    // Example 3: Multiple different tokens
    console.log("\n🎯 Example 3: Multiple different tokens");

    const signals: TradingSignal[] = [
      {
        token: "WETH",
        tokenId: "ethereum",
        signal: SignalType.BUY,
        currentPrice: 2450.0,
        targets: [2500, 2550, 2600],
        stopLoss: 2400,
        timeline: "Medium-term (1 week)",
        maxExitTime: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000
        ).toISOString(),
        tradeTip: "ETH upgrade anticipation, institutional demand",
      },
      {
        token: "UNI",
        tokenId: "uniswap",
        signal: SignalType.BUY,
        currentPrice: 8.5,
        targets: [9.0, 9.5, 10.0],
        stopLoss: 8.0,
        timeline: "Short-term (2-4 days)",
        maxExitTime: new Date(
          Date.now() + 4 * 24 * 60 * 60 * 1000
        ).toISOString(),
        tradeTip: "DEX volume increasing, governance token strength",
      },
      {
        token: "BAL",
        tokenId: "balancer",
        signal: SignalType.PUT_OPTIONS,
        currentPrice: 4.2,
        targets: [4.0, 3.8, 3.6],
        stopLoss: 4.5,
        timeline: "Short-term (1-2 days)",
        maxExitTime: new Date(
          Date.now() + 2 * 24 * 60 * 60 * 1000
        ).toISOString(),
        tradeTip:
          "Balancer facing competitive pressure, profit-taking expected",
      },
    ];

    for (const signal of signals) {
      const position = await gameEngine.processTradingSignal(signal);
      console.log(
        `⚡ ${signal.token} ${signal.signal} processed: ${position?.id || "Not executed"}`
      );
    }

    // Check system status
    console.log("\n📊 System Status:");
    const status = gameEngine.getStatus();
    console.log(`Active Positions: ${status.activePositions}`);
    console.log(`Multi-Position Stats:`, status.multiPositionStats);

    // Get detailed position information
    console.log("\n📋 Detailed Position Information:");
    const activePositions = await gameEngine.getCurrentPositions();
    activePositions.forEach((pos) => {
      console.log(`Position ${pos.id}:`);
      console.log(`  Token: ${pos.signal.token} (${pos.signal.signal})`);
      console.log(`  Status: ${pos.status}`);
      console.log(`  Entry Price: $${pos.signal.currentPrice}`);
      console.log(`  Targets: [${pos.signal.targets.join(", ")}]`);
      console.log(`  Stop Loss: $${pos.signal.stopLoss}`);
      console.log(`  Remaining: $${pos.remainingAmount || 0}`);
      console.log(`  Created: ${pos.createdAt.toISOString()}`);
      console.log(`  Max Exit: ${pos.signal.maxExitTime}`);
      console.log("");
    });

    // Simulate monitoring for a few cycles
    console.log("\n🔄 Starting position monitoring simulation...");
    for (let i = 0; i < 3; i++) {
      console.log(`\nMonitoring cycle ${i + 1}:`);
      await gameEngine.monitorPositions([]);
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds
    }

    // Example 4: Manual position closure
    if (activePositions.length > 0) {
      console.log("\n🚪 Example 4: Manual position closure");
      const positionToClose = activePositions[0];
      console.log(
        `Manually closing position: ${positionToClose.id} (${positionToClose.signal.token})`
      );

      // This would typically be done through the trading functions
      // but for demonstration, we can show the API exists
      console.log("Position closure would be handled by MultiPositionManager");
    }

    // Example 5: Risk management scenarios
    console.log("\n⚠️ Example 5: Risk management demonstration");

    // Try to exceed position limits
    const oversizedSignal: TradingSignal = {
      token: "WBTC",
      tokenId: "bitcoin",
      signal: SignalType.BUY,
      currentPrice: 45000,
      targets: [46000, 47000, 48000],
      stopLoss: 44000,
      timeline: "Long-term (1 month)",
      maxExitTime: new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000
      ).toISOString(),
      tradeTip: "Bitcoin institutional adoption continuing",
    };

    // This should trigger risk management rules
    const oversizedPosition =
      await gameEngine.processTradingSignal(oversizedSignal);
    console.log(
      `🛡️ Large position attempt: ${oversizedPosition?.id || "Rejected by risk management"}`
    );

    console.log("\n✅ Multi-position management demonstration completed!");
    console.log("\nKey features demonstrated:");
    console.log("✓ Multiple positions per token with conflict resolution");
    console.log("✓ Buy vs Put Options conflict handling");
    console.log("✓ Position grouping and risk management");
    console.log("✓ Automated monitoring and exit management");
    console.log("✓ Exposure limits and position sizing");
    console.log("✓ Time-based and target-based exits");
  } catch (error) {
    console.error("❌ Error in multi-position demonstration:", error);
  }
}

async function demonstrateConflictResolutionStrategies() {
  console.log("\n🔀 Conflict Resolution Strategies Demonstration\n");

  // Strategy 1: first_wins
  console.log("Strategy 1: first_wins - First signal takes priority");

  // Strategy 2: merge_similar
  console.log("Strategy 2: merge_similar - Similar signals are merged");

  // Strategy 3: prioritize_latest
  console.log("Strategy 3: prioritize_latest - Latest signal overwrites");

  // Strategy 4: risk_based
  console.log("Strategy 4: risk_based - Lower risk signal wins");

  console.log(
    "Each strategy handles conflicts differently based on business logic"
  );
}

async function demonstratePositionGrouping() {
  console.log("\n👥 Position Grouping Demonstration\n");

  console.log("Position groups allow:");
  console.log("• Combined exit strategies for related positions");
  console.log("• Risk management across correlated tokens");
  console.log("• Efficient monitoring and execution");
  console.log("• Weighted average targets and stop losses");
}

// Main execution
if (require.main === module) {
  console.log("🎬 Multi-Position Management System Demo");
  console.log("==========================================");

  demonstrateMultiPositionManagement()
    .then(() => demonstrateConflictResolutionStrategies())
    .then(() => demonstratePositionGrouping())
    .then(() => {
      console.log("\n🎉 Demo completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Demo failed:", error);
      process.exit(1);
    });
}

export {
  demonstrateMultiPositionManagement,
  demonstrateConflictResolutionStrategies,
  demonstratePositionGrouping,
};
