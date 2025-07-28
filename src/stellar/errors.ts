/**
 * Stellar 관련 에러 클래스
 */

import { ErrorCode } from '@/types';

/**
 * 기본 Stellar 에러 클래스
 */
export class StellarError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'StellarError';
  }
}

/**
 * Stellar 연결 에러
 */
export class StellarConnectionError extends StellarError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, ErrorCode.STELLAR_CONNECTION_ERROR, details);
    this.name = 'StellarConnectionError';
  }
}

/**
 * 계정을 찾을 수 없는 에러
 */
export class StellarAccountNotFoundError extends StellarError {
  constructor(publicKey: string) {
    super(
      `Stellar account not found: ${publicKey}`,
      ErrorCode.STELLAR_ACCOUNT_NOT_FOUND,
      { publicKey }
    );
    this.name = 'StellarAccountNotFoundError';
  }
}

/**
 * 잔액 부족 에러
 */
export class StellarInsufficientBalanceError extends StellarError {
  constructor(
    asset: string,
    required: string,
    available: string,
    publicKey: string
  ) {
    super(
      `Insufficient balance for ${asset}. Required: ${required}, Available: ${available}`,
      ErrorCode.STELLAR_INSUFFICIENT_BALANCE,
      { asset, required, available, publicKey }
    );
    this.name = 'StellarInsufficientBalanceError';
  }
}

/**
 * 트랜잭션 실패 에러
 */
export class StellarTransactionFailedError extends StellarError {
  constructor(
    message: string,
    transactionHash?: string,
    resultCodes?: any
  ) {
    super(
      message,
      ErrorCode.STELLAR_TRANSACTION_FAILED,
      { transactionHash, resultCodes }
    );
    this.name = 'StellarTransactionFailedError';
  }
}

/**
 * 잘못된 키페어 에러
 */
export class InvalidKeypairError extends StellarError {
  constructor(message: string = 'Invalid Stellar keypair') {
    super(message, ErrorCode.INVALID_SIGNATURE);
    this.name = 'InvalidKeypairError';
  }
}

/**
 * 트러스트라인 없음 에러
 */
export class TrustlineNotFoundError extends StellarError {
  constructor(assetCode: string, assetIssuer: string, publicKey: string) {
    super(
      `Trustline not found for ${assetCode}:${assetIssuer}`,
      ErrorCode.STELLAR_ACCOUNT_NOT_FOUND,
      { assetCode, assetIssuer, publicKey }
    );
    this.name = 'TrustlineNotFoundError';
  }
}

/**
 * Stellar 에러를 적절한 커스텀 에러로 변환
 */
export function convertStellarError(error: any): StellarError {
  // 네트워크 연결 에러
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
    return new StellarConnectionError(
      'Failed to connect to Stellar network',
      { originalError: error.message }
    );
  }

  // HTTP 에러 응답
  if (error.response) {
    const status = error.response.status;
    const data = error.response.data;

    // 404: 계정 또는 리소스를 찾을 수 없음
    if (status === 404) {
      return new StellarAccountNotFoundError(
        data?.detail || 'Resource not found'
      );
    }

    // 400: 트랜잭션 에러
    if (status === 400 && data?.extras?.result_codes) {
      return new StellarTransactionFailedError(
        data.detail || 'Transaction failed',
        data.extras.envelope_xdr,
        data.extras.result_codes
      );
    }
  }

  // Stellar SDK 에러
  if (error.name === 'BadResponseError') {
    if (error.data?.extras?.result_codes) {
      return new StellarTransactionFailedError(
        error.message,
        undefined,
        error.data.extras.result_codes
      );
    }
  }

  // 기본 Stellar 에러
  return new StellarError(
    error.message || 'Unknown Stellar error',
    ErrorCode.STELLAR_CONNECTION_ERROR,
    { originalError: error }
  );
}