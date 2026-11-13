/**
 * Milky HTTP 服务端。
 *
 * 通信模型（milky.ntqqrev.org guide/communication）：
 *   - POST /api/:api 提供 API 调用（Bearer access_token 鉴权，失败 401）
 *   - /event 提供事件推送：HTTP GET 请求按 Upgrade 头分流——
 *     Upgrade: websocket → WebSocket 长连接；否则视为 SSE 连接
 *   - 可选 WebHook：向配置的多个地址 POST 事件
 * 鉴权实现照抄 network/http-server.ts 的 authorize/authorizeWS（token 复用既有机制）。
 */
import http from 'http';
import cors from 'cors';
import express, { Express, NextFunction, Request, Response } from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import type { RawData } from 'ws';
import { SnowCatCore } from 'snowcat-core';
import type { NapCatOneBot11Adapter } from '@/snowcat-onebot/index';
import { IOB11NetworkAdapter } from '@/snowcat-onebot/network/adapter';
import { ActionMap } from '@/snowcat-onebot/action';
import type { MilkyServerConfig } from '@/snowcat-onebot/config/config';
import { OB11NetworkReloadType } from '@/snowcat-onebot/network/index';
import { MilkyBridge } from '@/snowcat-onebot/milky/bridge';
import type { ActionMapLike } from '@/snowcat-onebot/milky/actions';
import type { MilkyV11EventLike } from '@/snowcat-onebot/milky/events';
import type { MilkyEventEnvelope } from '@/snowcat-onebot/milky/types';

/** Milky 网络适配器：与 OB11 适配器并列注册进 OB11NetworkManager */
export class MilkyServerAdapter extends IOB11NetworkAdapter<MilkyServerConfig> {
  private app: Express | undefined;
  private server: http.Server | undefined;
  private wsServer: WebSocketServer | undefined;
  /** WS / SSE 客户端（/event 端点） */
  private wsClients: WebSocket[] = [];
  private sseClients: Response[] = [];
  private webhookUrls: string[] = [];

  constructor (
    name: string, config: MilkyServerConfig, core: SnowCatCore,
    obContext: NapCatOneBot11Adapter, actions: ActionMap
  ) {
    super(name, config, core, obContext, actions);
  }

  override get isActive (): boolean {
    return this.isEnable;
  }

  // ==================== 事件出口 ====================

  override async onEvent<T>(event: T): Promise<void> {
    if (!this.isEnable) {
      return;
    }
    const milkyEvent = this.bridge.convertEvent(event as unknown as MilkyV11EventLike);
    if (!milkyEvent) {
      // Milky v1.3 没有对应形态（admin/ban/poke 等），第一版直接丢弃
      return;
    }
    await this.broadcastEvent(milkyEvent);
  }

