/**
 * 토큰 스왑 서비스
 */

import { Keypair } from 'stellar-sdk';
import { stellarClient } from '@/stellar/client';
import { soroswapClient, SoroswapAPIError } from '@/soroswap/client';
import { walletService } from './wallet-service';
import { 
  StellarInsufficientBalanceError,
  StellarTransactionFailedError 
} from '@/stellar/errors';
import {
  hasTokenBalance,
  hasTrustline,
  compareBalances,
  isSupportedToken
} from '@/stellar/utils';
import { log } from '@/utils/logger';
import { securityConfig, stellarConfig } from '@/utils/config';
import type { 
  SwapRequest, 
  SwapEstimate, 
  SwapResult
} from '@/types';

/**
 * 스왑 검증 결과
 */
interface SwapValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * 스왑 서비스 클래스
 */
export class SwapService {
  /**
   * 스왑 견적 조회
   */
  async estimateSwap(request: SwapRequest): Promise<SwapEstimate> {
    try {
      log.info('Estimating swap', {
        fromToken: request.fromToken,
        toToken: request.toToken,
        amount: request.amount,
        slippage: request.slippage,
      });

      // 기본 검증
      await this.validateSwapRequest(request);

      // Soroswap API에서 견적 조회
      const quote = await soroswapClient.getQuote(
        request.fromToken,
        request.toToken,
        request.amount.toString(),
        request.slippage
      );

      // 내부 형식으로 변환
      const estimate: SwapEstimate = {
        fromToken: quote.fromToken,
        toToken: quote.toToken,
        fromAmount: parseFloat(quote.fromAmount),
        toAmount: parseFloat(quote.toAmount),
        minimumReceived: parseFloat(quote.minimumReceived),
        priceImpact: quote.priceImpact,
        fee: parseFloat(quote.fee),
        path: quote.path,
      };

      log.info('Swap estimate completed', {
        fromToken: estimate.fromToken,
        toToken: estimate.toToken,
        expectedOutput: estimate.toAmount,
        priceImpact: estimate.priceImpact,
      });

      return estimate;
    } catch (error) {
      log.error('Failed to estimate swap', error as Error, { request });
      
      if (error instanceof SoroswapAPIError) {
        throw new Error(`Swap estimation failed: ${error.message}`);
      }
      
      throw error;
    }
  }

