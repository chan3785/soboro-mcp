/**
 * 지갑 관리 서비스
 */

import { stellarClient } from '@/stellar/client';
import { 
  convertStellarError,
  StellarAccountNotFoundError,
  InvalidKeypairError 
} from '@/stellar/errors';
import {
  isValidStellarAddress,
  hasTokenBalance,
  hasTrustline,
  getTokenBalanceInfo,
  shortenAddress,
  calculateAvailableXLM,
  getSupportedTokens
} from '@/stellar/utils';
import { log } from '@/utils/logger';
import { stellarConfig } from '@/utils/config';
import type { 
  StellarBalance, 
  StellarTransaction
} from '@/types';

/**
 * 지갑 정보 인터페이스
 */
export interface WalletInfo {
  publicKey: string;
  accountId: string;
  isConnected: boolean;
  balances: StellarBalance[];
  availableXLM: string;
  trustlineCount: number;
}

/**
 * 지갑 서비스 클래스
 */
export class WalletService {
  private connectedWallets: Map<string, WalletInfo> = new Map();

  /**
   * 지갑 연결 (공개키 기반)
   */
  async connectWallet(publicKey: string): Promise<WalletInfo> {
    try {
      log.info('Connecting wallet', { publicKey: shortenAddress(publicKey) });

      // 공개키 유효성 검증
      if (!isValidStellarAddress(publicKey)) {
        throw new InvalidKeypairError(`Invalid Stellar public key: ${publicKey}`);
      }

      // 계정 존재 여부 확인
      const accountExists = await stellarClient.accountExists(publicKey);
      if (!accountExists) {
        throw new StellarAccountNotFoundError(publicKey);
      }

      // 계정 정보 조회
      const account = await stellarClient.getAccount(publicKey);
      
      // 지갑 정보 생성
      const walletInfo: WalletInfo = {
        publicKey: account.publicKey,
        accountId: account.accountId,
        isConnected: true,
        balances: account.balances,
        availableXLM: this.calculateAvailableXLMBalance(account.balances),
        trustlineCount: account.balances.filter(b => b.assetType !== 'native').length,
      };

      // 연결된 지갑 목록에 추가
      this.connectedWallets.set(publicKey, walletInfo);

      log.info('Wallet connected successfully', {
        publicKey: shortenAddress(publicKey),
        balanceCount: walletInfo.balances.length,
        trustlineCount: walletInfo.trustlineCount,
      });

      return walletInfo;
    } catch (error) {
      log.error('Failed to connect wallet', error as Error, { publicKey });
      throw convertStellarError(error);
    }
  }

  /**
   * 지갑 연결 해제
   */
  disconnectWallet(publicKey: string): void {
    if (this.connectedWallets.has(publicKey)) {
      this.connectedWallets.delete(publicKey);
      log.info('Wallet disconnected', { publicKey: shortenAddress(publicKey) });
    }
  }

  /**
   * 지갑 연결 상태 확인
   */
  isWalletConnected(publicKey: string): boolean {
    return this.connectedWallets.has(publicKey);
  }

  /**
   * 연결된 지갑 정보 조회
   */
  getWalletInfo(publicKey: string): WalletInfo | null {
    return this.connectedWallets.get(publicKey) || null;
  }

  /**
   * 지갑 정보 새로고침
   */
  async refreshWallet(publicKey: string): Promise<WalletInfo> {
    try {
      log.debug('Refreshing wallet info', { publicKey: shortenAddress(publicKey) });

      const account = await stellarClient.getAccount(publicKey);
      
      const walletInfo: WalletInfo = {
        publicKey: account.publicKey,
        accountId: account.accountId,
        isConnected: true,
        balances: account.balances,
        availableXLM: this.calculateAvailableXLMBalance(account.balances),
        trustlineCount: account.balances.filter(b => b.assetType !== 'native').length,
      };

      // 캐시 업데이트
      this.connectedWallets.set(publicKey, walletInfo);

      return walletInfo;
    } catch (error) {
      log.error('Failed to refresh wallet', error as Error, { publicKey });
      throw convertStellarError(error);
    }
  }

  /**
   * 계정 잔액 조회
   */
  async getBalances(publicKey: string): Promise<StellarBalance[]> {
    try {
      log.debug('Fetching balances', { publicKey: shortenAddress(publicKey) });

      const balances = await stellarClient.getBalances(publicKey);
      
      log.debug('Balances retrieved', { 
        publicKey: shortenAddress(publicKey),
        count: balances.length 
      });

      return balances;
    } catch (error) {
      log.error('Failed to fetch balances', error as Error, { publicKey });
      throw convertStellarError(error);
    }
  }

  /**
   * 특정 토큰 잔액 조회
   */
  async getTokenBalance(publicKey: string, symbol: string): Promise<string> {
    try {
      const balanceInfo = await getTokenBalanceInfo(publicKey, symbol);
      return balanceInfo ? balanceInfo.balance : '0';
    } catch (error) {
      log.error('Failed to get token balance', error as Error, { 
        publicKey, 
        symbol 
      });
      throw convertStellarError(error);
    }
  }

