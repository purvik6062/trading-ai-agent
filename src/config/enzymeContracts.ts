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
  // Aave Arbitrum Tokens
  AARBAAVE: 18,
  AARBARB: 18,
  AARBDAI: 18,
  AARBFRAX: 18,
  AARBGHO: 18,
  AARBLINK: 18,
  AARBLUSD: 18,
  AARBRETH: 18,
  AARBUSDC: 6,
  AARBUSDCN: 6,
  AARBUSDT: 6,
  AARBWBTC: 8,
  AARBWEETH: 18,
  AARBWETH: 18,
  AARBWSTETH: 18,

  // Base Tokens
  AAVE: 18,
  ARB: 18,
  BAL: 18,
  CBETH: 18,
  COMP: 18,
  CRV: 18,
  CVX: 18,
  DAI: 18,
  EZETH: 18,
  FRAX: 18,
  GHO: 18,
  GMX: 18,
  GRT: 18,
  IBTC: 8,
  LINK: 18,
  LUSD: 18,
  MLN: 18,
  OP: 18,
  OSETH: 18,
  RDNT: 18,
  RETH: 18,
  RSETH: 18,
  SOL: 9,
  SUSDE: 18,
  SWETH: 18,
  TBTC: 18,
  UNI: 18,
  USDC: 6,
  USDE: 18,
  USDT: 6,
  WAVAX: 18,
  WBNB: 18,
  WBTC: 8,
  WEETH: 18,
  WETH: 18,
  WSTETH: 18,
  XUSD: 18,
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

// Token addresses on Arbitrum
export const TOKEN_ADDRESSES: Record<string, string> = {
  // Aave Arbitrum Tokens
  AARBAAVE: "0xf329e36c7bf6e5e86ce2150875a84ce77f477375",
  AARBARB: "0x6533afac2e7bccb20dca161449a13a32d391fb00",
  AARBDAI: "0x82e64f49ed5ec1bc6e43dad4fc8af9bb3a2312ee",
  AARBFRAX: "0x38d693ce1df5aadf7bc62595a37d667ad57922e5",
  AARBGHO: "0xebe517846d0f36eced99c735cbf6131e1feb775d",
  AARBLINK: "0x191c10aa4af7c30e871e70c95db0e4eb77237530",
  AARBLUSD: "0x8ffdf2de812095b1d19cb146e4c004587c0a0692",
  AARBRETH: "0x8eb270e296023e9d92081fdf967ddd7878724424",
  AARBUSDC: "0x625e7708f30ca75bfd92586e17077590c60eb4cd",
  AARBUSDCN: "0x724dc807b04555b71ed48a6896b6f41593b8c637",
  AARBUSDT: "0x6ab707aca953edaefbc4fd23ba73294241490620",
  AARBWBTC: "0x078f358208685046a11c85e8ad32895ded33a249",
  AARBWEETH: "0x8437d7c167dfb82ed4cb79cd44b7a32a1dd95c77",
  AARBWETH: "0xe50fa9b3c56ffb159cb0fca61f5c9d750e8128c8",
  AARBWSTETH: "0x513c7e3a9c69ca3e22550ef58ac1c0088e918fff",

  // Base Tokens
  AAVE: "0xba5ddd1f9d7f570dc94a51479a000e3bce967196",
  ARB: ENZYME_ARBITRUM_ADDRESSES.ARB,
  BAL: "0x040d1edc9569d4bab2d15287dc5a4f10f56a56b8",
  CBETH: "0x1debd73e752beaf79865fd6446b0c970eae7732f",
  COMP: "0x354a6da3fcde098f8389cad84b0182725c6c91de",
  CRV: "0x11cdb42b0eb46d95f990bedd4695a6e3fa034978",
  CVX: "0xaafcfd42c9954c6689ef1901e03db742520829c5",
  DAI: "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1",
  EZETH: "0x2416092f143378750bb29b79ed961ab195cceea5",
  FRAX: "0x17fc002b466eec40dae837fc4be5c67993ddbd6f",
  GHO: "0x7dff72693f6a4149b17e7c6314655f6a9f7c8b33",
  GMX: "0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a",
  GRT: "0x9623063377ad1b27544c965ccd7342f7ea7e88c7",
  IBTC: "0x050c24dbf1eec17babe5fc585f06116a259cc77a",
  LINK: "0xf97f4df75117a78c1a5a0dbb814af92458539fb4",
  LUSD: "0x93b346b6bc2548da6a1e7d98e9a421b42541425b",
  MLN: "0x8f5c1a99b1df736ad685006cb6adca7b7ae4b514",
  OP: "0xac800fd6159c2a2cb8fc31ef74621eb430287a5a",
  OSETH: "0xf7d4e7273e5015c96728a6b02f31c505ee184603",
  RDNT: "0x3082cc23568ea640225c2467653db90e9250aaa0",
  RETH: "0xec70dcb4a1efa46b8f2d97c310c9c4790ba5ffa8",
  RSETH: "0x4186bfc76e2e237523cbc30fd220fe055156b41f",
  SOL: "0x2bcc6d6cdbbdc0a4071e48bb3b969b06b3330c07",
  SUSDE: "0x211cc4dd073734da055fbf44a2b4667d5e5fe5d2",
  SWETH: "0xbc011a12da28e8f0f528d9ee5e7039e22f91cf18",
  TBTC: "0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40",
  UNI: "0xfa7f8980b0f1e64a2062791cc3b0871572f1f7f0",
  USDC: ENZYME_ARBITRUM_ADDRESSES.USDC,
  USDE: "0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34",
  USDT: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
  WAVAX: "0x565609faf65b92f7be02468acf86f8979423e514",
  WBNB: "0xa9004a5421372e1d83fb1f85b0fc986c912f91f3",
  WBTC: "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f",
  WEETH: "0x35751007a407ca6feffe80b3cb397736d2cf4dbe",
  WETH: ENZYME_ARBITRUM_ADDRESSES.WETH,
  WSTETH: "0x5979d7b546e38e414f7e9822514be443a4800529",
  XUSD: "0xe80772eaf6e2e18b651f160bc9158b2a5cafca65",
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
