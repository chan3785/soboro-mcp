/**
 * Soroswap API 클라이언트
 */

import axios, { AxiosInstance } from 'axios';
import { log } from '@/utils/logger';
import { soroswapConfig } from '@/utils/config';

/**
 * Soroswap API 응답 타입들
 */
export interface SoroswapTokenInfo {
  symbol: string;
  name: string;
  decimals: number;
  contract: string;
  icon?: string;
}

export interface SoroswapPair {
  id: string;
  token0: SoroswapTokenInfo;
  token1: SoroswapTokenInfo;
  reserve0: string;
  reserve1: string;
  totalSupply: string;
  fee: number;
}

export interface SoroswapPrice {
  symbol: string;
  price: number;
  priceUsd: number;
  change24h: number;
  volume24h: number;
  marketCap?: number;
  lastUpdated: string;
}

export interface SoroswapQuote {
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  minimumReceived: string;
  priceImpact: number;
  fee: string;
  path: string[];
  estimatedGas: string;
}

/**
 * Soroswap API 에러
 */
export class SoroswapAPIError extends Error {
  constructor(
    message: string,
    public status?: number,
    public data?: any
  ) {
    super(message);
    this.name = 'SoroswapAPIError';
  }
}

/**
 * Soroswap API 클라이언트 클래스
 */
export class SoroswapClient {
  private client: AxiosInstance;
  private baseURL: string;

