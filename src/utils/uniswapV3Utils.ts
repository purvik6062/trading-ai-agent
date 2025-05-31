import { ethers } from "ethers";
import { UNISWAP_V3_FEE_TIERS } from "../config/enzymeContracts";

// Uniswap V3 Quoter contract ABI
const QUOTER_V2_ABI = [
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
];

// Uniswap V3 Quoter V2 address on Arbitrum
const QUOTER_V2_ADDRESS = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e";

export interface UniswapV3QuoteParams {
  tokenIn: string;
  tokenOut: string;
  fee: number;
  amountIn: string;
  decimalsIn: number;
  decimalsOut: number;
}

export interface UniswapV3Quote {
  amountOut: string;
  amountOutFormatted: string;
  priceImpact: string;
  route: string;
}

export interface SwapValidation {
  isValid: boolean;
  error?: string;
}

export interface SwapParams {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  slippage: number;
  fee: number;
}

/**
 * Get a quote for a Uniswap V3 swap
 */
export async function getUniswapV3Quote(
  provider: ethers.Provider,
  params: UniswapV3QuoteParams
): Promise<UniswapV3Quote> {
  try {
    const { tokenIn, tokenOut, fee, amountIn, decimalsIn, decimalsOut } =
      params;

    const quoterContract = new ethers.Contract(
      QUOTER_V2_ADDRESS,
      QUOTER_V2_ABI,
      provider
    );
    const amountInWei = ethers.parseUnits(amountIn, decimalsIn);

    const quoteParams = {
      tokenIn,
      tokenOut,
      amountIn: amountInWei,
      fee,
      sqrtPriceLimitX96: 0,
    };

    const result =
      await quoterContract.quoteExactInputSingle.staticCall(quoteParams);
    const amountOut = result[0];

    const amountOutFormatted = ethers.formatUnits(amountOut, decimalsOut);

    // Calculate price impact (simplified)
    const priceImpact = "0.1"; // Placeholder - would need more complex calculation

    return {
      amountOut: amountOut.toString(),
      amountOutFormatted,
      priceImpact,
      route: `${tokenIn} -> ${tokenOut} (${fee})`,
    };
  } catch (error) {
    throw new Error(`Failed to get Uniswap V3 quote: ${error}`);
  }
}

/**
 * Calculate minimum amount out with slippage protection
 */
export function calculateMinAmountOut(
  amountOut: string,
  slippagePercent: number,
  decimals: number
): bigint {
  const amountOutWei = ethers.parseUnits(amountOut, decimals);
  const slippageFactor = BigInt(Math.floor((100 - slippagePercent) * 100));
  const minAmountOut = (amountOutWei * slippageFactor) / BigInt(10000);

  return minAmountOut;
}

/**
 * Get recommended fee tier for a token pair
 */
export function getRecommendedFeeTier(
  tokenInSymbol: string,
  tokenOutSymbol: string
): number {
  // Define major tokens that typically use lower fees
  const majorTokens = ["WETH", "USDC", "USDT", "DAI", "WBTC"];
  const isTokenInMajor = majorTokens.includes(tokenInSymbol.toUpperCase());
  const isTokenOutMajor = majorTokens.includes(tokenOutSymbol.toUpperCase());

  // Stablecoin pairs
  const stablecoins = ["USDC", "USDT", "DAI"];
  const isTokenInStable = stablecoins.includes(tokenInSymbol.toUpperCase());
  const isTokenOutStable = stablecoins.includes(tokenOutSymbol.toUpperCase());

  if (isTokenInStable && isTokenOutStable) {
    return UNISWAP_V3_FEE_TIERS.LOWEST; // 0.01% for stablecoin pairs
  }

  if (isTokenInMajor && isTokenOutMajor) {
    return UNISWAP_V3_FEE_TIERS.LOW; // 0.05% for major token pairs
  }

  // Default to medium fee tier
  return UNISWAP_V3_FEE_TIERS.MEDIUM; // 0.3%
}

/**
 * Validate swap parameters
 */
export function validateSwapParams(params: SwapParams): SwapValidation {
  const { tokenIn, tokenOut, amountIn, slippage, fee } = params;

  if (!ethers.isAddress(tokenIn)) {
    return { isValid: false, error: "Invalid tokenIn address" };
  }

  if (!ethers.isAddress(tokenOut)) {
    return { isValid: false, error: "Invalid tokenOut address" };
  }

  if (tokenIn.toLowerCase() === tokenOut.toLowerCase()) {
    return { isValid: false, error: "Cannot swap same token" };
  }

  if (parseFloat(amountIn) <= 0) {
    return { isValid: false, error: "Amount must be greater than 0" };
  }

  if (slippage < 0 || slippage > 50) {
    return { isValid: false, error: "Slippage must be between 0 and 50%" };
  }

  const validFees = Object.values(UNISWAP_V3_FEE_TIERS);
  if (!validFees.includes(fee)) {
    return { isValid: false, error: "Invalid fee tier" };
  }

  return { isValid: true };
}

/**
 * Encode path for multi-hop swaps
 */
export function encodePath(tokens: string[], fees: number[]): string {
  if (tokens.length !== fees.length + 1) {
    throw new Error("Invalid path: tokens length must be fees length + 1");
  }

  let path = tokens[0];

  for (let i = 0; i < fees.length; i++) {
    const fee = fees[i].toString(16).padStart(6, "0");
    path += fee + tokens[i + 1].slice(2);
  }

  return path;
}

export { UNISWAP_V3_FEE_TIERS };
