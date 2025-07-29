/**
 * Stellar 블록체인 클라이언트
 */

import {
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  Asset,
} from 'stellar-sdk';

import { log } from '@/utils/logger';
import { stellarConfig, isTestnet } from '@/utils/config';
import type {
  StellarAccount,
  StellarBalance,
  StellarTransaction,
} from '@/types';

/**
 * Stellar 클라이언트 클래스
 */
export class StellarClient {
  private server: Horizon.Server;
  private networkPassphrase: string;

  constructor() {
    // Horizon 서버 설정
    this.server = new Horizon.Server(stellarConfig.horizonUrl);
    
    // 네트워크 패스프레이즈 설정
    this.networkPassphrase = isTestnet 
      ? Networks.TESTNET 
      : Networks.PUBLIC;

    log.info('Stellar client initialized', {
      network: stellarConfig.network,
      horizonUrl: stellarConfig.horizonUrl,
    });
  }

  /**
   * 네트워크 연결 테스트
   */
  async testConnection(): Promise<boolean> {
    try {
      log.debug('Testing Stellar network connection...');
      
      const ledger = await this.server.ledgers().order('desc').limit(1).call();
      
      if (ledger.records && ledger.records.length > 0) {
        log.info('Stellar network connection successful', {
          latestLedger: ledger.records[0]?.sequence,
          network: stellarConfig.network,
        });
        return true;
      }
      
      throw new Error('No ledger records found');
    } catch (error) {
      log.error('Stellar network connection failed', error as Error);
      return false;
    }
  }

  /**
   * 계정 정보 조회
   */
  async getAccount(publicKey: string): Promise<StellarAccount> {
    try {
      log.debug('Fetching account info', { publicKey });
      
      const account = await this.server.loadAccount(publicKey);
      
      const stellarAccount: StellarAccount = {
        publicKey: account.accountId(),
        accountId: account.accountId(),
        sequence: account.sequenceNumber(),
        balances: account.balances.map(this.mapBalance),
      };

      log.debug('Account info retrieved', { accountId: publicKey });
      return stellarAccount;
    } catch (error) {
      log.error('Failed to fetch account info', error as Error, { publicKey });
      throw new Error(`Failed to load account: ${(error as Error).message}`);
    }
  }

  /**
   * 계정 잔액 조회
   */
  async getBalances(publicKey: string): Promise<StellarBalance[]> {
    try {
      const account = await this.getAccount(publicKey);
      return account.balances;
    } catch (error) {
      log.error('Failed to fetch balances', error as Error, { publicKey });
      throw error;
    }
  }

  /**
   * 특정 토큰 잔액 조회
   */
  async getTokenBalance(publicKey: string, assetCode?: string, assetIssuer?: string): Promise<string> {
    try {
      const balances = await this.getBalances(publicKey);
      
      if (!assetCode || assetCode === 'XLM') {
        // XLM (네이티브) 잔액
        const xlmBalance = balances.find(b => b.assetType === 'native');
        return xlmBalance ? xlmBalance.balance : '0';
      }
      
      // 다른 토큰 잔액
      const tokenBalance = balances.find(b => 
        b.assetCode === assetCode && 
        (!assetIssuer || b.assetIssuer === assetIssuer)
      );
      
      return tokenBalance ? tokenBalance.balance : '0';
    } catch (error) {
      log.error('Failed to fetch token balance', error as Error, { 
        publicKey, 
        assetCode, 
        assetIssuer 
      });
      throw error;
    }
  }

  /**
   * 계정 거래 히스토리 조회
   */
  async getTransactionHistory(
    publicKey: string, 
    limit: number = 10
  ): Promise<StellarTransaction[]> {
    try {
      log.debug('Fetching transaction history', { publicKey, limit });
      
      const transactions = await this.server
        .transactions()
        .forAccount(publicKey)
        .order('desc')
        .limit(limit)
        .call();

      const history = transactions.records.map(tx => ({
        hash: tx.hash,
        ledger: tx.ledger_attr,
        createdAt: tx.created_at,
        sourceAccount: tx.source_account,
        feePaid: tx.fee_charged?.toString() || '0',
        operationCount: tx.operation_count,
        successful: tx.successful,
      }));

      log.debug('Transaction history retrieved', { 
        publicKey, 
        count: history.length 
      });
      
      return history;
    } catch (error) {
      log.error('Failed to fetch transaction history', error as Error, { publicKey });
      throw error;
    }
  }

