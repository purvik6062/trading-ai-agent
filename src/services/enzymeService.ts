import { ethers } from "ethers";
import { config } from "../config";
import { logger } from "../utils/logger";
// @ts-ignore - SDK types may not be available
import { Portfolio } from "@enzymefinance/sdk";
import {
  ENZYME_ARBITRUM_ADDRESSES,
  VAULT_PROXY_ABI,
  COMPTROLLER_ABI,
  ERC20_ABI as ENZYME_ERC20_ABI,
  TOKEN_DECIMALS,
  UNISWAP_V3_ACTIONS,
  getTokenAddress,
} from "../config/enzymeContracts";
import {
  getUniswapV3Quote,
  calculateMinAmountOut,
  getRecommendedFeeTier,
  validateSwapParams,
  encodePath,
  UNISWAP_V3_FEE_TIERS,
} from "../utils/uniswapV3Utils";

// Enzyme Protocol ABI snippets (you would need the full ABIs)
const VAULT_ABI = [
  "function buyShares(uint256 _investmentAmount, uint256 _minSharesQuantity) external returns (uint256 sharesReceived_)",
  "function redeemSharesInKind(address _recipient, uint256 _sharesQuantity, address[] memory _payoutAssets, uint256[] memory _payoutAssetPercentages) external returns (address[] memory payoutAssets_, uint256[] memory payoutAmounts_)",
  "function getSharesSupply() external view returns (uint256)",
  "function getGrossAssetValue() external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function denominationAsset() external view returns (address)",
];

const ERC20_ABI = [
  "function balanceOf(address owner) external view returns (uint256)",
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)",
  "function name() external view returns (string)",
];

export interface VaultData {
  address: string;
  name: string;
  symbol: string;
  totalSupply: string;
  sharePrice: string;
  denominationAsset: {
    address: string;
    symbol: string;
    decimals: number;
  };
  comptroller: string;
}

export interface UserPosition {
  shares: string;
  sharesBalance: string;
  assetValue: string;
  percentage: string;
}

export interface TokenBalance {
  balance: string;
  allowance: string;
  decimals: number;
  symbol: string;
  balanceWei: string;
  allowanceWei: string;
}

export interface SwapQuote {
  amountOut: string;
  amountOutFormatted: string;
  priceImpact: string;
  route: string;
  tokenIn: { address: string; symbol: string; decimals: number };
  tokenOut: { address: string; symbol: string; decimals: number };
  feeTier: number;
}

export interface SwapParams {
  pathAddresses: string[];
  pathFees: number[];
  outgoingAssetAmount: string;
  minIncomingAssetAmount: string;
  outgoingAssetDecimals: number;
  incomingAssetDecimals?: number;
}

export interface SwapStrategy {
  fromTokenSymbol: string;
  toTokenSymbol: string | any;
  amountPercentage: number;
  maxSlippage?: number;
  useCustomFeeTier?: boolean;
  customFeeTier?: number;
}

export interface TransactionResult {
  hash: string;
  blockNumber: number;
  gasUsed: string;
}

export class EnzymeVaultService {
  private provider: ethers.Provider;
  private signer: ethers.Signer;
  private integrationManagerAddress: string;
  private uniswapV3AdapterAddress: string;
  private userVaultAddress: string;

  constructor(
    provider: ethers.Provider,
    signer: ethers.Signer,
    userVaultAddress?: string
  ) {
    this.provider = provider;
    this.signer = signer;
    this.userVaultAddress = userVaultAddress || config.enzyme.vaultAddress;

    this.integrationManagerAddress =
      ENZYME_ARBITRUM_ADDRESSES.IntegrationManager;
    this.uniswapV3AdapterAddress = ENZYME_ARBITRUM_ADDRESSES.UniswapV3Adapter;
  }

