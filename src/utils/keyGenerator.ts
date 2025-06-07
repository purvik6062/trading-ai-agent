import { randomBytes } from "crypto";

export class ApiKeyGenerator {
  /**
   * Generate a secure API key with the specified prefix and length
   * @param prefix - Prefix for the key (e.g., 'admin', 'trading', 'readonly')
   * @param length - Length of the random part (default: 32)
   * @returns Formatted API key
   */
  static generate(prefix: string, length: number = 32): string {
    const randomPart = randomBytes(length).toString("hex");
    const timestamp = Date.now().toString(36);
    return `${prefix}_${timestamp}_${randomPart}`;
  }

  /**
   * Generate a set of API keys for different access levels
   * @returns Object with admin, trading, and read-only keys
   */
  static generateKeySet(): {
    admin: string;
    trading: string;
    readOnly: string;
  } {
    return {
      admin: this.generate("admin", 32),
      trading: this.generate("trading", 32),
      readOnly: this.generate("readonly", 32),
    };
  }

  /**
   * Validate API key format
   * @param key - API key to validate
   * @returns True if key has valid format
   */
  static isValidFormat(key: string): boolean {
    // Check if key follows the pattern: prefix_timestamp_randomhex
    const pattern = /^[a-zA-Z]+_[a-zA-Z0-9]+_[a-f0-9]{64}$/;
    return pattern.test(key);
  }

  /**
   * Extract prefix from API key
   * @param key - API key
   * @returns Prefix or null if invalid
   */
  static extractPrefix(key: string): string | null {
    if (!this.isValidFormat(key)) return null;
    return key.split("_")[0];
  }
}

// CLI utility for generating keys
if (require.main === module) {
  console.log("🔑 Generating secure API keys...\n");

  const keys = ApiKeyGenerator.generateKeySet();

  console.log("Add these to your .env file:");
  console.log("================================");
  console.log(`API_KEY_ADMIN=${keys.admin}`);
  console.log(`API_KEY_TRADING=${keys.trading}`);
  console.log(`API_KEY_READ_ONLY=${keys.readOnly}`);
  console.log("================================\n");

  console.log("⚠️  IMPORTANT SECURITY NOTES:");
  console.log("- Store these keys securely");
  console.log("- Never commit them to git");
  console.log("- Use different keys for different environments");
  console.log("- Rotate keys regularly");
  console.log("- Monitor API usage for anomalies");
}