  /**
   * 거래 히스토리 조회
   */
  async getTransactionHistory(
    publicKey: string, 
    limit: number = 10
  ): Promise<StellarTransaction[]> {
    try {
      log.debug('Fetching transaction history', { 
        publicKey: shortenAddress(publicKey),
        limit 
      });

      const history = await stellarClient.getTransactionHistory(publicKey, limit);
      
      log.debug('Transaction history retrieved', { 
        publicKey: shortenAddress(publicKey),
        count: history.length 
      });

      return history;
    } catch (error) {
      log.error('Failed to fetch transaction history', error as Error, { 
        publicKey,
        limit 
      });
      throw convertStellarError(error);
    }
  }

  /**
   * 토큰 보유 여부 확인
   */
  async hasToken(publicKey: string, symbol: string, minAmount: string = '0'): Promise<boolean> {
    try {
      return await hasTokenBalance(publicKey, symbol, minAmount);
    } catch (error) {
      log.error('Failed to check token ownership', error as Error, {
        publicKey,
        symbol,
        minAmount
      });
      return false;
    }
  }

  /**
   * 트러스트라인 존재 여부 확인
   */
  async hasTrustlineForToken(publicKey: string, symbol: string): Promise<boolean> {
    try {
      return await hasTrustline(publicKey, symbol);
    } catch (error) {
      log.error('Failed to check trustline', error as Error, {
        publicKey,
        symbol
      });
      return false;
    }
  }

  /**
   * 지갑 요약 정보 조회
   */
  async getWalletSummary(publicKey: string): Promise<{
    address: string;
    shortAddress: string;
    totalBalances: number;
    totalTrustlines: number;
    xlmBalance: string;
    availableXLM: string;
    supportedTokens: string[];
  }> {
    try {
      const balances = await this.getBalances(publicKey);
      const xlmBalance = balances.find(b => b.assetType === 'native')?.balance || '0';
      
      return {
        address: publicKey,
        shortAddress: shortenAddress(publicKey),
        totalBalances: balances.length,
        totalTrustlines: balances.filter(b => b.assetType !== 'native').length,
        xlmBalance,
        availableXLM: this.calculateAvailableXLMBalance(balances),
        supportedTokens: getSupportedTokens(),
      };
    } catch (error) {
      log.error('Failed to get wallet summary', error as Error, { publicKey });
      throw convertStellarError(error);
    }
  }

  /**
   * 기본 계정 정보 조회 (환경 변수 기반)
   */
  async getDefaultAccountInfo(): Promise<WalletInfo | null> {
    if (!stellarConfig.defaultAccountPublic) {
      log.warn('No default account configured');
      return null;
    }

    try {
      return await this.connectWallet(stellarConfig.defaultAccountPublic);
    } catch (error) {
      log.error('Failed to get default account info', error as Error);
      return null;
    }
  }

  /**
   * 새 키페어 생성
   */
  generateNewKeypair(): { publicKey: string; secretKey: string } {
    const keypair = stellarClient.generateKeypair();
    
    log.info('New keypair generated', { 
      publicKey: shortenAddress(keypair.publicKey) 
    });
    
    return keypair;
  }

  /**
   * 키페어 유효성 검증
   */
  validateKeypair(secretKey: string): boolean {
    return stellarClient.validateKeypair(secretKey);
  }

  /**
   * 연결된 모든 지갑 목록 조회
   */
  getConnectedWallets(): WalletInfo[] {
    return Array.from(this.connectedWallets.values());
  }

  /**
   * 모든 지갑 연결 해제
   */
  disconnectAllWallets(): void {
    this.connectedWallets.clear();
    log.info('All wallets disconnected');
  }

  /**
   * 사용 가능한 XLM 잔액 계산
   */
  private calculateAvailableXLMBalance(balances: StellarBalance[]): string {
    const xlmBalance = balances.find(b => b.assetType === 'native');
    if (!xlmBalance) return '0';

    const trustlineCount = balances.filter(b => b.assetType !== 'native').length;
    return calculateAvailableXLM(xlmBalance.balance, trustlineCount);
  }

  /**
   * 지갑 상태 체크
   */
  async healthCheck(): Promise<{
    connectedWallets: number;
    defaultAccountStatus: 'connected' | 'not_configured' | 'error';
    stellarNetworkStatus: boolean;
  }> {
    try {
      const networkStatus = await stellarClient.testConnection();
      
      let defaultAccountStatus: 'connected' | 'not_configured' | 'error' = 'not_configured';
      
      if (stellarConfig.defaultAccountPublic) {
        try {
          await stellarClient.accountExists(stellarConfig.defaultAccountPublic);
          defaultAccountStatus = 'connected';
        } catch {
          defaultAccountStatus = 'error';
        }
      }

      return {
        connectedWallets: this.connectedWallets.size,
        defaultAccountStatus,
        stellarNetworkStatus: networkStatus,
      };
    } catch (error) {
      log.error('Wallet service health check failed', error as Error);
      throw error;
    }
  }
}

/**
 * 싱글톤 지갑 서비스 인스턴스
 */
export const walletService = new WalletService();