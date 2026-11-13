/**
 * OneBot 12 桥。
 *
 * 不关心传输：WebSocket / HTTP / SSE 拿到一行 JSON，丢进来，拿一行 JSON 回去。
 * 这样现有的 OB11WebSocketServerAdapter 只需在 handleMessage 里换一行就能复用。
 */
import {
  OB12ActionRequest, OB12ActionResponse, OB12Event, OB12RetCode, OB12_PLATFORM,
  OB12_STANDARD_VERSION, OB12VersionInfo,
} from './types';
import {
  ActionMapLike, BUILTIN_ACTIONS, SUPPORTED_ACTIONS, buildRequest, translateResponse,
} from './actions';
import { V11EventLike, toOB12Event } from './events';

export interface OneBot12BridgeOptions {
  /** 直接传真实的 ActionMap 即可，只要它有 get(name) */
  actions: ActionMapLike;
  selfId: string | (() => string);
  /** 透传给 v11 action 用的适配器名与配置 */
  adapterName?: string;
  config?: unknown;
  implName?: string;
  implVersion?: string;
  /** get_latest_events 的本地缓冲上限 */
  maxRecentEvents?: number;
}

const rec = (v: unknown): Record<string, unknown> =>
  (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {});

function ok<T> (data: T): OB12ActionResponse<T> {
  return { status: 'ok', retcode: OB12RetCode.Ok, data, message: '' };
}

function fail (retcode: number, message: string): OB12ActionResponse<null> {
  return { status: 'failed', retcode, data: null, message };
}

export class OneBot12Bridge {
  private readonly options: OneBot12BridgeOptions;
  private readonly recentEvents: OB12Event[] = [];
  private readonly maxRecent: number;

  constructor (options: OneBot12BridgeOptions) {
    this.options = options;
    this.maxRecent = options.maxRecentEvents ?? 100;
  }

  get selfId (): string {
    const id = this.options.selfId;
    return typeof id === 'function' ? id() : id;
  }

  get adapterName (): string {
    return this.options.adapterName ?? 'onebot12';
  }

  get config (): unknown {
    return this.options.config ?? {};
  }

  /** 元动作 get_version 的数据，也用于握手时自报家门 */
  get versionInfo (): OB12VersionInfo {
    return {
      impl: this.options.implName ?? 'snowcat',
      version: this.options.implVersion ?? '0.0.1',
      onebot_version: OB12_STANDARD_VERSION,
    };
  }

  /**
   * 处理一条动作请求。返回的响应已按 12 的规范整形好：
   * 成功时 status=ok 且 message 为空串；失败时 status=failed 且 data=null。
   */
  async dispatch (request: OB12ActionRequest): Promise<OB12ActionResponse<unknown>> {
    if (!request || typeof request.action !== 'string' || request.action.length === 0) {
      return fail(OB12RetCode.BadRequest, 'action 缺失或不是字符串');
    }
    const action = request.action;
    const params = rec(request.params);
    const response = await this.dispatchInner(action, params);
    // echo 非空时必须原样带回
    if (typeof request.echo === 'string' && request.echo.length > 0) {
      response.echo = request.echo;
    }
    return response;
  }

  /** 传入一行原始 JSON，返回一行原始 JSON。解析失败按 10001 处理，不抛异常。 */
  async handleLine (line: string): Promise<string> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return JSON.stringify(fail(OB12RetCode.BadRequest, '请求不是合法 JSON'));
    }
    if (typeof parsed !== 'object' || parsed === null) {
      return JSON.stringify(fail(OB12RetCode.BadRequest, '请求必须是对象'));
    }
    const raw = parsed as Record<string, unknown>;
    const request: OB12ActionRequest = {
      action: typeof raw['action'] === 'string' ? raw['action'] : '',
      params: rec(raw['params']),
      echo: typeof raw['echo'] === 'string' ? raw['echo'] : undefined,
    };
    return JSON.stringify(await this.dispatch(request));
  }

  private async dispatchInner (
    action: string, params: Record<string, unknown>
  ): Promise<OB12ActionResponse<unknown>> {
    if ((BUILTIN_ACTIONS as readonly string[]).includes(action)) {
      if (action === 'get_supported_actions') {
        return ok(SUPPORTED_ACTIONS.slice());
      }
      return this.getLatestEvents(params);
    }

    const built = buildRequest(action, params);
    if (!built.ok) {
      return fail(built.retcode, built.message);
    }

    const handler = this.options.actions.get(built.v11Action);
    if (!handler) {
      return fail(OB12RetCode.UnsupportedAction, `底层未实现 ${built.v11Action}`);
    }

    try {
      const ret = await handler.websocketHandle(
        built.v11Params, '', this.adapterName, this.config
      );
      return translateResponse(action, ret, { selfId: this.selfId, config: this.config });
    } catch (e) {
      return fail(
        OB12RetCode.InternalHandlerError,
        e instanceof Error ? e.message : String(e)
      );
    }
  }

  /** 仅 HTTP 轮询必须支持；这里不做长轮询等待，timeout 大于 0 时也立即返回当前缓冲 */
  private getLatestEvents (params: Record<string, unknown>): OB12ActionResponse<unknown> {
    const rawLimit = Number(params['limit'] ?? 0);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 0;
    const events = limit > 0 ? this.recentEvents.slice(-limit) : this.recentEvents.slice();
    return ok(events);
  }

  /**
   * v11 事件 → v12 事件，同时放进本地缓冲供 get_latest_events 取用。
   * 返回 null 表示这条在 12 里没有对应形态，调用方直接丢弃即可。
   */
  convertEvent (event: V11EventLike): OB12Event | null {
    const converted = toOB12Event(event);
    if (converted) {
      this.recentEvents.push(converted);
      if (this.recentEvents.length > this.maxRecent) {
        this.recentEvents.splice(0, this.recentEvents.length - this.maxRecent);
      }
    }
    return converted;
  }

  /** 主动推送用：把 v11 事件整形成一行 JSON，没有对应形态时返回 null */
  convertEventToLine (event: V11EventLike): string | null {
    const converted = this.convertEvent(event);
    return converted ? JSON.stringify(converted) : null;
  }

  /** 12 的 meta 事件：连接建立时发 meta.connect */
  buildConnectEvent (): OB12Event {
    return {
      id: `${Date.now().toString(16)}-connect`,
      time: Date.now() / 1000,
      type: 'meta',
      detail_type: 'connect',
      sub_type: '',
      version: this.versionInfo,
    } as unknown as OB12Event;
  }

  buildHeartbeatEvent (intervalMs: number, online: boolean): OB12Event {
    return {
      id: `${Date.now().toString(16)}-heartbeat`,
      time: Date.now() / 1000,
      type: 'meta',
      detail_type: 'heartbeat',
      sub_type: '',
      interval: intervalMs,
      status: { good: online, bots: [{ self: { platform: OB12_PLATFORM, user_id: this.selfId }, online }] },
    } as unknown as OB12Event;
  }
}
