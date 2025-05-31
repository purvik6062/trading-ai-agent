// Enzyme Protocol contract addresses and configurations for Arbitrum
export const ENZYME_ARBITRUM_ADDRESSES = {
  IntegrationManager: "0x5D052a9659abCf4f3C933D7aFE6a8F0532c5b80E",
  UniswapV3Adapter: "0x8A8eF3eB08af36b8DB7a80a3C8Ebc10B7cBD0f48",
  // Add more addresses as needed
};

// Vault Proxy ABI (essential functions)
export const VAULT_PROXY_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function getAccessor() view returns (address)",
  "function getOwner() view returns (address)",
  "function redeemSharesInKind(uint256 _sharesQuantity, address[] memory _additionalAssets, address[] memory _assetsToSkip) returns (address[] memory payoutAssets_, uint256[] memory payoutAmounts_)",
];

// Comptroller ABI (essential functions)
export const COMPTROLLER_ABI = [
  "function calcGrossShareValue() view returns (uint256)",
  "function getDenominationAsset() view returns (address)",
  "function buyShares(uint256 _investmentAmount, uint256 _minSharesQuantity) returns (uint256 sharesReceived_)",
  "function callOnExtension(address _extension, uint256 _actionId, bytes memory _callArgs)",
];

// ERC20 ABI (essential functions)
export const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

// Token decimals mapping
export const TOKEN_DECIMALS: Record<string, number> = {
  ARB: 18,
  USDC: 6,
  USDT: 6,
  DAI: 18,
  WETH: 18,
  WBTC: 8,
};

// Uniswap V3 actions
export const UNISWAP_V3_ACTIONS = {
  TAKE_ORDER: 0,
};

// Uniswap V3 fee tiers
export const UNISWAP_V3_FEE_TIERS = {
  LOWEST: 100, // 0.01%
  LOW: 500, // 0.05%
  MEDIUM: 3000, // 0.3%
  HIGH: 10000, // 1%
};

// Token addresses on Arbitrum
const TOKEN_ADDRESSES: Record<string, string> = {
  ARB: "0x912ce59144191c1204e64559fe8253a0e49e6548",
  USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  USDT: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
  DAI: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
  WETH: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  WBTC: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
};

/**
 * Get token address by symbol
 */
export function getTokenAddress(symbol: string): string {
  const address = TOKEN_ADDRESSES[symbol.toUpperCase()];
  if (!address) {
    throw new Error(`Token address not found for symbol: ${symbol}`);
  }
  return address;
}

/**
 * Get token decimals by symbol
 */
export function getTokenDecimals(symbol: string): number {
  const decimals = TOKEN_DECIMALS[symbol.toUpperCase()];
  if (decimals === undefined) {
    throw new Error(`Token decimals not found for symbol: ${symbol}`);
  }
  return decimals;
}