  private async broadcastEvent (event: MilkyEventEnvelope): Promise<void> {
    const line = JSON.stringify(event);
    const wsPromises = this.wsClients.map(wsClient => new Promise<void>((resolve, reject) => {
      if (wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(line);
        resolve();
      } else {
        reject(new Error('WebSocket is not open'));
      }
    }));
    for (const sseClient of this.sseClients) {
      try {
        sseClient.write(`data: ${line}\n\n`);
      } catch {
        // SSE 客户端断开由 req close 事件清理
      }
    }
    const webhookPromises = this.webhookUrls.map(url => fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: line,
    }).catch(e => {
      this.logger.logError(`[Milky] WebHook 推送失败 ${url}`, e);
    }));
    await Promise.allSettled([...wsPromises, ...webhookPromises]);
  }

  private get bridge (): MilkyBridge {
    return new MilkyBridge({
      actions: this.actions as unknown as ActionMapLike,
      selfId: () => parseInt(this.core.selfInfo.uin) || 0,
      adapterName: this.name,
      config: this.config,
      implName: 'snowcat',
    });
  }

  // ==================== 生命周期 ====================

  override open (): void {
    if (this.isEnable) {
      this.logger.logError('[Milky] Cannot open an opened server');
      return;
    }
    this.initializeServer();
    this.isEnable = true;
  }

  override async close (): Promise<void> {
    this.isEnable = false;
    this.wsClients.forEach(wsClient => wsClient.close());
    this.wsClients = [];
    this.sseClients = [];
    this.wsServer?.close();
    this.server?.close();
    this.app = undefined;
  }

  override async reload (newConfig: MilkyServerConfig): Promise<OB11NetworkReloadType> {
    const wasEnabled = this.isEnable;
    const oldPort = this.config.port;
    const oldHost = this.config.host;
    const oldEnableWebsocket = this.config.enableWebsocket;
    this.config = newConfig;
    this.webhookUrls = newConfig.webhooks ?? [];

    if (newConfig.enable && !wasEnabled) {
      this.open();
      return OB11NetworkReloadType.NetWorkOpen;
    }
    if (!newConfig.enable && wasEnabled) {
      await this.close();
      return OB11NetworkReloadType.NetWorkClose;
    }
    if (oldPort !== newConfig.port || oldHost !== newConfig.host || oldEnableWebsocket !== newConfig.enableWebsocket) {
      await this.close();
      if (newConfig.enable) {
        this.open();
      }
      return OB11NetworkReloadType.NetWorkReload;
    }
    return OB11NetworkReloadType.Normal;
  }

  // ==================== HTTP 装配 ====================

  private initializeServer (): void {
    this.app = express();
    this.server = http.createServer(this.app);
    this.webhookUrls = this.config.webhooks ?? [];

    if (this.config.enableWebsocket) {
      this.wsServer = new WebSocketServer({ server: this.server });
      this.wsServer.on('connection', (wsClient: WebSocket, wsReq: IncomingMessage) => {
        this.createWSClient(wsClient, wsReq);
      });
    }

    if (this.config.enableCors) {
      this.app.use(cors());
    }
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use((req, res, next) => this.authorize(this.config.token, req, res, next));

    // /event：SSE 端点（enableWebsocket 时 WS 由 server upgrade 接管，见 createWSClient）
    this.app.get('/event', (req, res) => {
      if (!this.isEnable) {
        res.status(503).json({ status: 'failed', retcode: -500, data: null, message: 'Milky 服务已关闭' });
        return;
      }
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      res.write(': connected\n\n');
      this.sseClients.push(res);
      req.on('close', () => {
        this.sseClients = this.sseClients.filter(c => c !== res);
      });
    });

    // /api/:api
    this.app.post('/api/:api', (req, res) => {
      void this.handleApi(req, res);
    });
    // 404 兜底
    this.app.use((_req: Request, res: Response) => {
      res.status(404).json({ status: 'failed', retcode: -404, data: null, message: '请求的端点不存在' });
    });

    this.server.listen(this.config.port, this.config.host, () => {
      this.logger.log(`[Milky] Server Started On ${this.config.host}:${this.config.port}`);
    });
  }

  private authorize (token: string | undefined, req: Request, res: Response, next: NextFunction): void {
    if (!token || token.length === 0) {
      next();
      return;
    }
    const headerToken = req.headers.authorization?.split('Bearer ').pop() ?? '';
    const queryToken = req.query['access_token'];
    const clientToken = typeof queryToken === 'string' && queryToken !== '' ? queryToken : headerToken;
    if (clientToken === token) {
      next();
      return;
    }
    // Milky 规范：401 鉴权凭据未提供或不匹配
    res.status(401).json({ status: 'failed', retcode: -401, data: null, message: 'access_token 校验失败' });
  }

  private authorizeWS (token: string | undefined, wsClient: WebSocket, wsReq: IncomingMessage): boolean {
    if (!token || token.length === 0) {
      return true;
    }
    const url = new URL(wsReq.url ?? '/', 'http://localhost');
    const queryToken = url.searchParams.get('access_token') ?? '';
    const headerToken = wsReq.headers.authorization?.split('Bearer ').pop() ?? '';
    const clientToken = queryToken !== '' ? queryToken : headerToken;
    if (clientToken === token) {
      return true;
    }
    wsClient.close(4001, 'access_token 校验失败');
    return false;
  }

  private createWSClient (wsClient: WebSocket, wsReq: IncomingMessage): void {
    if (!this.isEnable) {
      wsClient.close();
      return;
    }
    if (!this.authorizeWS(this.config.token, wsClient, wsReq)) {
      return;
    }
    // Milky 规范：/event 的 GET 请求带 Upgrade: websocket 时走 WS 事件通道
    this.wsClients.push(wsClient);
    wsClient.on('close', () => {
      this.wsClients = this.wsClients.filter(c => c !== wsClient);
    });
    wsClient.on('error', err => {
      this.logger.logError('[Milky] WebSocket Client Error:', err.message);
    });
    // WS 通道只做事件下行；动作调用一律走 POST /api/:api（收到消息仅提示不执行）
    wsClient.on('message', (message: RawData) => {
      this.logger.logDebug('[Milky] WS 通道不提供 API 调用，请使用 POST /api/:api:', message.toString().substring(0, 120));
    });
  }

  private async handleApi (req: Request, res: Response): Promise<void> {
    if (!this.isEnable) {
      res.json({ status: 'failed', retcode: -500, data: null, message: 'Milky 服务已关闭' });
      return;
    }
    const api = req.params['api'] ?? '';
    const payload = (req.body ?? {}) as Record<string, unknown>;
    const response = await this.bridge.dispatch(api, payload);
    if (response.retcode === -404) {
      // 规范：请求的 API 不存在 → HTTP 404
      res.status(404).json(response);
      return;
    }
    res.json(response);
  }
}
