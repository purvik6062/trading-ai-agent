// Enzyme Protocol Contract Addresses on Arbitrum
export const ENZYME_ARBITRUM_ADDRESSES = {
  // Core Protocol Contracts
  Dispatcher: "0x8da28441a4c594fd2fac72726c1412d8cf9e4a19",
  FundDeployer: "0xa2b4c827de13d4e9801ea1ca837524a1a148dec3",
  IntegrationManager: "0x55df97aca98c2a708721f28ea1ca42a2be7ff934",
  FeeManager: "0x2c46503d4a0313c7161a5593b6865baa194b466f",
  PolicyManager: "0xbde1e8c4a061cd28f4871860ddf22200b85ee9ec",

  // Integration Adapters
  UniswapV3Adapter: "0xea0f3cc847c8e388bd2f7adac130b64b6754f5e2",

  // Asset Contracts (Common tokens on Arbitrum)
  USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  ARB: "0x912ce59144191c1204e64559fe8253a0e49e6548",
  WETH: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",

  // Price Feeds and Aggregators
  AggregatedDerivativePriceFeed: "0x487f6a8a93c2be5a296ead2c3fbc3fceed4ac599",
  ChainlinkPriceFeed: "0x41d82e0512d77508ad486d6800059f3d936910db",

  // Wrapped Native Asset Manager
  WrappedNativeAssetManager: "0x5c9348fbedb75c39f0e84396618accab6c01f847",
};

// Minimal ABIs for essential functions
export const VAULT_PROXY_ABI = [
  {
    name: "buyShares",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_investmentAmount", type: "uint256" },
      { name: "_minSharesQuantity", type: "uint256" },
    ],
    outputs: [{ name: "sharesReceived_", type: "uint256" }],
  },
  {
    name: "deposit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_denominationAssetAmount", type: "uint256" },
      { name: "_minSharesQuantity", type: "uint256" },
    ],
    outputs: [{ name: "sharesReceived_", type: "uint256" }],
  },
  {
    name: "redeemSharesInKind",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_sharesQuantity", type: "uint256" },
      { name: "_additionalAssets", type: "address[]" },
      { name: "_assetsToSkip", type: "address[]" },
    ],
    outputs: [
      { name: "payoutAssets_", type: "address[]" },
      { name: "payoutAmounts_", type: "uint256[]" },
    ],
  },
  {
    name: "getAccessor",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "accessor_", type: "address" }],
  },
  {
    name: "getOwner",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "owner_", type: "address" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "totalSupply",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "name",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
];

export const COMPTROLLER_ABI = [
  {
    name: "calcGrossShareValue",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "grossShareValue_", type: "uint256" }],
  },
  {
    name: "getDenominationAsset",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "denominationAsset_", type: "address" }],
  },
  {
    name: "getVaultProxy",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "vaultProxy_", type: "address" }],
  },
  {
    name: "buyShares",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_investmentAmount", type: "uint256" },
      { name: "_minSharesQuantity", type: "uint256" },
    ],
    outputs: [{ name: "sharesReceived_", type: "uint256" }],
  },
  {
    name: "callOnExtension",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_extension", type: "address" },
      { name: "_actionId", type: "uint256" },
      { name: "_callArgs", type: "bytes" },
    ],
    outputs: [],
  },
];

export const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "name",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
];

// Token decimals mapping
export const TOKEN_DECIMALS: Record<string, number> = {
  USDC: 6,
  ARB: 18,
  WETH: 18,
  USDT: 6,
  DAI: 18,
  WBTC: 8,
};

// Integration manager action IDs for Uniswap V3
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

// Token addresses on Arbitrum (now sourced from ENZYME_ARBITRUM_ADDRESSES)
const TOKEN_ADDRESSES: Record<string, string> = {
  ARB: ENZYME_ARBITRUM_ADDRESSES.ARB,
  USDC: ENZYME_ARBITRUM_ADDRESSES.USDC,
  WETH: ENZYME_ARBITRUM_ADDRESSES.WETH,
  USDT: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
  DAI: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
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
