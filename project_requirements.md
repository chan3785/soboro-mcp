# Soroswap MCP Server - 요구사항 문서

## 프로젝트 개요

### 목적
Stellar Lumens 블록체인 상의 Soroswap DEX와 연동하여 자동화된 토큰 스왑 기능을 제공하는 MCP (Model Context Protocol) 서버 구축

### 목표
- Soroswap API를 활용한 자동 토큰 교환 시스템 구현
- AI 에이전트가 DeFi 거래를 수행할 수 있는 인터페이스 제공
- 안전하고 효율적인 거래 실행 환경 구축

## 기능 요구사항

### 1. 핵심 기능

#### 1.1 토큰 스왑 기능
- **입력**: 교환할 토큰 쌍, 수량, 슬리피지 허용 범위
- **출력**: 거래 결과, 트랜잭션 해시, 실제 교환된 수량
- **지원 토큰**: XLM, USDC, 기타 Stellar 네트워크 토큰

#### 1.2 가격 조회 기능
- 실시간 토큰 가격 조회
- 교환 비율 계산
- 유동성 풀 정보 확인

#### 1.3 지갑 관리
- Stellar 계정 연결 및 관리
- 잔액 조회
- 트랜잭션 히스토리 확인

#### 1.4 거래 분석
- 최적 거래 경로 분석
- 가격 임팩트 계산
- 수수료 추정

### 2. MCP 인터페이스

#### 2.1 도구 (Tools)
```json
{
  "swap_tokens": {
    "description": "Execute token swap on Soroswap",
    "parameters": {
      "from_token": "string",
      "to_token": "string", 
      "amount": "number",
      "slippage": "number"
    }
  },
  "get_price": {
    "description": "Get current token price",
    "parameters": {
      "token_pair": "string"
    }
  },
  "get_balance": {
    "description": "Check wallet balance",
    "parameters": {
      "account": "string",
      "token": "string"
    }
  }
}
```

#### 2.2 리소스 (Resources)
- 지갑 정보
- 거래 히스토리
- 토큰 메타데이터
- 유동성 풀 데이터

## 기술 요구사항

### 1. 아키텍처
- **언어**: TypeScript/Node.js
- **프레임워크**: MCP SDK
- **블록체인 연동**: Stellar SDK
- **API 클라이언트**: Soroswap API

### 2. 의존성
```json
{
  "@modelcontextprotocol/sdk": "^0.5.0",
  "stellar-sdk": "^11.0.0",
  "axios": "^1.6.0",
  "dotenv": "^16.0.0",
  "zod": "^3.22.0"
}
```

### 3. 환경 변수
- `STELLAR_NETWORK`: testnet/mainnet
- `SOROSWAP_API_URL`: Soroswap API 엔드포인트
- `DEFAULT_ACCOUNT_SECRET`: 기본 계정 시크릿 키
- `MAX_SLIPPAGE`: 최대 슬리피지 허용치

## 보안 요구사항

### 1. 키 관리
- 프라이빗 키 안전한 저장
- 환경 변수를 통한 민감 정보 관리
- 키 로테이션 지원

### 2. 거래 검증
- 트랜잭션 서명 전 검증
- 슬리피지 보호
- 최대 거래 한도 설정

### 3. 에러 처리
- 네트워크 오류 대응
- 거래 실패 시 롤백
- 상세한 에러 로깅

## 성능 요구사항

### 1. 응답 시간
- 가격 조회: < 2초
- 스왑 실행: < 10초
- 잔액 확인: < 1초

### 2. 처리량
- 동시 요청 처리: 10 TPS
- API 호출 제한 준수

### 3. 가용성
- 99% 업타임 목표
- 자동 재시도 메커니즘
- 헬스체크 엔드포인트

## 사용자 경험 요구사항

### 1. 사용 편의성
- 직관적인 명령어 인터페이스
- 명확한 에러 메시지
- 진행 상황 피드백

### 2. 안전성
- 거래 전 확인 프로세스
- 위험 경고 메시지
- 취소 가능한 대기 시간

## 테스트 요구사항

### 1. 단위 테스트
- 각 도구 함수별 테스트
- 에러 케이스 테스트
- 모킹을 통한 API 테스트

### 2. 통합 테스트
- Stellar 테스트넷 연동 테스트
- Soroswap API 연동 테스트
- End-to-end 거래 시나리오

### 3. 성능 테스트
- 부하 테스트
- 스트레스 테스트
- 메모리 누수 테스트

## 배포 요구사항

### 1. 환경
- Docker 컨테이너화
- GitHub Actions CI/CD
- 환경별 설정 분리

### 2. 모니터링
- 로그 수집 및 분석
- 메트릭 모니터링
- 알람 시스템

### 3. 문서화
- API 문서
- 사용자 가이드
- 개발자 문서

## 규정 준수

### 1. 라이선스
- MIT 라이선스 적용
- 오픈소스 의존성 검토

### 2. 보안 감사
- 코드 정적 분석
- 의존성 취약점 검사
- 보안 모범 사례 준수

## 마일스톤

### Phase 1 (1주차)
- 기본 MCP 서버 구조 구현
- Stellar SDK 연동
- 기본 지갑 기능

### Phase 2 (2주차)
- Soroswap API 연동
- 토큰 스왑 기능 구현
- 가격 조회 기능

### Phase 3 (3주차)
- 고급 거래 분석 기능
- 보안 강화
- 테스트 구현

### Phase 4 (4주차)
- 성능 최적화
- 문서화
- 배포 준비

## 성공 지표

- 성공적인 토큰 스왑 실행률: > 95%
- 평균 응답 시간: < 5초
- 코드 커버리지: > 80%
- 사용자 만족도: > 4.5/5
- 보안 취약점: 0개