  constructor() {
    this.baseURL = soroswapConfig.apiUrl;
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000, // 30초
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'soroswap-mcp-server/1.0.0',
      },
    });

    // API 키가 있는 경우 헤더에 추가
    if (soroswapConfig.apiKey) {
      this.client.defaults.headers.common['Authorization'] = `Bearer ${soroswapConfig.apiKey}`;
    }

    // 요청 인터셉터
    this.client.interceptors.request.use(
      (config) => {
        log.debug('Soroswap API request', {
          method: config.method?.toUpperCase(),
          url: config.url,
          params: config.params,
        });
        return config;
      },
      (error) => {
        log.error('Soroswap API request error', error);
        return Promise.reject(error);
      }
    );

    // 응답 인터셉터
    this.client.interceptors.response.use(
      (response) => {
        log.debug('Soroswap API response', {
          status: response.status,
          url: response.config.url,
          dataSize: JSON.stringify(response.data).length,
        });
        return response;
      },
      (error) => {
        const message = error.response?.data?.message || error.message;
        const status = error.response?.status;
        
        log.error('Soroswap API error', error, {
          status,
          message,
          url: error.config?.url,
        });

        throw new SoroswapAPIError(message, status, error.response?.data);
      }
    );

    log.info('Soroswap client initialized', { baseURL: this.baseURL });
  }

  /**
   * API 연결 테스트
   */
  async testConnection(): Promise<boolean> {
    try {
      log.debug('Testing Soroswap API connection...');
      
      const response = await this.client.get('/health');
      
      if (response.status === 200) {
        log.info('Soroswap API connection successful');
        return true;
      }
      
      return false;
    } catch (error) {
      log.error('Soroswap API connection failed', error as Error);
      return false;
    }
  }

  /**
   * 지원되는 토큰 목록 조회
   */
  async getTokens(): Promise<SoroswapTokenInfo[]> {
    try {
      const response = await this.client.get<SoroswapTokenInfo[]>('/tokens');
      return response.data;
    } catch (error) {
      log.error('Failed to fetch tokens', error as Error);
      throw this.convertError(error);
    }
  }

  /**
   * 토큰 정보 조회
   */
  async getTokenInfo(symbol: string): Promise<SoroswapTokenInfo | null> {
    try {
      const response = await this.client.get<SoroswapTokenInfo>(`/tokens/${symbol}`);
      return response.data;
    } catch (error) {
      if ((error as any).status === 404) {
        return null;
      }
      log.error('Failed to fetch token info', error as Error, { symbol });
      throw this.convertError(error);
    }
  }

  /**
   * 토큰 가격 조회
   */
  async getTokenPrice(symbol: string): Promise<SoroswapPrice | null> {
    try {
      const response = await this.client.get<SoroswapPrice>(`/prices/${symbol}`);
      return response.data;
    } catch (error) {
      if ((error as any).status === 404) {
        return null;
      }
      log.error('Failed to fetch token price', error as Error, { symbol });
      throw this.convertError(error);
    }
  }

  /**
   * 모든 토큰 가격 조회
   */
  async getAllPrices(): Promise<SoroswapPrice[]> {
    try {
      const response = await this.client.get<SoroswapPrice[]>('/prices');
      return response.data;
    } catch (error) {
      log.error('Failed to fetch all prices', error as Error);
      throw this.convertError(error);
    }
  }

  /**
   * 유동성 풀 목록 조회
   */
  async getPools(): Promise<SoroswapPair[]> {
    try {
      const response = await this.client.get<SoroswapPair[]>('/pools');
      return response.data;
    } catch (error) {
      log.error('Failed to fetch pools', error as Error);
      throw this.convertError(error);
    }
  }

  /**
   * 특정 토큰 쌍의 풀 조회
   */
  async getPool(token0: string, token1: string): Promise<SoroswapPair | null> {
    try {
      const response = await this.client.get<SoroswapPair>(`/pools/${token0}/${token1}`);
      return response.data;
    } catch (error) {
      if ((error as any).status === 404) {
        return null;
      }
      log.error('Failed to fetch pool', error as Error, { token0, token1 });
      throw this.convertError(error);
    }
  }

  /**
   * 스왑 견적 조회
   */
  async getQuote(
    fromToken: string,
    toToken: string,
    amount: string,
    slippage?: number
  ): Promise<SoroswapQuote> {
    try {
      const params: any = {
        fromToken,
        toToken,
        amount,
      };

      if (slippage !== undefined) {
        params.slippage = slippage;
      }

      const response = await this.client.get<SoroswapQuote>('/quote', { params });
      return response.data;
    } catch (error) {
      log.error('Failed to get quote', error as Error, {
        fromToken,
        toToken,
        amount,
        slippage,
      });
      throw this.convertError(error);
    }
  }

  /**
   * 최적 경로 조회
   */
  async getBestRoute(
    fromToken: string,
    toToken: string,
    amount: string
  ): Promise<{
    path: string[];
    expectedOutput: string;
    priceImpact: number;
    fee: string;
  }> {
    try {
      const response = await this.client.get('/route', {
        params: {
          fromToken,
          toToken,
          amount,
        },
      });
      
      return response.data;
    } catch (error) {
      log.error('Failed to get best route', error as Error, {
        fromToken,
        toToken,
        amount,
      });
      throw this.convertError(error);
    }
  }

  /**
   * 스왑 실행을 위한 트랜잭션 데이터 생성
   */
  async buildSwapTransaction(
    fromToken: string,
    toToken: string,
    amount: string,
    slippage: number,
    userAddress: string
  ): Promise<{
    to: string;
    data: string;
    value: string;
    gasLimit: string;
  }> {
    try {
      const response = await this.client.post('/swap/build', {
        fromToken,
        toToken,
        amount,
        slippage,
        userAddress,
      });
      
      return response.data;
    } catch (error) {
      log.error('Failed to build swap transaction', error as Error, {
        fromToken,
        toToken,
        amount,
        slippage,
        userAddress,
      });
      throw this.convertError(error);
    }
  }

  /**
   * 토큰 쌍의 24시간 통계 조회
   */
  async getPairStats(token0: string, token1: string): Promise<{
    volume24h: string;
    volumeChange24h: number;
    liquidity: string;
    liquidityChange24h: number;
    fees24h: string;
    transactions24h: number;
  }> {
    try {
      const response = await this.client.get(`/stats/${token0}/${token1}`);
      return response.data;
    } catch (error) {
      log.error('Failed to get pair stats', error as Error, { token0, token1 });
      throw this.convertError(error);
    }
  }

  /**
   * 사용자의 유동성 포지션 조회
   */
  async getUserPositions(userAddress: string): Promise<{
    poolId: string;
    token0: string;
    token1: string;
    liquidity: string;
    uncollectedFees0: string;
    uncollectedFees1: string;
  }[]> {
    try {
      const response = await this.client.get(`/positions/${userAddress}`);
      return response.data;
    } catch (error) {
      log.error('Failed to get user positions', error as Error, { userAddress });
      throw this.convertError(error);
    }
  }

  /**
   * API 상태 조회
   */
  async getStatus(): Promise<{
    status: string;
    version: string;
    uptime: number;
    totalPools: number;
    totalVolume24h: string;
    totalTVL: string;
  }> {
    try {
      const response = await this.client.get('/status');
      return response.data;
    } catch (error) {
      log.error('Failed to get API status', error as Error);
      throw this.convertError(error);
    }
  }

  /**
   * 에러 변환 헬퍼
   */
  private convertError(error: any): SoroswapAPIError {
    if (error instanceof SoroswapAPIError) {
      return error;
    }

    const message = error.response?.data?.message || error.message || 'Unknown Soroswap API error';
    const status = error.response?.status;
    const data = error.response?.data;

    return new SoroswapAPIError(message, status, data);
  }

  /**
   * 클라이언트 설정 조회
   */
  getConfig(): { baseURL: string; hasApiKey: boolean } {
    return {
      baseURL: this.baseURL,
      hasApiKey: !!soroswapConfig.apiKey,
    };
  }
}

/**
 * 싱글톤 Soroswap 클라이언트 인스턴스
 */
export const soroswapClient = new SoroswapClient();