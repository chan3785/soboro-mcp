/**
 * 가격 조회 서비스
 */

import { soroswapClient, SoroswapPrice, SoroswapAPIError } from '@/soroswap/client';
import { log } from '@/utils/logger';
import { parseTokenPair, formatTokenPair, isSupportedToken } from '@/stellar/utils';
import type { TokenPrice, PriceRequest } from '@/types';

/**
 * 가격 캐시 엔트리
 */
interface PriceCacheEntry {
  price: TokenPrice;
  timestamp: number;
  expiresAt: number;
}

/**
 * 가격 서비스 클래스
 */
export class PriceService {
  private priceCache: Map<string, PriceCacheEntry> = new Map();
  private readonly CACHE_TTL = 60 * 1000; // 1분 캐시
  private readonly MAX_CACHE_SIZE = 1000;

  /**
   * 토큰 쌍 가격 조회 (캐싱 지원)
   */
  async getTokenPairPrice(request: PriceRequest): Promise<TokenPrice> {
    try {
      const { fromToken, toToken } = parseTokenPair(request.tokenPair);
      
      log.debug('Getting token pair price', { 
        fromToken, 
        toToken,
        includeChange: request.includeChange 
      });

      // 지원되는 토큰인지 확인
      if (!isSupportedToken(fromToken) || !isSupportedToken(toToken)) {
        throw new Error(`Unsupported token pair: ${request.tokenPair}`);
      }

      // 캐시에서 조회
      const cacheKey = `${fromToken}-${toToken}`;
      const cached = this.getCachedPrice(cacheKey);
      
      if (cached) {
        log.debug('Price found in cache', { tokenPair: request.tokenPair });
        return cached;
      }

      // Soroswap API에서 가격 조회
      const price = await this.fetchPriceFromAPI(fromToken, toToken, request.includeChange);
      
      // 캐시에 저장
      this.setCachedPrice(cacheKey, price);
      
      log.info('Token pair price retrieved', { 
        tokenPair: request.tokenPair,
        price: price.price,
        priceUsd: price.priceUsd 
      });

      return price;
    } catch (error) {
      log.error('Failed to get token pair price', error as Error, { 
        tokenPair: request.tokenPair 
      });
      throw error;
    }
  }

  /**
   * 단일 토큰 가격 조회
   */
  async getTokenPrice(symbol: string, includeChange: boolean = true): Promise<TokenPrice | null> {
    try {
      log.debug('Getting token price', { symbol, includeChange });

      if (!isSupportedToken(symbol)) {
        log.warn('Unsupported token requested', { symbol });
        return null;
      }

      // 캐시에서 조회
      const cacheKey = `single-${symbol}`;
      const cached = this.getCachedPrice(cacheKey);
      
      if (cached) {
        log.debug('Token price found in cache', { symbol });
        return cached;
      }

      // Soroswap API에서 조회
      const soroswapPrice = await soroswapClient.getTokenPrice(symbol);
      
      if (!soroswapPrice) {
        log.warn('Token price not found', { symbol });
        return null;
      }

      // 내부 형식으로 변환
      const price = this.convertSoroswapPrice(soroswapPrice);
      
      // 캐시에 저장
      this.setCachedPrice(cacheKey, price);
      
      log.info('Token price retrieved', { 
        symbol,
        price: price.price,
        priceUsd: price.priceUsd 
      });

      return price;
    } catch (error) {
      log.error('Failed to get token price', error as Error, { symbol });
      
      if (error instanceof SoroswapAPIError) {
        return null; // API 에러의 경우 null 반환
      }
      
      throw error;
    }
  }

  /**
   * 모든 지원 토큰의 가격 조회
   */
  async getAllPrices(): Promise<TokenPrice[]> {
    try {
      log.debug('Getting all token prices');

      // Soroswap API에서 모든 가격 조회
      const soroswapPrices = await soroswapClient.getAllPrices();
      
      // 내부 형식으로 변환
      const prices = soroswapPrices.map(sp => this.convertSoroswapPrice(sp));
      
      // 각 가격을 캐시에 저장
      prices.forEach(price => {
        const cacheKey = `single-${price.symbol}`;
        this.setCachedPrice(cacheKey, price);
      });

      log.info('All token prices retrieved', { count: prices.length });
      
      return prices;
    } catch (error) {
      log.error('Failed to get all prices', error as Error);
      throw error;
    }
  }

