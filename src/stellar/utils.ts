/**
 * Stellar 유틸리티 함수
 */

import { Asset } from 'stellar-sdk';
import { stellarClient } from './client';
import { log } from '@/utils/logger';
import type { StellarBalance, TokenInfo } from '@/types';

/**
 * 알려진 토큰 정보 (테스트넷)
 */
export const KNOWN_TOKENS: Record<string, TokenInfo> = {
  XLM: {
    symbol: 'XLM',
    name: 'Stellar Lumens',
    decimals: 7,
    assetCode: 'XLM',
  },
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 7,
    assetCode: 'USDC',
    assetIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN', // 테스트넷 USDC
  },
  // 추가 토큰들은 실제 구현시 추가
};

/**
 * 토큰 심볼을 Asset 객체로 변환
 */
export function symbolToAsset(symbol: string): Asset {
  const tokenInfo = KNOWN_TOKENS[symbol.toUpperCase()];
  
  if (!tokenInfo) {
    throw new Error(`Unknown token symbol: ${symbol}`);
  }

  if (symbol.toUpperCase() === 'XLM') {
    return Asset.native();
  }

  if (!tokenInfo.assetIssuer) {
    throw new Error(`Asset issuer not found for token: ${symbol}`);
  }

  return new Asset(tokenInfo.assetCode, tokenInfo.assetIssuer);
}

/**
 * Asset 객체를 토큰 심볼로 변환
 */
export function assetToSymbol(asset: Asset): string {
  if (asset.isNative()) {
    return 'XLM';
  }

  // 알려진 토큰에서 검색
  for (const [symbol, tokenInfo] of Object.entries(KNOWN_TOKENS)) {
    if (
      tokenInfo.assetCode === asset.getCode() &&
      tokenInfo.assetIssuer === asset.getIssuer()
    ) {
      return symbol;
    }
  }

  // 알려지지 않은 토큰의 경우 assetCode 반환
  return asset.getCode();
}

/**
 * 토큰 정보 조회
 */
export function getTokenInfo(symbol: string): TokenInfo | null {
  return KNOWN_TOKENS[symbol.toUpperCase()] || null;
}

/**
 * 잔액을 사람이 읽기 쉬운 형태로 포맷
 */
