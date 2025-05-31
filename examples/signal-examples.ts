// Example trading signals for testing the parser and system

export const signalExamples = {
  // Buy signal example
  buySignal: `🚀 Bullish Alert 🚀

🏛️ Token: SAGA (saga-2)
📈 Signal: Buy
💰 Entry Price: $0.3753
🎯 Targets:
TP1: $0.75
TP2: $0.85
🛑 Stop Loss: $0.35
⏳ Timeline: June 2025

💡 Trade Tip:
Bullish sentiment from the tweet suggests a potential rebound from the monthly low. Targets align with a 2x increase in June, supported by technical indicators like MACD crossover. Maintain stop loss to manage downside risk. Monitor Bitcoin trends as altcoins often follow market leaders.`,

  // Put options signal example
  putSignal: `🐻 Bearish Put Option 🐻

🏛️ Token: HYPE (hyperliquid)
📈 Signal: Put Options
💰 Entry Price: $32.5255
🎯 Targets:
TP1: $30
TP2: $27
🛑 Stop Loss: $33
⏳ Timeline: Short-term (24-48 hours)

💡 Trade Tip:
Monitor resistance at $30-$31 for profit-taking. Consider Put Options as price hovers above key levels. Accumulate at $27 or lower if bearish momentum persists. Maintain stop-loss above $33 to limit downside risk.`,

  // Hold signal example
  holdSignal: `⏳ Hold Steady ⏳

🏛️ Token: HYPE (hyperblast)
📈 Signal: Hold
💰 Entry Price: $0.0048
🎯 Targets:
TP1: $0.0054
TP2: $0.0058
🛑 Stop Loss: $0.0036
⏳ Timeline: Short-term (1-3 days)

💡 Trade Tip:
Current price shows minimal volatility (0.19% change) with low volume ($5.05). Monitor for breakout above $0.0054 resistance or breakdown below $0.0036 support. Tweet's $27-$30 targets are incongruent with Hyperblast's sub-cent valuation trends.`,

  // Multiple signals in one message
  multipleSignals: `🚀 Bullish Alert 🚀

🏛️ Token: SAGA (saga-2)
📈 Signal: Buy
💰 Entry Price: $0.3753
🎯 Targets:
TP1: $0.75
TP2: $0.85
🛑 Stop Loss: $0.35
⏳ Timeline: June 2025

🐻 Bearish Put Option 🐻

🏛️ Token: HYPE (hyperliquid)
📈 Signal: Put Options
💰 Entry Price: $32.5255
🎯 Targets:
TP1: $30
TP2: $27
🛑 Stop Loss: $33
⏳ Timeline: Short-term (24-48 hours)`,

  // Invalid signal (for testing error handling)
  invalidSignal: `Invalid signal format
No proper structure here
Just random text`,

  // Malformed signal (missing required fields)
  malformedSignal: `🚀 Bullish Alert 🚀

🏛️ Token: SAGA
📈 Signal: Buy
💰 Entry Price: $0.3753
🎯 Targets:
TP1: $0.75
🛑 Stop Loss: $0.35`,
};

// Test runner function
export async function testSignalParsing(): Promise<void> {
  const { SignalParser } = await import("../src/utils/signalParser");

  console.log("🧪 Testing Signal Parsing...\n");

  Object.entries(signalExamples).forEach(([name, signal]) => {
    console.log(`📊 Testing ${name}:`);

    const parsed = SignalParser.parseMultipleSignals(signal);

    if (parsed.length > 0) {
      console.log(`✅ Successfully parsed ${parsed.length} signal(s)`);
      parsed.forEach((sig, index) => {
        console.log(`   ${index + 1}. ${SignalParser.getSignalSummary(sig)}`);
      });
    } else {
      console.log("❌ No valid signals found");
    }

    console.log("");
  });
}

// API test examples
export const apiTestExamples = {
  // Test parsing endpoint
  parseSignalTest: {
    url: "http://localhost:3000/parse-signal",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: {
      message: signalExamples.buySignal,
    },
  },

  // Test signal processing endpoint
  processSignalTest: {
    url: "http://localhost:3000/signal",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: {
      message: signalExamples.buySignal,
    },
  },

  // Test health endpoint
  healthTest: {
    url: "http://localhost:3000/health",
    method: "GET",
  },

  // Test positions endpoint
  positionsTest: {
    url: "http://localhost:3000/positions",
    method: "GET",
  },
};

// cURL examples for testing
export const curlExamples = {
  parseSignal: `curl -X POST http://localhost:3000/parse-signal \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({ message: signalExamples.buySignal })}'`,

  processSignal: `curl -X POST http://localhost:3000/signal \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({ message: signalExamples.buySignal })}'`,

  getHealth: `curl http://localhost:3000/health`,

  getPositions: `curl http://localhost:3000/positions`,

  getConfig: `curl http://localhost:3000/config`,
};

if (require.main === module) {
  testSignalParsing().catch(console.error);
}