  /**
   * 가격 변동률 조회
   */
  async getPriceChange(symbol: string, period: '1h' | '24h' | '7d' = '24h'): Promise<{
    symbol: string;
    currentPrice: number;
    previousPrice: number;
    change: number;
    changePercent: number;
    period: string;
  } | null> {
    try {
      const price = await this.getTokenPrice(symbol, true);
      
      if (!price) {
        return null;
      }

      // 24시간 변동률만 지원 (현재 Soroswap API 기준)
      if (period !== '24h') {
        log.warn('Only 24h price change is currently supported', { symbol, period });
      }

      const previousPrice = price.priceUsd - price.priceChange24h;
      
      return {
        symbol: price.symbol,
        currentPrice: price.priceUsd,
        previousPrice,
        change: price.priceChange24h,
        changePercent: price.priceChangePercentage24h,
        period: '24h',
      };
    } catch (error) {
      log.error('Failed to get price change', error as Error, { symbol, period });
      return null;
    }
  }

  /**
   * 시장 요약 정보 조회
   */
  async getMarketSummary(): Promise<{
    totalMarketCap: number;
    totalVolume24h: number;
    totalTokens: number;
    topGainers: Array<{ symbol: string; changePercent: number }>;
    topLosers: Array<{ symbol: string; changePercent: number }>;
  }> {
    try {
      log.debug('Getting market summary');

      const allPrices = await this.getAllPrices();
      
      const totalMarketCap = allPrices.reduce((sum, price) => 
        sum + (price.marketCap || 0), 0
      );
      
      const totalVolume24h = allPrices.reduce((sum, price) => 
        sum + price.volume24h, 0
      );

      // 상위 5개 상승/하락 토큰
      const sortedByChange = allPrices
        .filter(p => p.priceChangePercentage24h !== undefined)
        .sort((a, b) => b.priceChangePercentage24h - a.priceChangePercentage24h);

      const topGainers = sortedByChange
        .slice(0, 5)
        .map(p => ({ 
          symbol: p.symbol, 
          changePercent: p.priceChangePercentage24h 
        }));

      const topLosers = sortedByChange
        .slice(-5)
        .reverse()
        .map(p => ({ 
          symbol: p.symbol, 
          changePercent: p.priceChangePercentage24h 
        }));

      const summary = {
        totalMarketCap,
        totalVolume24h,
        totalTokens: allPrices.length,
        topGainers,
        topLosers,
      };

      log.info('Market summary retrieved', summary);
      
      return summary;
    } catch (error) {
      log.error('Failed to get market summary', error as Error);
      throw error;
    }
  }

  /**
   * 가격 히스토리 조회 (단순 구현)
   */
  async getPriceHistory(
    symbol: string, 
    period: '1h' | '24h' | '7d' = '24h'
  ): Promise<Array<{ timestamp: number; price: number }>> {
    try {
      // 현재는 단순히 현재 가격만 반환 (실제 구현에서는 히스토리 API 필요)
      const currentPrice = await this.getTokenPrice(symbol);
      
      if (!currentPrice) {
        return [];
      }

      const now = Date.now();
      return [
        {
          timestamp: now,
          price: currentPrice.priceUsd,
        },
      ];
    } catch (error) {
      log.error('Failed to get price history', error as Error, { symbol, period });
      return [];
    }
  }

  /**
   * 캐시에서 가격 조회
   */
  private getCachedPrice(key: string): TokenPrice | null {
    const entry = this.priceCache.get(key);
    
    if (!entry) {
      return null;
    }

    // 만료 확인
    if (Date.now() > entry.expiresAt) {
      this.priceCache.delete(key);
      return null;
    }

    return entry.price;
  }

  /**
   * 캐시에 가격 저장
   */
  private setCachedPrice(key: string, price: TokenPrice): void {
    // 캐시 크기 제한
    if (this.priceCache.size >= this.MAX_CACHE_SIZE) {
      // 가장 오래된 항목 제거
      const firstKey = this.priceCache.keys().next().value;
      if (firstKey) {
        this.priceCache.delete(firstKey);
      }
    }

    const now = Date.now();
    const entry: PriceCacheEntry = {
      price,
      timestamp: now,
      expiresAt: now + this.CACHE_TTL,
    };

    this.priceCache.set(key, entry);
  }