export function formatBalance(balance: string, decimals: number = 7): string {
  const num = parseFloat(balance);
  if (num === 0) return '0';
  
  // 매우 작은 수의 경우 과학적 표기법 방지
  if (num < 0.0000001) {
    return num.toFixed(decimals);
  }
  
  // 일반적인 경우
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

/**
 * 잔액 문자열을 숫자로 변환 (검증 포함)
 */
export function parseBalance(balance: string): number {
  const num = parseFloat(balance);
  
  if (isNaN(num) || num < 0) {
    throw new Error(`Invalid balance: ${balance}`);
  }
  
  return num;
}

/**
 * 두 잔액을 비교 (a >= b)
 */
export function compareBalances(a: string, b: string): boolean {
  return parseBalance(a) >= parseBalance(b);
}

/**
 * 잔액에서 수량을 차감
 */
export function subtractBalance(balance: string, amount: string): string {
  const balanceNum = parseBalance(balance);
  const amountNum = parseBalance(amount);
  
  const result = balanceNum - amountNum;
  
  if (result < 0) {
    throw new Error('Insufficient balance for operation');
  }
  
  return result.toString();
}

/**
 * 계정이 특정 토큰을 보유하고 있는지 확인
 */
export async function hasTokenBalance(
  publicKey: string,
  symbol: string,
  minAmount: string = '0'
): Promise<boolean> {
  try {
    const balance = await stellarClient.getTokenBalance(
      publicKey,
      symbol === 'XLM' ? undefined : symbol,
      symbol === 'XLM' ? undefined : KNOWN_TOKENS[symbol]?.assetIssuer
    );

    return compareBalances(balance, minAmount);
  } catch (error) {
    log.error('Failed to check token balance', error as Error, {
      publicKey,
      symbol,
      minAmount,
    });
    return false;
  }
}

/**
 * 계정이 토큰에 대한 트러스트라인을 가지고 있는지 확인
 */
export async function hasTrustline(
  publicKey: string,
  symbol: string
): Promise<boolean> {
  try {
    if (symbol.toUpperCase() === 'XLM') {
      return true; // XLM은 네이티브 토큰이므로 항상 true
    }

    const balances = await stellarClient.getBalances(publicKey);
    const tokenInfo = KNOWN_TOKENS[symbol.toUpperCase()];
    
    if (!tokenInfo) {
      return false;
    }

    return balances.some(
      balance =>
        balance.assetCode === tokenInfo.assetCode &&
        balance.assetIssuer === tokenInfo.assetIssuer
    );
  } catch (error) {
    log.error('Failed to check trustline', error as Error, {
      publicKey,
      symbol,
    });
    return false;
  }
}

/**
 * 계정의 특정 토큰 잔액을 StellarBalance 형태로 조회
 */
export async function getTokenBalanceInfo(
  publicKey: string,
  symbol: string
): Promise<StellarBalance | null> {
  try {
    const balances = await stellarClient.getBalances(publicKey);
    
    if (symbol.toUpperCase() === 'XLM') {
      return balances.find(b => b.assetType === 'native') || null;
    }

    const tokenInfo = KNOWN_TOKENS[symbol.toUpperCase()];
    if (!tokenInfo) {
      return null;
    }

    return (
      balances.find(
        balance =>
          balance.assetCode === tokenInfo.assetCode &&
          balance.assetIssuer === tokenInfo.assetIssuer
      ) || null
    );
  } catch (error) {
    log.error('Failed to get token balance info', error as Error, {
      publicKey,
      symbol,
    });
    return null;
  }
}

/**
 * 주소를 단축 형태로 표시
 */
export function shortenAddress(address: string, length: number = 8): string {
  if (address.length <= length * 2) {
    return address;
  }
  
  return `${address.slice(0, length)}...${address.slice(-length)}`;
}

/**
 * Stellar 주소 유효성 검증
 */
export function isValidStellarAddress(address: string): boolean {
  return stellarClient.validatePublicKey(address);
}

/**
 * 최소 XLM 잔액 계산 (기본 리저브 + 트러스트라인 리저브)
 */
export function calculateMinimumBalance(trustlines: number = 0): number {
  const BASE_RESERVE = 0.5; // XLM
  const TRUSTLINE_RESERVE = 0.5; // XLM per trustline
  
  return BASE_RESERVE + (trustlines * TRUSTLINE_RESERVE);
}

/**
 * 사용 가능한 XLM 잔액 계산 (최소 잔액 제외)
 */
export function calculateAvailableXLM(
  balance: string,
  trustlines: number = 0
): string {
  const totalBalance = parseBalance(balance);
  const minimumBalance = calculateMinimumBalance(trustlines);
  const available = Math.max(0, totalBalance - minimumBalance);
  
  return available.toString();
}

/**
 * 토큰 쌍을 문자열로 변환
 */
export function formatTokenPair(fromToken: string, toToken: string): string {
  return `${fromToken.toUpperCase()}/${toToken.toUpperCase()}`;
}

/**
 * 토큰 쌍 문자열을 파싱
 */
export function parseTokenPair(pair: string): { fromToken: string; toToken: string } {
  const [fromToken, toToken] = pair.split('/');
  
  if (!fromToken || !toToken) {
    throw new Error(`Invalid token pair format: ${pair}`);
  }
  
  return {
    fromToken: fromToken.toUpperCase(),
    toToken: toToken.toUpperCase(),
  };
}

/**
 * 지원되는 토큰 목록 반환
 */
export function getSupportedTokens(): string[] {
  return Object.keys(KNOWN_TOKENS);
}

/**
 * 토큰이 지원되는지 확인
 */
export function isSupportedToken(symbol: string): boolean {
  return symbol.toUpperCase() in KNOWN_TOKENS;
}

/**
 * 트랜잭션 해시를 Stellar Explorer URL로 변환
 */
export function getExplorerUrl(txHash: string, network: 'testnet' | 'mainnet' = 'testnet'): string {
  const baseUrl = network === 'testnet' 
    ? 'https://stellar.expert/explorer/testnet'
    : 'https://stellar.expert/explorer/public';
  
  return `${baseUrl}/tx/${txHash}`;
}