  /**
   * 새 키페어 생성
   */
  generateKeypair(): { publicKey: string; secretKey: string } {
    const keypair = Keypair.random();
    
    log.info('New keypair generated', { 
      publicKey: keypair.publicKey() 
    });
    
    return {
      publicKey: keypair.publicKey(),
      secretKey: keypair.secret(),
    };
  }

  /**
   * 키페어 검증
   */
  validateKeypair(secretKey: string): boolean {
    try {
      const keypair = Keypair.fromSecret(secretKey);
      // Keypair이 생성되면 유효한 것으로 간주
      return keypair.publicKey().length > 0;
    } catch (error) {
      log.warn('Invalid keypair provided', { error: (error as Error).message });
      return false;
    }
  }

  /**
   * 공개키 검증
   */
  validatePublicKey(publicKey: string): boolean {
    try {
      // 공개키로 Keypair 생성 시도
      Keypair.fromPublicKey(publicKey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 계정 존재 여부 확인
   */
  async accountExists(publicKey: string): Promise<boolean> {
    try {
      await this.server.loadAccount(publicKey);
      return true;
    } catch (error) {
      if ((error as any).response?.status === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * 트랜잭션 빌더 생성
   */
  async createTransactionBuilder(sourceAccount: string): Promise<TransactionBuilder> {
    try {
      const account = await this.server.loadAccount(sourceAccount);
      const baseFee = await this.server.fetchBaseFee();
      
      return new TransactionBuilder(account, {
        fee: baseFee.toString(),
        networkPassphrase: this.networkPassphrase,
      });
    } catch (error) {
      log.error('Failed to create transaction builder', error as Error, { sourceAccount });
      throw error;
    }
  }

  /**
   * 결제 오퍼레이션 생성
   */
  createPaymentOperation(
    destination: string,
    asset: Asset,
    amount: string
  ): any {
    return Operation.payment({
      destination,
      asset,
      amount,
    });
  }

  /**
   * 트러스트라인 오퍼레이션 생성
   */
  createChangeTrustOperation(asset: Asset, limit?: string | undefined): any {
    const options: any = { asset };
    if (limit !== undefined) {
      options.limit = limit;
    }
    return Operation.changeTrust(options);
  }

  /**
   * 트랜잭션 제출
   */
  async submitTransaction(
    transaction: any,
    signers: Keypair[]
  ): Promise<Horizon.HorizonApi.SubmitTransactionResponse> {
    try {
      // 트랜잭션 서명
      signers.forEach(signer => {
        transaction.sign(signer);
      });

      log.info('Submitting transaction', { 
        hash: transaction.hash().toString('hex'),
        signers: signers.length 
      });

      // 트랜잭션 제출
      const response = await this.server.submitTransaction(transaction);
      
      log.info('Transaction submitted successfully', { 
        hash: response.hash,
        ledger: response.ledger 
      });
      
      return response;
    } catch (error) {
      log.error('Transaction submission failed', error as Error);
      throw error;
    }
  }

  /**
   * 네이티브 XLM Asset 반환
   */
  getNativeAsset(): Asset {
    return Asset.native();
  }

  /**
   * 커스텀 Asset 생성
   */
  createAsset(code: string, issuer: string): Asset {
    return new Asset(code, issuer);
  }

  /**
   * 현재 네트워크 정보 반환
   */
  getNetworkInfo(): { network: string; passphrase: string; horizonUrl: string } {
    return {
      network: stellarConfig.network,
      passphrase: this.networkPassphrase,
      horizonUrl: stellarConfig.horizonUrl,
    };
  }

  /**
   * Stellar 잔액 매핑 헬퍼
   */
  private mapBalance(balance: any): StellarBalance {
    const baseBalance: StellarBalance = {
      asset: balance.asset_type === 'native' ? 'XLM' : balance.asset_code || '',
      assetType: balance.asset_type as 'native' | 'credit_alphanum4' | 'credit_alphanum12',
      balance: balance.balance,
    };

    if (balance.asset_type !== 'native' && balance.asset_type !== 'liquidity_pool_shares') {
      baseBalance.assetCode = balance.asset_code;
      baseBalance.assetIssuer = balance.asset_issuer;
      baseBalance.limit = balance.limit;
      baseBalance.buyingLiabilities = balance.buying_liabilities;
      baseBalance.sellingLiabilities = balance.selling_liabilities;
    }

    return baseBalance;
  }
}

/**
 * 싱글톤 Stellar 클라이언트 인스턴스
 */
export const stellarClient = new StellarClient();