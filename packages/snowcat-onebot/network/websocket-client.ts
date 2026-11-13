import { OB11EmitEventContent, OB11NetworkReloadType } from '@/snowcat-onebot/network/index';
import { RawData, WebSocket } from 'ws';
import { OB11HeartbeatEvent } from '@/snowcat-onebot/event/meta/OB11HeartbeatEvent';
import { SnowCatCore } from 'snowcat-core';
import { ActionName } from '@/snowcat-onebot/action/router';
import { OB11Response } from '@/snowcat-onebot/action/OneBotAction';
import { LifeCycleSubType, OB11LifeCycleEvent } from '@/snowcat-onebot/event/meta/OB11LifeCycleEvent';
import { WebsocketClientConfig } from '@/snowcat-onebot/config/config';
import { IOB11NetworkAdapter } from '@/snowcat-onebot/network/adapter';
import json5 from 'json5';
import { OneBot12Bridge } from '@/snowcat-onebot/onebot12/bridge';
import type { ActionMapLike } from '@/snowcat-onebot/onebot12/actions';
import type { V11EventLike } from '@/snowcat-onebot/onebot12/events';

export class OB11WebSocketClientAdapter extends IOB11NetworkAdapter<WebsocketClientConfig> {
  private connection: WebSocket | null = null;
  private heartbeatRef: NodeJS.Timeout | null = null;
  private firstConnectDelayed: boolean = false;
  private bridgeInstance: OneBot12Bridge | null = null;
  private bridgeConfigRef: unknown = null;

  private get bridge (): OneBot12Bridge | null {
    if (this.config.protocol === 'v11') {
      return null;
    }
    if (!this.bridgeInstance || this.bridgeConfigRef !== this.config) {
      this.bridgeInstance = new OneBot12Bridge({
        actions: this.actions as unknown as ActionMapLike,
        selfId: () => String(this.core.selfInfo.uin ?? ''),
        adapterName: this.name,
        config: this.config,
        implName: 'snowcat',
      });
      this.bridgeConfigRef = this.config;
    }
    return this.bridgeInstance;
  }

  override get isActive (): boolean {
    return this.isEnable && !!this.connection && this.connection.readyState === WebSocket.OPEN;
  }

  async onEvent<T extends OB11EmitEventContent> (event: T) {
    const payload = this.bridge
      ? this.bridge.convertEvent(event as unknown as V11EventLike)
      : event;
    if (!payload) {
      return;
    }
    if (this.connection && this.connection.readyState === WebSocket.OPEN) {
      this.connection.send(JSON.stringify(payload));
    }
  }

  async open () {
    if (this.connection) {
      return;
    }
    if (this.config.heartInterval > 0) {
      this.heartbeatRef = setInterval(() => {
        if (this.connection && this.connection.readyState === WebSocket.OPEN) {
          const beat = this.bridge
            ? this.bridge.buildHeartbeatEvent(this.config.heartInterval, this.core.selfInfo.online ?? true)
            : new OB11HeartbeatEvent(this.core, this.config.heartInterval, this.core.selfInfo.online ?? true, true);
          this.connection.send(JSON.stringify(beat));
        }
      }, this.config.heartInterval);
    }
    this.isEnable = true;
    try {
      await this.tryConnect();
    } catch (error) {
      this.logger.logError('[OneBot] [WebSocket Client] TryConnect Error , info -> ', error);
    }
  }

  close () {
    if (!this.isEnable) {
      this.logger.logDebug('Cannot close a closed WebSocket connection');
      return;
    }
    this.isEnable = false;
    if (this.connection) {
      this.connection.close();
      this.connection = null;
    }
    if (this.heartbeatRef) {
      clearInterval(this.heartbeatRef);
      this.heartbeatRef = null;
    }
  }

  private async checkStateAndReply<T> (data: T) {
    return new Promise<void>((resolve, reject) => {
      if (this.connection && this.connection.readyState === WebSocket.OPEN) {
        this.connection.send(JSON.stringify(data));
        resolve();
      } else {
        reject(new Error('WebSocket is not open'));
      }
    });
  }