  /**
   * Get vault data including shares, balance, and denomination asset
   */
  async getVaultData(vaultAddress: string): Promise<VaultData> {
    try {
      const vaultContract = new ethers.Contract(
        vaultAddress,
        VAULT_PROXY_ABI,
        this.provider
      );

      // Fetch basic vault info
      const [name, symbol, totalSupply, comptrollerAddress] = await Promise.all(
        [
          vaultContract.name(),
          vaultContract.symbol(),
          vaultContract.totalSupply(),
          vaultContract.getAccessor(),
        ]
      );

      // Create comptroller contract and get share price and denomination asset
      const comptrollerContract = new ethers.Contract(
        comptrollerAddress,
        COMPTROLLER_ABI,
        this.provider
      );
      const [grossShareValue, denominationAssetAddress] = await Promise.all([
        comptrollerContract.calcGrossShareValue(),
        comptrollerContract.getDenominationAsset(),
      ]);

      // Get denomination asset info
      const denominationAssetContract = new ethers.Contract(
        denominationAssetAddress,
        ENZYME_ERC20_ABI,
        this.provider
      );
      const [denominationAssetSymbol, denominationAssetDecimals] =
        await Promise.all([
          denominationAssetContract.symbol(),
          denominationAssetContract.decimals(),
        ]);

      const vaultData: VaultData = {
        address: vaultAddress,
        name,
        symbol,
        totalSupply: ethers.formatUnits(totalSupply, 18),
        sharePrice: ethers.formatUnits(
          grossShareValue,
          denominationAssetDecimals
        ),
        denominationAsset: {
          address: denominationAssetAddress,
          symbol: denominationAssetSymbol,
          decimals: denominationAssetDecimals,
        },
        comptroller: comptrollerAddress,
      };

      return vaultData;
    } catch (error: any) {
      logger.error("Error fetching vault data:", error);
      throw new Error(`Failed to fetch vault data: ${error.message}`);
    }
  }

  /**
   * Get user position in the vault
   */
  async getUserPosition(
    vaultAddress: string,
    userAddress: string
  ): Promise<UserPosition> {
    try {
      const vaultContract = new ethers.Contract(
        vaultAddress,
        VAULT_PROXY_ABI,
        this.provider
      );
      const comptrollerAddress = await vaultContract.getAccessor();
      const comptrollerContract = new ethers.Contract(
        comptrollerAddress,
        COMPTROLLER_ABI,
        this.provider
      );

      const [
        userShares,
        totalSupply,
        grossShareValue,
        denominationAssetAddress,
      ] = await Promise.all([
        vaultContract.balanceOf(userAddress),
        vaultContract.totalSupply(),
        comptrollerContract.calcGrossShareValue(),
        comptrollerContract.getDenominationAsset(),
      ]);

      const denominationAssetContract = new ethers.Contract(
        denominationAssetAddress,
        ENZYME_ERC20_ABI,
        this.provider
      );
      const denominationAssetDecimals =
        await denominationAssetContract.decimals();

      const assetValue = this.calculateAssetValue(
        userShares,
        grossShareValue,
        denominationAssetDecimals
      );
      const percentage = this.calculateOwnershipPercentage(
        userShares,
        totalSupply
      );

      return {
        shares: ethers.formatUnits(userShares, 18),
        sharesBalance: userShares.toString(),
        assetValue,
        percentage,
      };
    } catch (error: any) {
      logger.error("Error fetching user position:", error);
      throw new Error(`Failed to fetch user position: ${error.message}`);
    }
  }