  /**
   * Soroswap API에서 토큰 쌍 가격 조회
   */
  private async fetchPriceFromAPI(
    fromToken: string, 
    toToken: string, 
    _includeChange?: boolean
  ): Promise<TokenPrice> {
    // 기본 토큰(일반적으로 USDC)에 대한 가격 조회
    const baseToken = 'USDC';
    
    let fromPrice = 1; // USD 기준
    let toPrice = 1;   // USD 기준

    // fromToken이 기본 토큰이 아닌 경우 USD 가격 조회
    if (fromToken !== baseToken) {
      const fromTokenPrice = await soroswapClient.getTokenPrice(fromToken);
      if (fromTokenPrice) {
        fromPrice = fromTokenPrice.priceUsd;
      }
    }

    // toToken이 기본 토큰이 아닌 경우 USD 가격 조회
    if (toToken !== baseToken) {
      const toTokenPrice = await soroswapClient.getTokenPrice(toToken);
      if (toTokenPrice) {
        toPrice = toTokenPrice.priceUsd;
      }
    }

    // 상대 가격 계산
    const relativePrice = fromPrice / toPrice;

    return {
      symbol: formatTokenPair(fromToken, toToken),
      price: relativePrice,
      priceUsd: fromPrice, // fromToken의 USD 가격
      priceChange24h: 0, // TODO: 실제 변동량 계산
      priceChangePercentage24h: 0, // TODO: 실제 변동률 계산
      volume24h: 0, // TODO: 볼륨 정보 추가
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Soroswap 가격을 내부 형식으로 변환
   */
  private convertSoroswapPrice(soroswapPrice: SoroswapPrice): TokenPrice {
    return {
      symbol: soroswapPrice.symbol,
      price: soroswapPrice.price,
      priceUsd: soroswapPrice.priceUsd,
      priceChange24h: soroswapPrice.change24h,
      priceChangePercentage24h: (soroswapPrice.change24h / soroswapPrice.priceUsd) * 100,
      volume24h: soroswapPrice.volume24h,
      marketCap: soroswapPrice.marketCap,
      lastUpdated: soroswapPrice.lastUpdated,
    };
  }

  /**
   * 캐시 통계 조회
   */
  getCacheStats(): {
    size: number;
    maxSize: number;
    ttl: number;
    hitRate: number;
  } {
    return {
      size: this.priceCache.size,
      maxSize: this.MAX_CACHE_SIZE,
      ttl: this.CACHE_TTL,
      hitRate: 0, // TODO: 히트율 계산 구현
    };
  }

  /**
   * 캐시 초기화
   */
  clearCache(): void {
    this.priceCache.clear();
    log.info('Price cache cleared');
  }

  /**
   * 만료된 캐시 항목 정리
   */
  cleanupExpiredCache(): void {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, entry] of this.priceCache.entries()) {
      if (now > entry.expiresAt) {
        this.priceCache.delete(key);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      log.debug('Expired cache entries cleaned up', { removedCount });
    }
  }

  /**
   * 서비스 상태 체크
   */
  async healthCheck(): Promise<{
    soroswapApiStatus: boolean;
    cacheSize: number;
    lastPriceUpdate: string | null;
  }> {
    try {
      const apiStatus = await soroswapClient.testConnection();
      
      // 최근 캐시 업데이트 시간 확인
      let lastUpdate: string | null = null;
      if (this.priceCache.size > 0) {
        const timestamps = Array.from(this.priceCache.values())
          .map(entry => entry.timestamp);
        const latestTimestamp = Math.max(...timestamps);
        lastUpdate = new Date(latestTimestamp).toISOString();
      }

      return {
        soroswapApiStatus: apiStatus,
        cacheSize: this.priceCache.size,
        lastPriceUpdate: lastUpdate,
      };
    } catch (error) {
      log.error('Price service health check failed', error as Error);
      throw error;
    }
  }
}

/**
 * 싱글톤 가격 서비스 인스턴스
 */
export const priceService = new PriceService();