  private async tryConnect () {
    if (!this.connection && this.isEnable) {
      let isClosedByError = false;
      // 启动首发连接延后 3 秒：QQ 刚拉起时 dsh 侧 8082 服务可能还没完成监听，
      // 立刻连会撞握手超时产生 2~3 条 ERROR 噪音，延后首发即可静默闭合
      if (!this.firstConnectDelayed) {
        this.firstConnectDelayed = true;
        await new Promise(resolve => setTimeout(resolve, 3000));
        if (!this.isEnable) return;
      }

      const wsOptions: WebSocket.ClientOptions = {
        maxPayload: 50 * 1024 * 1024, // 50 MB
        handshakeTimeout: 2000,
        perMessageDeflate: false,
        headers: {
          'X-Self-ID': this.core.selfInfo.uin,
          Authorization: `Bearer ${this.config.token}`,
          'x-client-role': 'Universal',  // 为koishi adpter适配
          'User-Agent': 'OneBot/11',
        },
      };

      // 如果配置了 verifyCertificate，设置 rejectUnauthorized
      if (this.config.verifyCertificate !== undefined) {
        wsOptions.rejectUnauthorized = this.config.verifyCertificate;
      }

      this.connection = new WebSocket(this.config.url, wsOptions);
      this.connection.on('pong', () => {
        // this.logger.logDebug('[OneBot] [WebSocket Client] 收到pong');
      });
      this.connection.on('open', () => {
        try {
          this.connectEvent(this.core).catch(e => this.logger.logError('[OneBot] [WebSocket Client] 发送连接生命周期失败', e));
        } catch (e) {
          this.logger.logError('[OneBot] [WebSocket Client] 发送连接生命周期失败', e);
        }
      });
      this.connection.on('message', (data) => {
        this.handleMessage(data);
      });
      this.connection.once('close', () => {
        if (!isClosedByError) {
          this.logger.logError(`[OneBot] [WebSocket Client] 反向WebSocket (${this.config.url}) 连接意外关闭`);
          this.logger.logError(`[OneBot] [WebSocket Client] 在 ${Math.floor(this.config.reconnectInterval / 1000)} 秒后尝试重新连接`);
          if (this.isEnable) {
            this.connection = null;
            setTimeout(() => this.tryConnect(), this.config.reconnectInterval);
          }
        }
      });
      this.connection.on('error', (err) => {
        isClosedByError = true;
        this.logger.logError(`[OneBot] [WebSocket Client] 反向WebSocket (${this.config.url}) 连接错误`, err);
        this.logger.logError(`[OneBot] [WebSocket Client] 在 ${Math.floor(this.config.reconnectInterval / 1000)} 秒后尝试重新连接`);
        if (this.isEnable) {
          this.connection = null;
          setTimeout(() => this.tryConnect(), this.config.reconnectInterval);
        }
      });
    }
  }

  async connectEvent (core: SnowCatCore) {
    try {
      await this.checkStateAndReply<unknown>(new OB11LifeCycleEvent(core, LifeCycleSubType.CONNECT));
    } catch (e) {
      this.logger.logError('[OneBot] [WebSocket Client] 发送生命周期失败', e);
    }
  }

  private async handleMessage (message: RawData) {
    const bridge = this.bridge;
    if (bridge) {
      const line = await bridge.handleLine(message.toString());
      await this.checkStateAndReply<unknown>(JSON.parse(line) as unknown);
      return;
    }
    let receiveData: { action: typeof ActionName[keyof typeof ActionName], params?: any, echo?: any; } = { action: ActionName.Unknown, params: {} };
    let echo;

    try {
      receiveData = json5.parse(message.toString());
      echo = receiveData.echo;
      this.logger.logDebug('[OneBot] [WebSocket Client] 收到正向Websocket消息', receiveData);
    } catch {
      await this.checkStateAndReply<unknown>(OB11Response.error('json解析失败,请检查数据格式', 1400, echo));
      return;
    }
    receiveData.params = (receiveData?.params) ? receiveData.params : {};// 兼容类型验证

    const action = this.actions.get(receiveData.action as any);
    if (!action) {
      this.logger.logError('[OneBot] [WebSocket Client] 发生错误', '不支持的Api ' + receiveData.action);
      await this.checkStateAndReply<unknown>(OB11Response.error('不支持的Api ' + receiveData.action, 1404, echo));
      return;
    }
    const retdata = await action.websocketHandle(receiveData.params, echo ?? '', this.name, this.config, {
      send: async (data: object) => {
        await this.checkStateAndReply<unknown>({ ...OB11Response.ok(data, echo ?? '', true) });
      },
    });
    await this.checkStateAndReply<unknown>({ ...retdata });
  }

  async reload (newConfig: WebsocketClientConfig) {
    const wasEnabled = this.isEnable;
    const oldUrl = this.config.url;
    const oldHeartInterval = this.config.heartInterval;
    this.config = newConfig;

    if (newConfig.enable && !wasEnabled) {
      this.open();
      return OB11NetworkReloadType.NetWorkOpen;
    } else if (!newConfig.enable && wasEnabled) {
      this.close();
      return OB11NetworkReloadType.NetWorkClose;
    }

    if (oldUrl !== newConfig.url) {
      this.close();
      if (newConfig.enable) {
        this.open();
      }
      return OB11NetworkReloadType.NetWorkReload;
    }

    if (oldHeartInterval !== newConfig.heartInterval) {
      if (this.heartbeatRef) {
        clearInterval(this.heartbeatRef);
        this.heartbeatRef = null;
      }
      if (newConfig.heartInterval > 0 && this.isEnable) {
        this.heartbeatRef = setInterval(() => {
          if (this.connection && this.connection.readyState === WebSocket.OPEN) {
            this.connection.send(JSON.stringify(new OB11HeartbeatEvent(this.core, newConfig.heartInterval, this.core.selfInfo.online ?? true, true)));
          }
        }, newConfig.heartInterval);
      }
      return OB11NetworkReloadType.NetWorkReload;
    }

    return OB11NetworkReloadType.Normal;
  }
}
