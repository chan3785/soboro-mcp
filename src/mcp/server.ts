/**
 * MCP 서버 구현
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { log, generateRequestId } from '@/utils/logger';
import { serverConfig } from '@/utils/config';
import type { MCPTool, MCPResource } from '@/types';

/**
 * Soroswap MCP 서버 클래스
 */
export class SoroswapMCPServer {
  private server: Server;
  private isRunning = false;

  constructor() {
    this.server = new Server(
      {
        name: 'soroswap-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.setupHandlers();
  }

  /**
   * MCP 핸들러 설정
   */
  private setupHandlers(): void {
    // 도구 목록 요청 핸들러
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const requestId = generateRequestId();
      log.requestStart('list_tools', {}, requestId);

      try {
        const tools = await this.getAvailableTools();
        log.requestEnd('list_tools', requestId, 0, true);
        
        return {
          tools: tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          })),
        };
      } catch (error) {
        log.error('Failed to list tools', error as Error);
        log.requestEnd('list_tools', requestId, 0, false);
        throw error;
      }
    });

    // 도구 호출 핸들러
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const requestId = generateRequestId();
      const { name, arguments: args } = request.params;
      
      log.requestStart('call_tool', { name, arguments: args }, requestId);

      try {
        const result = await this.callTool(name, args);
        log.requestEnd('call_tool', requestId, 0, true);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        log.error(`Tool call failed: ${name}`, error as Error, { arguments: args });
        log.requestEnd('call_tool', requestId, 0, false);
        
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    });

    // 리소스 목록 요청 핸들러
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const requestId = generateRequestId();
      log.requestStart('list_resources', {}, requestId);

      try {
        const resources = await this.getAvailableResources();
        log.requestEnd('list_resources', requestId, 0, true);
        
        return {
          resources: resources.map(resource => ({
            uri: resource.uri,
            name: resource.name,
            description: resource.description,
            mimeType: resource.mimeType,
          })),
        };
      } catch (error) {
        log.error('Failed to list resources', error as Error);
        log.requestEnd('list_resources', requestId, 0, false);
        throw error;
      }
    });

    // 리소스 읽기 핸들러
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const requestId = generateRequestId();
      const { uri } = request.params;
      
      log.requestStart('read_resource', { uri }, requestId);

      try {
        const content = await this.readResource(uri);
        log.requestEnd('read_resource', requestId, 0, true);
        
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(content, null, 2),
            },
          ],
        };
      } catch (error) {
        log.error(`Resource read failed: ${uri}`, error as Error);
        log.requestEnd('read_resource', requestId, 0, false);
        throw error;
      }
    });
  }

  /**
   * 사용 가능한 도구 목록 반환
   */
  private async getAvailableTools(): Promise<MCPTool[]> {
    return [
      {
        name: 'swap_tokens',
        description: 'Execute token swap on Soroswap DEX',
        inputSchema: {
          type: 'object',
          properties: {
            fromToken: {
              type: 'string',
              description: 'Symbol of the token to swap from (e.g., XLM, USDC)',
            },
            toToken: {
              type: 'string',
              description: 'Symbol of the token to swap to (e.g., XLM, USDC)',
            },
            amount: {
              type: 'number',
              description: 'Amount of tokens to swap',
              minimum: 0.1,
            },
            slippage: {
              type: 'number',
              description: 'Maximum slippage tolerance in percentage (0.1-50)',
              minimum: 0.1,
              maximum: 50,
              default: 1.0,
            },
          },
          required: ['fromToken', 'toToken', 'amount'],
        },
      },
      {
        name: 'get_price',
        description: 'Get current token price and market data',
        inputSchema: {
          type: 'object',
          properties: {
            tokenPair: {
              type: 'string',
              description: 'Token pair to get price for (e.g., XLM/USDC)',
            },
            includeChange: {
              type: 'boolean',
              description: 'Include 24h price change data',
              default: true,
            },
          },
          required: ['tokenPair'],
        },
      },
      {
        name: 'get_balance',
        description: 'Check wallet balance for specific tokens',
        inputSchema: {
          type: 'object',
          properties: {
            account: {
              type: 'string',
              description: 'Stellar account public key',
            },
            token: {
              type: 'string',
              description: 'Token symbol to check balance for (optional, returns all if not specified)',
            },
          },
          required: ['account'],
        },
      },
      {
        name: 'get_history',
        description: 'Get transaction history for an account',
        inputSchema: {
          type: 'object',
          properties: {
            account: {
              type: 'string',
              description: 'Stellar account public key',
            },
            limit: {
              type: 'number',
              description: 'Number of transactions to return',
              minimum: 1,
              maximum: 100,
              default: 10,
            },
          },
          required: ['account'],
        },
      },
      {
        name: 'estimate_swap',
        description: 'Estimate swap output and fees without executing',
        inputSchema: {
          type: 'object',
          properties: {
            fromToken: {
              type: 'string',
              description: 'Symbol of the token to swap from',
            },
            toToken: {
              type: 'string',
              description: 'Symbol of the token to swap to',
            },
            amount: {
              type: 'number',
              description: 'Amount of tokens to swap',
              minimum: 0.1,
            },
          },
          required: ['fromToken', 'toToken', 'amount'],
        },
      },
    ];
  }

  /**
   * 사용 가능한 리소스 목록 반환
   */
  private async getAvailableResources(): Promise<MCPResource[]> {
    return [
      {
        uri: 'soroswap://account/info',
        name: 'Account Information',
        description: 'Current account information and balances',
        mimeType: 'application/json',
      },
      {
        uri: 'soroswap://market/prices',
        name: 'Market Prices',
        description: 'Current market prices for all supported tokens',
        mimeType: 'application/json',
      },
      {
        uri: 'soroswap://pools/liquidity',
        name: 'Liquidity Pools',
        description: 'Information about available liquidity pools',
        mimeType: 'application/json',
      },
      {
        uri: 'soroswap://network/status',
        name: 'Network Status',
        description: 'Stellar network and Soroswap service status',
        mimeType: 'application/json',
      },
    ];
  }

  /**
   * 도구 호출 실행
   */
  private async callTool(name: string, args: any): Promise<any> {
    log.info(`Executing tool: ${name}`, { arguments: args });

    switch (name) {
      case 'swap_tokens':
        return this.handleSwapTokens(args);
      
      case 'get_price':
        return this.handleGetPrice(args);
      
      case 'get_balance':
        return this.handleGetBalance(args);
      
      case 'get_history':
        return this.handleGetHistory(args);
      
      case 'estimate_swap':
        return this.handleEstimateSwap(args);
      
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  /**
   * 리소스 읽기 실행
   */
  private async readResource(uri: string): Promise<any> {
    log.info(`Reading resource: ${uri}`);

    switch (uri) {
      case 'soroswap://account/info':
        return this.getAccountInfo();
      
      case 'soroswap://market/prices':
        return this.getMarketPrices();
      
      case 'soroswap://pools/liquidity':
        return this.getLiquidityPools();
      
      case 'soroswap://network/status':
        return this.getNetworkStatus();
      
      default:
        throw new Error(`Unknown resource: ${uri}`);
    }
  }

  // ============================================================================
  // 도구 핸들러 메서드들 (임시 구현)
  // ============================================================================

  private async handleSwapTokens(args: any): Promise<any> {
    // TODO: 실제 스왑 로직 구현 예정
    return {
      success: false,
      message: 'Swap functionality not yet implemented',
      args,
    };
  }

  private async handleGetPrice(args: any): Promise<any> {
    // TODO: 실제 가격 조회 로직 구현 예정
    return {
      tokenPair: args.tokenPair,
      price: 0,
      message: 'Price functionality not yet implemented',
    };
  }

  private async handleGetBalance(args: any): Promise<any> {
    // TODO: 실제 잔액 조회 로직 구현 예정
    return {
      account: args.account,
      balances: [],
      message: 'Balance functionality not yet implemented',
    };
  }

  private async handleGetHistory(args: any): Promise<any> {
    // TODO: 실제 히스토리 조회 로직 구현 예정
    return {
      account: args.account,
      transactions: [],
      message: 'History functionality not yet implemented',
    };
  }

  private async handleEstimateSwap(args: any): Promise<any> {
    // TODO: 실제 스왑 추정 로직 구현 예정
    return {
      fromToken: args.fromToken,
      toToken: args.toToken,
      amount: args.amount,
      estimatedOutput: 0,
      message: 'Estimate functionality not yet implemented',
    };
  }

  // ============================================================================
  // 리소스 핸들러 메서드들 (임시 구현)
  // ============================================================================

  private async getAccountInfo(): Promise<any> {
    return {
      message: 'Account info not yet implemented',
      timestamp: new Date().toISOString(),
    };
  }

  private async getMarketPrices(): Promise<any> {
    return {
      message: 'Market prices not yet implemented',
      timestamp: new Date().toISOString(),
    };
  }

  private async getLiquidityPools(): Promise<any> {
    return {
      message: 'Liquidity pools not yet implemented',
      timestamp: new Date().toISOString(),
    };
  }

  private async getNetworkStatus(): Promise<any> {
    return {
      stellar: {
        network: 'testnet',
        status: 'connected',
      },
      soroswap: {
        status: 'not implemented',
      },
      timestamp: new Date().toISOString(),
    };
  }

  // ============================================================================
  // 서버 제어 메서드들
  // ============================================================================

  /**
   * 서버 시작
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      log.warn('Server is already running');
      return;
    }

    try {
      log.info('Starting Soroswap MCP Server...');
      
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      
      this.isRunning = true;
      log.info('Soroswap MCP Server started successfully', {
        port: serverConfig.port,
        environment: serverConfig.nodeEnv,
      });
    } catch (error) {
      log.error('Failed to start server', error as Error);
      throw error;
    }
  }

  /**
   * 서버 중지
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      log.warn('Server is not running');
      return;
    }

    try {
      log.info('Stopping Soroswap MCP Server...');
      
      await this.server.close();
      
      this.isRunning = false;
      log.info('Soroswap MCP Server stopped successfully');
    } catch (error) {
      log.error('Failed to stop server', error as Error);
      throw error;
    }
  }

  /**
   * 서버 상태 확인
   */
  isServerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * 헬스 체크
   */
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    return {
      status: this.isRunning ? 'healthy' : 'stopped',
      timestamp: new Date().toISOString(),
    };
  }
}