  /**
   * Get token balance and allowance for a user
   */
  async getTokenBalance(
    tokenAddress: string,
    userAddress: string,
    spenderAddress: string
  ): Promise<TokenBalance> {
    try {
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ENZYME_ERC20_ABI,
        this.provider
      );
      const [balance, allowance, symbol, decimals] = await Promise.all([
        tokenContract.balanceOf(userAddress),
        tokenContract.allowance(userAddress, spenderAddress),
        tokenContract.symbol(),
        tokenContract.decimals(),
      ]);

      return {
        balance: ethers.formatUnits(balance, decimals),
        allowance: ethers.formatUnits(allowance, decimals),
        decimals,
        symbol,
        balanceWei: balance.toString(),
        allowanceWei: allowance.toString(),
      };
    } catch (error: any) {
      logger.error("Error fetching token balance:", error);
      throw new Error(`Failed to fetch token balance: ${error.message}`);
    }
  }

  /**
   * Get a quote for a Uniswap V3 swap
   */
  async getSwapQuote(
    tokenInAddress: string,
    tokenOutAddress: string,
    amountIn: string,
    feeOverride: number | null = null
  ): Promise<SwapQuote> {
    try {
      // Get token info
      const [tokenInContract, tokenOutContract] = await Promise.all([
        new ethers.Contract(tokenInAddress, ENZYME_ERC20_ABI, this.provider),
        new ethers.Contract(tokenOutAddress, ENZYME_ERC20_ABI, this.provider),
      ]);

      const [tokenInSymbol, tokenInDecimals, tokenOutSymbol, tokenOutDecimals] =
        await Promise.all([
          tokenInContract.symbol(),
          tokenInContract.decimals(),
          tokenOutContract.symbol(),
          tokenOutContract.decimals(),
        ]);

      // Determine fee tier
      const feeTier =
        feeOverride || getRecommendedFeeTier(tokenInSymbol, tokenOutSymbol);

      // Validate swap parameters
      const validation = validateSwapParams({
        tokenIn: tokenInAddress,
        tokenOut: tokenOutAddress,
        amountIn,
        slippage: 1.0, // Default 1% slippage for validation
        fee: feeTier,
      });

      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      // Get quote
      const quote = await getUniswapV3Quote(this.provider, {
        tokenIn: tokenInAddress,
        tokenOut: tokenOutAddress,
        fee: feeTier,
        amountIn,
        decimalsIn: tokenInDecimals,
        decimalsOut: tokenOutDecimals,
      });

      return {
        ...quote,
        tokenIn: {
          address: tokenInAddress,
          symbol: tokenInSymbol,
          decimals: tokenInDecimals,
        },
        tokenOut: {
          address: tokenOutAddress,
          symbol: tokenOutSymbol,
          decimals: tokenOutDecimals,
        },
        feeTier,
      };
    } catch (error: any) {
      logger.error("Error getting swap quote:", error);
      throw new Error(`Failed to get swap quote: ${error.message}`);
    }
  }

  /**
   * Execute a Uniswap V3 swap through the vault using the Enzyme SDK
   */
  async executeSwap(
    comptrollerAddress: string,
    swapParams: SwapParams
  ): Promise<TransactionResult> {
    try {
      const {
        pathAddresses,
        pathFees,
        outgoingAssetAmount,
        minIncomingAssetAmount,
        outgoingAssetDecimals,
        incomingAssetDecimals = 18,
      } = swapParams;

      // Convert amounts to wei
      const outgoingAmountWei = ethers.parseUnits(
        outgoingAssetAmount,
        outgoingAssetDecimals
      );
      const minIncomingAmountWei = ethers.parseUnits(
        minIncomingAssetAmount,
        incomingAssetDecimals
      );

      // Format addresses
      const formattedPathAddresses = pathAddresses.map((addr) =>
        addr.toLowerCase()
      );

      // Create takeOrder parameters using the Enzyme SDK
      const takeOrderParams: any = {
        comptrollerProxy: comptrollerAddress,
        integrationManager: this.integrationManagerAddress,
        integrationAdapter: this.uniswapV3AdapterAddress,
        callArgs: {
          pathAddresses: formattedPathAddresses,
          pathFees,
          outgoingAssetAmount: outgoingAmountWei,
          minIncomingAssetAmount: minIncomingAmountWei,
        },
      };

      // Create the transaction object using the SDK
      const swapTransaction =
        Portfolio.Integrations.UniswapV3.takeOrder(takeOrderParams);

      // Create transaction request
      let txRequest: any = {
        to: comptrollerAddress,
        data: "",
        value: 0,
        gasLimit: ethers.parseUnits("1000000", "wei"),
      };

      // Handle different SDK response formats
      if ("params" in swapTransaction) {
        const params: any = swapTransaction.params;
        if (params.address) {
          txRequest.to = params.address;
          if (params.data) {
            txRequest.data = params.data;
          } else if (
            params.functionName === "callOnExtension" &&
            params.args &&
            params.abi
          ) {
            const contract = new ethers.Contract(params.address, params.abi);
            txRequest.data = contract.interface.encodeFunctionData(
              "callOnExtension",
              params.args
            );
          }
        }
      } else if ("to" in swapTransaction && "data" in swapTransaction) {
        txRequest = swapTransaction;
      }

      // Fallback to manual encoding if needed
      if (!txRequest.data) {
        const uniswapIntegrationData = ethers.AbiCoder.defaultAbiCoder().encode(
          ["address[]", "uint24[]", "uint256", "uint256"],
          [
            formattedPathAddresses,
            pathFees,
            outgoingAmountWei,
            minIncomingAmountWei,
          ]
        );

        const callArgs = ethers.AbiCoder.defaultAbiCoder().encode(
          ["address", "bytes"],
          [this.uniswapV3AdapterAddress, uniswapIntegrationData]
        );

        const comptrollerContract = new ethers.Contract(
          comptrollerAddress,
          COMPTROLLER_ABI,
          this.signer
        );
        txRequest.data = comptrollerContract.interface.encodeFunctionData(
          "callOnExtension",
          [this.integrationManagerAddress, 0, callArgs]
        );
      }

      // Send the transaction
      const tx = await this.signer.sendTransaction(txRequest);
      logger.info(`Swap transaction sent: ${tx.hash}`);

      const receipt = await tx.wait();
      logger.info(`Swap confirmed in block: ${receipt?.blockNumber}`);

      return {
        hash: tx.hash,
        blockNumber: receipt?.blockNumber || 0,
        gasUsed: receipt?.gasUsed?.toString() || "0",
      };
    } catch (error: any) {
      logger.error("Error executing swap:", error);
      throw new Error(`Failed to execute swap: ${error.message}`);
    }
  }

  /**
   * Execute an automated swap based on strategy signals
   */
  async executeAutomatedSwap(
    vaultAddress: string,
    swapStrategy: SwapStrategy
  ): Promise<TransactionResult & { swapDetails: any }> {
    try {
      const {
        fromTokenSymbol,
        toTokenSymbol,
        amountPercentage,
        maxSlippage = 1.0,
        useCustomFeeTier = false,
        customFeeTier = UNISWAP_V3_FEE_TIERS.MEDIUM,
      } = swapStrategy;

      // Get vault data
      const vaultData = await this.getVaultData(vaultAddress);
      const comptrollerAddress = vaultData.comptroller;

      // Get token addresses
      const fromTokenAddress = getTokenAddress(fromTokenSymbol);
      const toTokenAddress = getTokenAddress(toTokenSymbol);

      // Get vault's balance of the from token
      const fromTokenBalance = await this.getTokenBalance(
        fromTokenAddress,
        vaultAddress,
        comptrollerAddress
      );

      // Calculate swap amount based on percentage with proper decimal precision
      const swapAmount = this.calculateSwapAmountWithPrecision(
        fromTokenBalance.balance,
        amountPercentage,
        fromTokenBalance.decimals
      );

      if (parseFloat(swapAmount) <= 0) {
        throw new Error(`Insufficient balance of ${fromTokenSymbol} in vault`);
      }

      // Get quote
      const quote = await this.getSwapQuote(
        fromTokenAddress,
        toTokenAddress,
        swapAmount,
        useCustomFeeTier ? customFeeTier : null
      );

      // Calculate minimum amount with slippage
      const minAmountOut = calculateMinAmountOut(
        quote.amountOutFormatted,
        maxSlippage,
        quote.tokenOut.decimals
      );

      // Execute the swap
      const swapParams: SwapParams = {
        pathAddresses: [fromTokenAddress, toTokenAddress],
        pathFees: [quote.feeTier],
        outgoingAssetAmount: swapAmount,
        minIncomingAssetAmount: ethers.formatUnits(
          minAmountOut,
          quote.tokenOut.decimals
        ),
        outgoingAssetDecimals: quote.tokenIn.decimals,
        incomingAssetDecimals: quote.tokenOut.decimals,
      };

      const result = await this.executeSwap(comptrollerAddress, swapParams);

      logger.info(
        `Automated swap executed successfully: ${fromTokenSymbol} to ${toTokenSymbol}`,
        {
          vaultAddress,
          swapAmount,
          expectedOutput: quote.amountOutFormatted,
          minimumOutput: ethers.formatUnits(
            minAmountOut,
            quote.tokenOut.decimals
          ),
          transactionHash: result.hash,
        }
      );

      return {
        ...result,
        swapDetails: {
          fromToken: quote.tokenIn,
          toToken: quote.tokenOut,
          swapAmount,
          expectedOutput: quote.amountOutFormatted,
          minimumOutput: ethers.formatUnits(
            minAmountOut,
            quote.tokenOut.decimals
          ),
          priceImpact: quote.priceImpact,
          feeTier: quote.feeTier,
        },
      };
    } catch (error: any) {
      logger.error("Error executing automated swap:", error);
      throw new Error(`Failed to execute automated swap: ${error.message}`);
    }
  }

  /**
   * Calculate swap amount with proper decimal precision for the token
   */
  private calculateSwapAmountWithPrecision(
    balance: string,
    percentage: number,
    decimals: number
  ): string {
    const rawAmount = (parseFloat(balance) * percentage) / 100;

    // Round to the token's decimal precision to avoid "too many decimals" errors
    const maxDecimals =
      typeof decimals === "bigint" ? Number(decimals) : decimals;
    const validDecimals = Math.max(0, Math.min(maxDecimals, 18));

    return rawAmount.toFixed(validDecimals);
  }

  /**
   * Calculate asset value from shares and share price
   */
  private calculateAssetValue(
    shares: bigint,
    sharePrice: bigint,
    decimals: number
  ): string {
    try {
      const decimalsNumber =
        typeof decimals === "bigint" ? Number(decimals) : decimals;
      const sharesBigInt = typeof shares === "bigint" ? shares : BigInt(shares);
      const sharePriceBigInt =
        typeof sharePrice === "bigint" ? sharePrice : BigInt(sharePrice);
      const oneEthWei = ethers.parseUnits("1", 18);

      const assetValueWei = (sharesBigInt * sharePriceBigInt) / oneEthWei;
      return ethers.formatUnits(assetValueWei, decimalsNumber);
    } catch (error) {
      return "0";
    }
  }

  /**
   * Calculate ownership percentage
   */
  private calculateOwnershipPercentage(
    userShares: bigint,
    totalSupply: bigint
  ): string {
    if (totalSupply === 0n) return "0";
    const percentage = (userShares * BigInt(10000)) / totalSupply;
    return (Number(percentage) / 100).toFixed(2);
  }

  /**
   * Get current gas price
   */
  async getGasPrice(): Promise<bigint> {
    try {
      const feeData = await this.provider.getFeeData();
      return feeData.gasPrice || BigInt(0);
    } catch (error) {
      logger.error("Error getting gas price:", error);
      throw error;
    }
  }

  /**
   * Check if vault is active and accessible
   */
  async isVaultActive(vaultAddress: string): Promise<boolean> {
    try {
      const vaultContract = new ethers.Contract(
        vaultAddress,
        VAULT_PROXY_ABI,
        this.provider
      );
      const totalSupply = await vaultContract.totalSupply();
      return totalSupply > 0;
    } catch (error) {
      logger.error("Error checking vault status:", error);
      return false;
    }
  }

  /**
   * Get wallet address
   */
  async getWalletAddress(): Promise<string> {
    return await this.signer.getAddress();
  }

  /**
   * Get vault address (returns user-specific vault address)
   */
  getVaultAddress(): string {
    return this.userVaultAddress;
  }

  /**
   * Set vault address (for updating user-specific vault)
   */
  setVaultAddress(vaultAddress: string): void {
    this.userVaultAddress = vaultAddress;
  }
}
