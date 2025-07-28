/**
 * 환경 설정 및 검증 유틸리티
 */

import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';
import type {
  ServerConfig,
  StellarConfig,
  SoroswapConfig,
  SecurityConfig,
  RateLimitConfig,
} from '@/types';

// 환경 변수 로드
dotenvConfig();

/**
 * 환경 변수 검증 스키마
 */
const EnvSchema = z.object({
  // 서버 설정
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).pipe(z.number().min(1000).max(65535)).default('3000'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  // Stellar 설정
  STELLAR_NETWORK: z.enum(['testnet', 'mainnet']).default('testnet'),
  STELLAR_HORIZON_URL: z.string().url(),
  DEFAULT_ACCOUNT_SECRET: z.string().optional(),
  DEFAULT_ACCOUNT_PUBLIC: z.string().optional(),

  // Soroswap 설정
  SOROSWAP_API_URL: z.string().url(),
  SOROSWAP_API_KEY: z.string().optional(),

  // 보안 설정
  MAX_SLIPPAGE: z.string().transform(Number).pipe(z.number().min(0.1).max(50)).default('5.0'),
  MIN_AMOUNT: z.string().transform(Number).pipe(z.number().min(0)).default('0.1'),
  MAX_AMOUNT: z.string().transform(Number).pipe(z.number().min(1)).default('10000'),
  JWT_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().min(32),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).pipe(z.number().min(1000)).default('60000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).pipe(z.number().min(1)).default('100'),

  // 선택적 설정
  REDIS_URL: z.string().optional(),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.string().transform(Number).pipe(z.number().min(0).max(15)).optional(),
});

/**
 * 환경 변수 검증 및 파싱
 */
function validateEnv(): z.infer<typeof EnvSchema> {
  try {
    return EnvSchema.parse(process.env);
  } catch (error) {
    console.error('❌ 환경 변수 검증 실패:', error);
    process.exit(1);
  }
}

// 검증된 환경 변수
const env = validateEnv();

/**
 * 서버 설정
 */
export const serverConfig: ServerConfig = {
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
  logLevel: env.LOG_LEVEL,
};

/**
 * Stellar 설정
 */
export const stellarConfig: StellarConfig = {
  network: env.STELLAR_NETWORK,
  horizonUrl: env.STELLAR_HORIZON_URL,
  defaultAccountSecret: env.DEFAULT_ACCOUNT_SECRET,
  defaultAccountPublic: env.DEFAULT_ACCOUNT_PUBLIC,
};

/**
 * Soroswap 설정
 */
export const soroswapConfig: SoroswapConfig = {
  apiUrl: env.SOROSWAP_API_URL,
  apiKey: env.SOROSWAP_API_KEY,
};

/**
 * 보안 설정
 */
export const securityConfig: SecurityConfig = {
  maxSlippage: env.MAX_SLIPPAGE,
  minAmount: env.MIN_AMOUNT,
  maxAmount: env.MAX_AMOUNT,
  jwtSecret: env.JWT_SECRET,
  encryptionKey: env.ENCRYPTION_KEY,
};

/**
 * Rate Limiting 설정
 */
export const rateLimitConfig: RateLimitConfig = {
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
};

/**
 * Redis 설정
 */
export const redisConfig = {
  url: env.REDIS_URL || 'redis://localhost:6379',
  password: env.REDIS_PASSWORD,
  db: env.REDIS_DB || 0,
};

/**
 * 개발 모드 여부 확인
 */
export const isDevelopment = env.NODE_ENV === 'development';

/**
 * 프로덕션 모드 여부 확인
 */
export const isProduction = env.NODE_ENV === 'production';

/**
 * 테스트 모드 여부 확인
 */
export const isTest = env.NODE_ENV === 'test';

/**
 * 테스트넷 여부 확인
 */
export const isTestnet = env.STELLAR_NETWORK === 'testnet';

/**
 * 메인넷 여부 확인
 */
export const isMainnet = env.STELLAR_NETWORK === 'mainnet';

/**
 * 설정 검증
 */
export function validateConfig(): void {
  const errors: string[] = [];

  // Stellar 계정 설정 검증
  if (!stellarConfig.defaultAccountSecret && !stellarConfig.defaultAccountPublic) {
    errors.push('Stellar 계정 정보가 설정되지 않았습니다.');
  }

  // 프로덕션 환경 보안 검증
  if (isProduction) {
    if (securityConfig.jwtSecret.length < 64) {
      errors.push('프로덕션 환경에서는 JWT 시크릿이 64자 이상이어야 합니다.');
    }

    if (securityConfig.encryptionKey.length < 64) {
      errors.push('프로덕션 환경에서는 암호화 키가 64자 이상이어야 합니다.');
    }

    if (isMainnet && stellarConfig.defaultAccountSecret) {
      console.warn('⚠️  메인넷에서 하드코딩된 계정 시크릿 사용은 권장되지 않습니다.');
    }
  }

  if (errors.length > 0) {
    console.error('❌ 설정 검증 오류:');
    errors.forEach(error => console.error(`  - ${error}`));
    process.exit(1);
  }

  console.log('✅ 설정 검증 완료');
}

/**
 * 설정 정보 출력 (보안 정보 제외)
 */
export function printConfig(): void {
  console.log('📋 서버 설정:');
  console.log(`  - 환경: ${serverConfig.nodeEnv}`);
  console.log(`  - 포트: ${serverConfig.port}`);
  console.log(`  - 로그 레벨: ${serverConfig.logLevel}`);
  console.log(`  - Stellar 네트워크: ${stellarConfig.network}`);
  console.log(`  - Horizon URL: ${stellarConfig.horizonUrl}`);
  console.log(`  - Soroswap API: ${soroswapConfig.apiUrl}`);
  console.log(`  - 최대 슬리피지: ${securityConfig.maxSlippage}%`);
  console.log(`  - 거래 한도: ${securityConfig.minAmount} ~ ${securityConfig.maxAmount}`);
  console.log(`  - Rate Limit: ${rateLimitConfig.maxRequests}req/${rateLimitConfig.windowMs}ms`);
}