  /**
   * 토큰 스왑 실행
   */
  async executeSwap(request: SwapRequest): Promise<SwapResult> {
    const startTime = Date.now();
    
    try {
      log.info('Starting token swap execution', {
        fromToken: request.fromToken,
        toToken: request.toToken,
        amount: request.amount,
        slippage: request.slippage,
      });

      // 스왑 요청 검증
      const validation = await this.validateSwapRequest(request);
      if (!validation.isValid) {
        throw new Error(`Swap validation failed: ${validation.errors.join(', ')}`);
      }

      // 사용할 계정 결정
      const accountSecret = request.accountSecret || stellarConfig.defaultAccountSecret;
      if (!accountSecret) {
        throw new Error('No account secret provided for swap execution');
      }

      const keypair = Keypair.fromSecret(accountSecret);
      const publicKey = keypair.publicKey();

      // 사전 검증: 잔액 및 트러스트라인 확인
      await this.validateAccountForSwap(publicKey, request);

      // 스왑 견적 조회
      const estimate = await this.estimateSwap(request);

      // 실제 스왑 실행
      const result = await this.performSwap(
        keypair,
        request,
        estimate
      );

      const duration = Date.now() - startTime;
      
      log.info('Token swap completed successfully', {
        ...result,
        duration: `${duration}ms`,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      log.error('Token swap execution failed', error as Error, {
        request,
        duration: `${duration}ms`,
      });

      // 실패 결과 반환
      return {
        success: false,
        fromToken: request.fromToken,
        toToken: request.toToken,
        fromAmount: request.amount,
        toAmount: 0,
        fee: 0,
        timestamp: new Date().toISOString(),
        error: (error as Error).message,
      };
    }
  }

  /**
   * 최적 스왑 경로 조회
   */
  async getBestSwapRoute(
    fromToken: string,
    toToken: string,
    amount: number
  ): Promise<{
    path: string[];
    expectedOutput: number;
    priceImpact: number;
    estimatedFee: number;
  }> {
    try {
      log.debug('Finding best swap route', { fromToken, toToken, amount });

      const route = await soroswapClient.getBestRoute(
        fromToken,
        toToken,
        amount.toString()
      );

      return {
        path: route.path,
        expectedOutput: parseFloat(route.expectedOutput),
        priceImpact: route.priceImpact,
        estimatedFee: parseFloat(route.fee),
      };
    } catch (error) {
      log.error('Failed to find best swap route', error as Error, {
        fromToken,
        toToken,
        amount,
      });
      throw error;
    }
  }

  /**
   * 스왑 가능성 확인
   */
  async canSwap(
    publicKey: string,
    fromToken: string,
    toToken: string,
    amount: number
  ): Promise<{
    canSwap: boolean;
    reason?: string;
    missingTrustlines?: string[];
    insufficientBalance?: boolean;
  }> {
    try {
      // 지원되는 토큰인지 확인
      if (!isSupportedToken(fromToken) || !isSupportedToken(toToken)) {
        return {
          canSwap: false,
          reason: 'Unsupported token pair',
        };
      }

      // 트러스트라인 확인
      const missingTrustlines: string[] = [];
      
      if (!(await hasTrustline(publicKey, fromToken))) {
        missingTrustlines.push(fromToken);
      }
      
      if (!(await hasTrustline(publicKey, toToken))) {
        missingTrustlines.push(toToken);
      }

      if (missingTrustlines.length > 0) {
        return {
          canSwap: false,
          reason: 'Missing trustlines',
          missingTrustlines,
        };
      }

      // 잔액 확인
      const hasBalance = await hasTokenBalance(
        publicKey,
        fromToken,
        amount.toString()
      );

      if (!hasBalance) {
        return {
          canSwap: false,
          reason: 'Insufficient balance',
          insufficientBalance: true,
        };
      }

      return { canSwap: true };
    } catch (error) {
      log.error('Failed to check swap possibility', error as Error, {
        publicKey,
        fromToken,
        toToken,
        amount,
      });
      
      return {
        canSwap: false,
        reason: `Error checking swap possibility: ${(error as Error).message}`,
      };
    }
  }

  /**
   * 스왑 요청 검증
   */
  private async validateSwapRequest(request: SwapRequest): Promise<SwapValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 기본 필드 검증
    if (!request.fromToken || !request.toToken) {
      errors.push('From token and to token are required');
    }

    if (request.fromToken === request.toToken) {
      errors.push('Cannot swap the same token');
    }

    if (!request.amount || request.amount <= 0) {
      errors.push('Amount must be greater than 0');
    }

    if (request.slippage < 0.1 || request.slippage > securityConfig.maxSlippage) {
      errors.push(`Slippage must be between 0.1% and ${securityConfig.maxSlippage}%`);
    }

    // 수량 범위 검증
    if (request.amount < securityConfig.minAmount) {
      errors.push(`Amount must be at least ${securityConfig.minAmount}`);
    }

    if (request.amount > securityConfig.maxAmount) {
      errors.push(`Amount exceeds maximum limit of ${securityConfig.maxAmount}`);
    }

    // 지원되는 토큰 검증
    if (!isSupportedToken(request.fromToken)) {
      errors.push(`Unsupported from token: ${request.fromToken}`);
    }

    if (!isSupportedToken(request.toToken)) {
      errors.push(`Unsupported to token: ${request.toToken}`);
    }

    // 슬리피지 경고
    if (request.slippage > 5) {
      warnings.push(`High slippage tolerance: ${request.slippage}%`);
    }

    // 대량 거래 경고
    if (request.amount > securityConfig.maxAmount * 0.5) {
      warnings.push('Large transaction amount detected');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 계정의 스왑 가능성 검증
   */
  private async validateAccountForSwap(
    publicKey: string,
    request: SwapRequest
  ): Promise<void> {
    try {
      // 계정 존재 확인
      const accountExists = await stellarClient.accountExists(publicKey);
      if (!accountExists) {
        throw new Error(`Account does not exist: ${publicKey}`);
      }

      // 트러스트라인 확인
      const fromTrustline = await hasTrustline(publicKey, request.fromToken);
      if (!fromTrustline && request.fromToken !== 'XLM') {
        throw new Error(`Missing trustline for ${request.fromToken}`);
      }

      const toTrustline = await hasTrustline(publicKey, request.toToken);
      if (!toTrustline && request.toToken !== 'XLM') {
        throw new Error(`Missing trustline for ${request.toToken}`);
      }

      // 잔액 확인
      const balance = await walletService.getTokenBalance(publicKey, request.fromToken);
      if (!compareBalances(balance, request.amount.toString())) {
        throw new StellarInsufficientBalanceError(
          request.fromToken,
          request.amount.toString(),
          balance,
          publicKey
        );
      }

      log.debug('Account validation completed', { publicKey });
    } catch (error) {
      log.error('Account validation failed', error as Error, { publicKey });
      throw error;
    }
  }

  /**
   * 실제 스왑 실행
   */
  private async performSwap(
    keypair: Keypair,
    request: SwapRequest,
    estimate: SwapEstimate
  ): Promise<SwapResult> {
    try {
      const publicKey = keypair.publicKey();
      
      log.info('Performing swap transaction', {
        account: publicKey,
        fromToken: request.fromToken,
        toToken: request.toToken,
        amount: request.amount,
      });

      // 현재는 Stellar DEX를 통한 직접 스왑으로 단순화
      // 실제 Soroswap 스마트 컨트랙트 연동은 추후 구현
      const result = await this.executeDirectSwap(keypair, request, estimate);

      return result;
    } catch (error) {
      log.error('Swap execution failed', error as Error);
      throw new StellarTransactionFailedError(
        `Swap execution failed: ${(error as Error).message}`
      );
    }
  }

  /**
   * 직접 스왑 실행 (Stellar DEX 사용)
   */
  private async executeDirectSwap(
    _keypair: Keypair,
    request: SwapRequest,
    estimate: SwapEstimate
  ): Promise<SwapResult> {
    try {
      // publicKey는 현재 사용하지 않음
      // const publicKey = keypair.publicKey();
      
      // 트랜잭션 빌더 생성 (현재는 사용하지 않음)
      // const txBuilder = await stellarClient.createTransactionBuilder(publicKey);
      
      // 자산 객체 생성 (현재는 사용하지 않음)
      // const fromAsset = symbolToAsset(request.fromToken);
      // const toAsset = symbolToAsset(request.toToken);

      // Path Payment Strict Send 오퍼레이션 추가
      // (실제 구현에서는 Soroswap 스마트 컨트랙트 호출로 대체)
      // const pathPaymentOp = {
      //   sendAsset: fromAsset,
      //   sendAmount: request.amount.toString(),
      //   destination: publicKey, // 자기 자신에게 전송
      //   destAsset: toAsset,
      //   destMin: estimate.minimumReceived.toString(),
      //   path: [], // 단순화를 위해 직접 경로 사용
      // };

      // TODO: 실제 Soroswap 스마트 컨트랙트 호출로 대체
      // 현재는 시뮬레이션된 결과 반환
      
      const mockTxHash = `mock_tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      log.info('Mock swap transaction completed', {
        txHash: mockTxHash,
        fromToken: request.fromToken,
        toToken: request.toToken,
        fromAmount: request.amount,
        toAmount: estimate.toAmount,
      });

      return {
        success: true,
        transactionHash: mockTxHash,
        fromToken: request.fromToken,
        toToken: request.toToken,
        fromAmount: request.amount,
        toAmount: estimate.toAmount,
        actualReceived: estimate.toAmount,
        fee: estimate.fee,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      log.error('Direct swap execution failed', error as Error);
      throw error;
    }
  }

  /**
   * 스왑 히스토리 조회
   */
  async getSwapHistory(
    publicKey: string,
    _limit: number = 10
  ): Promise<SwapResult[]> {
    try {
      // 현재는 트랜잭션 히스토리에서 스왩 관련 거래 필터링
      // transactions는 현재 사용하지 않음
      // const transactions = await stellarClient.getTransactionHistory(publicKey, limit * 2);
      
      // TODO: 실제 스왑 거래만 필터링하는 로직 구현
      // 현재는 빈 배열 반환
      return [];
    } catch (error) {
      log.error('Failed to get swap history', error as Error, { publicKey });
      return [];
    }
  }

  /**
   * 스왑 서비스 상태 체크
   */
  async healthCheck(): Promise<{
    stellarConnection: boolean;
    soroswapConnection: boolean;
    defaultAccountStatus: string;
    supportedTokens: string[];
  }> {
    try {
      const stellarConnection = await stellarClient.testConnection();
      const soroswapConnection = await soroswapClient.testConnection();
      
      let defaultAccountStatus = 'not_configured';
      if (stellarConfig.defaultAccountPublic) {
        try {
          const exists = await stellarClient.accountExists(stellarConfig.defaultAccountPublic);
          defaultAccountStatus = exists ? 'active' : 'not_found';
        } catch {
          defaultAccountStatus = 'error';
        }
      }

      return {
        stellarConnection,
        soroswapConnection,
        defaultAccountStatus,
        supportedTokens: ['XLM', 'USDC'], // 현재 지원되는 토큰
      };
    } catch (error) {
      log.error('Swap service health check failed', error as Error);
      throw error;
    }
  }
}

/**
 * 싱글톤 스왑 서비스 인스턴스
 */
export const swapService = new SwapService();