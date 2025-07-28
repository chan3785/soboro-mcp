/**
 * Soroswap MCP Server 타입 정의
 */

// ============================================================================
// 기본 타입
// ============================================================================

export interface ServerConfig {
  port: number;
  nodeEnv: 'development' | 'production' | 'test';
  logLevel: 'error' | 'warn' | 'info' | 'debug';
}

export interface StellarConfig {
  network: 'testnet' | 'mainnet';
  horizonUrl: string;
  defaultAccountSecret?: string | undefined;
  defaultAccountPublic?: string | undefined;
}

export interface SoroswapConfig {
  apiUrl: string;
  apiKey?: string | undefined;
}

export interface SecurityConfig {
  maxSlippage: number;
  minAmount: number;
  maxAmount: number;
  jwtSecret: string;
  encryptionKey: string;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

// ============================================================================
// Stellar 관련 타입
// ============================================================================

export interface StellarAccount {
  publicKey: string;
  accountId: string;
  sequence: string;
  balances: StellarBalance[];
}

export interface StellarBalance {
  asset: string;
  assetType: 'native' | 'credit_alphanum4' | 'credit_alphanum12';
  assetCode?: string;
  assetIssuer?: string;
  balance: string;
  limit?: string;
  buyingLiabilities?: string;
  sellingLiabilities?: string;
}

export interface StellarTransaction {
  hash: string;
  ledger: number;
  createdAt: string;
  sourceAccount: string;
  feePaid: string;
  operationCount: number;
  successful: boolean;
}

// ============================================================================
// 토큰 스왑 관련 타입
// ============================================================================

export interface TokenInfo {
  symbol: string;
  name: string;
  decimals: number;
  assetCode: string;
  assetIssuer?: string;
  contractAddress?: string;
  logoUrl?: string;
}

export interface SwapRequest {
  fromToken: string;
  toToken: string;
  amount: number;
  slippage: number;
  accountSecret?: string;
}

export interface SwapEstimate {
  fromToken: string;
  toToken: string;
  fromAmount: number;
  toAmount: number;
  minimumReceived: number;
  priceImpact: number;
  fee: number;
  path: string[];
}

export interface SwapResult {
  success: boolean;
  transactionHash?: string;
  fromToken: string;
  toToken: string;
  fromAmount: number;
  toAmount: number;
  actualReceived?: number;
  fee: number;
  timestamp: string;
  error?: string;
}

// ============================================================================
// 가격 관련 타입
// ============================================================================

export interface TokenPrice {
  symbol: string;
  price: number;
  priceUsd: number;
  priceChange24h: number;
  priceChangePercentage24h: number;
  volume24h: number;
  marketCap?: number | undefined;
  lastUpdated: string;
}

export interface PriceRequest {
  tokenPair: string;
  includeChange?: boolean;
}

// ============================================================================
// 유동성 풀 관련 타입
// ============================================================================

export interface LiquidityPool {
  id: string;
  tokenA: TokenInfo;
  tokenB: TokenInfo;
  reserveA: number;
  reserveB: number;
  totalLiquidity: number;
  fee: number;
  apy?: number;
  volume24h?: number;
}

// ============================================================================
// MCP 관련 타입
// ============================================================================

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

export interface MCPResource {
  uri: string;
  name: string;
  description: string;
  mimeType?: string;
}

export interface MCPRequest<T = any> {
  method: string;
  params: T;
  id?: string | number;
}

export interface MCPResponse<T = any> {
  result?: T;
  error?: MCPError;
  id?: string | number;
}

export interface MCPError {
  code: number;
  message: string;
  data?: any;
}

// ============================================================================
// API 응답 타입
// ============================================================================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
}

export interface PaginatedResponse<T = any> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// ============================================================================
// 로깅 관련 타입
// ============================================================================

export interface LogContext {
  userId?: string;
  sessionId?: string;
  requestId?: string;
  operation?: string;
  metadata?: Record<string, any>;
}

export interface LogEntry {
  level: 'error' | 'warn' | 'info' | 'debug';
  message: string;
  timestamp: string;
  context?: LogContext;
  error?: Error;
}

// ============================================================================
// 에러 관련 타입
// ============================================================================

export interface ErrorInfo {
  code: string;
  message: string;
  details?: Record<string, any>;
  stack?: string;
  timestamp: string;
}

export enum ErrorCode {
  // 일반 에러
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  RATE_LIMITED = 'RATE_LIMITED',

  // Stellar 관련 에러
  STELLAR_CONNECTION_ERROR = 'STELLAR_CONNECTION_ERROR',
  STELLAR_ACCOUNT_NOT_FOUND = 'STELLAR_ACCOUNT_NOT_FOUND',
  STELLAR_INSUFFICIENT_BALANCE = 'STELLAR_INSUFFICIENT_BALANCE',
  STELLAR_TRANSACTION_FAILED = 'STELLAR_TRANSACTION_FAILED',

  // Soroswap 관련 에러
  SOROSWAP_API_ERROR = 'SOROSWAP_API_ERROR',
  SOROSWAP_INSUFFICIENT_LIQUIDITY = 'SOROSWAP_INSUFFICIENT_LIQUIDITY',
  SOROSWAP_SLIPPAGE_EXCEEDED = 'SOROSWAP_SLIPPAGE_EXCEEDED',

  // 스왑 관련 에러
  SWAP_VALIDATION_ERROR = 'SWAP_VALIDATION_ERROR',
  SWAP_EXECUTION_ERROR = 'SWAP_EXECUTION_ERROR',
  SWAP_TIMEOUT = 'SWAP_TIMEOUT',

  // 보안 관련 에러
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  KEY_MANAGEMENT_ERROR = 'KEY_MANAGEMENT_ERROR',
  SECURITY_VIOLATION = 'SECURITY_VIOLATION',
}

// ============================================================================
// 유틸리티 타입
// ============================================================================

export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;
export type PartialFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

// 환경 변수 타입
export interface EnvironmentVariables {
  NODE_ENV: string;
  PORT: string;
  LOG_LEVEL: string;
  STELLAR_NETWORK: string;
  STELLAR_HORIZON_URL: string;
  SOROSWAP_API_URL: string;
  SOROSWAP_API_KEY?: string;
  DEFAULT_ACCOUNT_SECRET?: string;
  DEFAULT_ACCOUNT_PUBLIC?: string;
  MAX_SLIPPAGE: string;
  MIN_AMOUNT: string;
  MAX_AMOUNT: string;
  REDIS_URL?: string;
  JWT_SECRET: string;
  ENCRYPTION_KEY: string;
  RATE_LIMIT_WINDOW_MS: string;
  RATE_LIMIT_MAX_REQUESTS: string;
}