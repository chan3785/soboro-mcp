/**
 * 로깅 시스템 설정
 */

import winston from 'winston';
import { serverConfig, isDevelopment } from '@/utils/config';
import type { LogContext } from '@/types';

/**
 * 로그 포맷 설정
 */
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS',
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

/**
 * 개발 환경용 콘솔 포맷
 */
const consoleFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'HH:mm:ss',
  }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let logMessage = `${timestamp} [${level}]: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      logMessage += `\n${JSON.stringify(meta, null, 2)}`;
    }
    
    return logMessage;
  })
);

/**
 * Winston 로거 설정
 */
const logger = winston.createLogger({
  level: serverConfig.logLevel,
  format: logFormat,
  defaultMeta: {
    service: 'soroswap-mcp-server',
    version: process.env.npm_package_version || '1.0.0',
  },
  transports: [
    // 에러 로그 파일
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true,
    }),
    
    // 전체 로그 파일
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 10,
      tailable: true,
    }),
  ],
  
  // 예외 처리
  exceptionHandlers: [
    new winston.transports.File({
      filename: 'logs/exceptions.log',
    }),
  ],
  
  // 프로미스 거부 처리
  rejectionHandlers: [
    new winston.transports.File({
      filename: 'logs/rejections.log',
    }),
  ],
});

/**
 * 개발 환경에서는 콘솔 출력 추가
 */
if (isDevelopment) {
  logger.add(
    new winston.transports.Console({
      format: consoleFormat,
    })
  );
}

/**
 * 컨텍스트와 함께 로그를 기록하는 래퍼 클래스
 */
class ContextLogger {
  constructor(private context: LogContext = {}) {}

  /**
   * 새로운 컨텍스트로 로거 생성
   */
  withContext(context: LogContext): ContextLogger {
    return new ContextLogger({ ...this.context, ...context });
  }

  /**
   * 에러 로그
   */
  error(message: string, error?: Error, metadata?: Record<string, any>): void {
    logger.error(message, {
      ...this.context,
      ...metadata,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : undefined,
    });
  }

  /**
   * 경고 로그
   */
  warn(message: string, metadata?: Record<string, any>): void {
    logger.warn(message, { ...this.context, ...metadata });
  }

  /**
   * 정보 로그
   */
  info(message: string, metadata?: Record<string, any>): void {
    logger.info(message, { ...this.context, ...metadata });
  }

  /**
   * 디버그 로그
   */
  debug(message: string, metadata?: Record<string, any>): void {
    logger.debug(message, { ...this.context, ...metadata });
  }

  /**
   * 요청 시작 로그
   */
  requestStart(method: string, params: any, requestId: string): void {
    this.info('Request started', {
      requestId,
      method,
      params: isDevelopment ? params : '[REDACTED]',
    });
  }

  /**
   * 요청 완료 로그
   */
  requestEnd(method: string, requestId: string, duration: number, success: boolean): void {
    const level = success ? 'info' : 'warn';
    const message = success ? 'Request completed' : 'Request failed';
    
    logger[level](message, {
      ...this.context,
      requestId,
      method,
      duration: `${duration}ms`,
      success,
    });
  }

  /**
   * 성능 측정 로그
   */
  performance(operation: string, duration: number, metadata?: Record<string, any>): void {
    this.info('Performance metric', {
      ...this.context,
      operation,
      duration: `${duration}ms`,
      ...metadata,
    });
  }

  /**
   * 보안 이벤트 로그
   */
  security(event: string, metadata?: Record<string, any>): void {
    this.warn(`Security event: ${event}`, {
      ...this.context,
      securityEvent: true,
      ...metadata,
    });
  }

  /**
   * 거래 관련 로그
   */
  transaction(action: string, txHash?: string, metadata?: Record<string, any>): void {
    this.info(`Transaction ${action}`, {
      ...this.context,
      transactionHash: txHash,
      ...metadata,
    });
  }
}

/**
 * 기본 로거 인스턴스
 */
export const log = new ContextLogger();

/**
 * 로그 디렉토리 생성
 */
export async function ensureLogDirectory(): Promise<void> {
  const fs = await import('fs/promises');
  const path = await import('path');
  
  try {
    await fs.mkdir(path.join(process.cwd(), 'logs'), { recursive: true });
    log.info('Log directory ensured');
  } catch (error) {
    console.error('Failed to create log directory:', error);
  }
}

/**
 * 로거 종료
 */
export function closeLogger(): Promise<void> {
  return new Promise((resolve) => {
    logger.close();
    resolve();
  });
}

/**
 * 요청 ID 생성
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 실행 시간 측정 데코레이터
 */
export function measureTime<T extends (...args: any[]) => Promise<any>>(
  operation: string,
  logger: ContextLogger = log
) {
  return function (_target: any, _propertyName: string, descriptor: TypedPropertyDescriptor<T>) {
    const method = descriptor.value!;

    descriptor.value = (async function (this: any, ...args: any[]) {
      const startTime = Date.now();
      try {
        const result = await method.apply(this, args);
        const duration = Date.now() - startTime;
        logger.performance(operation, duration);
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.performance(`${operation} (failed)`, duration);
        throw error;
      }
    }) as T;

    return descriptor;
  };
}

export default logger;