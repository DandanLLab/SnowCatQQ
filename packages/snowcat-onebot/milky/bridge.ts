/**
 * Milky 桥。
 *
 * 与 onebot12/bridge.ts 同一模式：不关心传输，HTTP / SSE / WS / WebHook 拿到
 * 一条请求丢进来，拿一条 Milky 响应回去；事件侧统一走 convertEvent 整形。
 */
import { MilkyEventEnvelope, MilkyResponse } from './types';
import { ActionMapLike, buildMilkyRequest, translateMilkyResponse, MilkyTranslateContext } from './actions';
import { MilkyV11EventLike, toMilkyEvent } from './events';

export interface MilkyBridgeOptions {
  actions: ActionMapLike;
  selfId: number | (() => number);
  adapterName?: string;
  config?: unknown;
  implName?: string;
  implVersion?: string;
}

export class MilkyBridge {
  private readonly options: MilkyBridgeOptions;

  constructor (options: MilkyBridgeOptions) {
    this.options = options;
  }

  get selfId (): number {
    const id = this.options.selfId;
    return typeof id === 'function' ? id() : id;
  }

  get adapterName (): string {
    return this.options.adapterName ?? 'milky';
  }

  get config (): unknown {
    return this.options.config ?? {};
  }

  get versionInfo (): Record<string, string> {
    return {
      impl: this.options.implName ?? 'snowcat',
      version: this.options.implVersion ?? '0.0.1',
      milky_version: '1.3.0',
    };
  }

  /**
   * 处理一条 /api/:api 请求。返回的响应已按 Milky 规范整形：
   * 成功时 status=ok retcode=0；失败时 data=null 并带 message。
   */
  async dispatch (api: string, payload: Record<string, unknown>): Promise<MilkyResponse<unknown>> {
    const ctx: MilkyTranslateContext = { selfId: this.selfId, config: this.config };
    const built = buildMilkyRequest(api, payload);
    if (!built.ok) {
      return { status: 'failed', retcode: built.retcode, data: null, message: built.message };
    }
    const handler = this.options.actions.get(built.v11Action);
    if (!handler) {
      return { status: 'failed', retcode: -404, data: null, message: `底层未实现 ${built.v11Action}` };
    }
    try {
      const ret = await handler.websocketHandle(built.v11Params, '', this.adapterName, this.config);
      return translateMilkyResponse(api, ret, ctx);
    } catch (e) {
      return {
        status: 'failed',
        retcode: -500,
        data: null,
        message: e instanceof Error ? e.message : String(e),
      };
    }
  }

  /**
   * v11 事件 → Milky 事件信封。
   * 返回 null 表示这条在 Milky v1.3 里没有对应形态，调用方直接丢弃。
   */
  convertEvent (event: MilkyV11EventLike): MilkyEventEnvelope | null {
    return toMilkyEvent(event);
  }
}
