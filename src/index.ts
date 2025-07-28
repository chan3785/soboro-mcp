#!/usr/bin/env node

/**
 * Soroswap MCP Server 메인 엔트리 포인트
 */

import { SoroswapMCPServer } from '@/mcp/server';
import { log, ensureLogDirectory, closeLogger } from '@/utils/logger';
import { validateConfig, printConfig } from '@/utils/config';

/**
 * 애플리케이션 시작
 */
async function main(): Promise<void> {
  try {
    // 로그 디렉토리 생성
    await ensureLogDirectory();

    log.info('🚀 Soroswap MCP Server 시작 중...');

    // 설정 검증
    validateConfig();
    
    // 설정 정보 출력 (개발 모드에서만)
    if (process.env.NODE_ENV === 'development') {
      printConfig();
    }

    // MCP 서버 인스턴스 생성
    const server = new SoroswapMCPServer();

    // 서버 시작
    await server.start();

    log.info('✅ Soroswap MCP Server가 성공적으로 시작되었습니다');

    // 종료 신호 처리
    setupGracefulShutdown(server);

  } catch (error) {
    log.error('❌ 서버 시작 실패', error as Error);
    process.exit(1);
  }
}

/**
 * 우아한 종료 설정
 */
function setupGracefulShutdown(server: SoroswapMCPServer): void {
  const shutdown = async (signal: string) => {
    log.info(`📤 ${signal} 신호를 받았습니다. 서버를 종료합니다...`);

    try {
      // 서버 정지
      await server.stop();
      
      // 로거 종료
      await closeLogger();
      
      log.info('✅ 서버가 안전하게 종료되었습니다');
      process.exit(0);
    } catch (error) {
      log.error('❌ 서버 종료 중 오류 발생', error as Error);
      process.exit(1);
    }
  };

  // 종료 신호 리스너 등록
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // 처리되지 않은 예외 처리
  process.on('uncaughtException', (error) => {
    log.error('💥 처리되지 않은 예외', error);
    shutdown('UNCAUGHT_EXCEPTION').catch(() => process.exit(1));
  });

  // 처리되지 않은 Promise 거부 처리
  process.on('unhandledRejection', (reason, promise) => {
    log.error('💥 처리되지 않은 Promise 거부', reason as Error, {
      promise: promise.toString(),
    });
    shutdown('UNHANDLED_REJECTION').catch(() => process.exit(1));
  });
}

/**
 * 도움말 출력
 */
function printHelp(): void {
  console.log(`
🌟 Soroswap MCP Server

AI-powered automated token swapping on Stellar via Soroswap DEX

사용법:
  npm start              서버 시작 (프로덕션)
  npm run dev            서버 시작 (개발 모드)
  npm test               테스트 실행
  npm run build          빌드

환경 변수:
  NODE_ENV               실행 환경 (development/production/test)
  PORT                   서버 포트 (기본값: 3000)
  LOG_LEVEL              로그 레벨 (error/warn/info/debug)
  STELLAR_NETWORK        Stellar 네트워크 (testnet/mainnet)
  SOROSWAP_API_URL       Soroswap API URL

자세한 정보는 README.md를 참조하세요.
  `);
}

/**
 * 버전 정보 출력
 */
function printVersion(): void {
  const packageJson = require('../package.json');
  console.log(`v${packageJson.version}`);
}

// 명령행 인자 처리
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  printHelp();
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  printVersion();
  process.exit(0);
}

// 메인 함수 실행
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ 서버 시작 실패:', error);
    process.exit(1);
  });
}