import { OB11EmitEventContent, OB11NetworkReloadType } from '@/snowcat-onebot/network/index';
import { createHmac } from 'crypto';
import { QuickAction, QuickActionEvent } from '@/snowcat-onebot/types';
import { RequestUtil } from 'snowcat-common/src/request';
import { HttpClientConfig } from '@/snowcat-onebot/config/config';
import { IOB11NetworkAdapter } from '@/snowcat-onebot/network/adapter';
import json5 from 'json5';
import { OneBot12Bridge } from '@/snowcat-onebot/onebot12/bridge';
import type { ActionMapLike } from '@/snowcat-onebot/onebot12/actions';
import type { V11EventLike } from '@/snowcat-onebot/onebot12/events';

export class OB11HttpClientAdapter extends IOB11NetworkAdapter<HttpClientConfig> {
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

  async onEvent<T extends OB11EmitEventContent> (event: T) {
    this.emitEventAsync(event).catch(e => this.logger.logError('[OneBot] [Http Client] 新消息事件HTTP上报返回快速操作失败', e));
  }

  async emitEventAsync<T extends OB11EmitEventContent> (event: T) {
    if (!this.isEnable) return;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-self-id': this.core.selfInfo.uin,
    };

    // 12 没有 quick operation，v12 模式下只上报事件，不解析响应
    const payload = this.bridge
      ? this.bridge.convertEvent(event as unknown as V11EventLike)
      : event;
    if (!payload) {
      return;
    }
    const msgStr = JSON.stringify(payload);
    if (this.config.token) {
      const hmac = createHmac('sha1', this.config.token);
      hmac.update(msgStr);
      headers['x-signature'] = 'sha1=' + hmac.digest('hex');
    }

    const data = await RequestUtil.HttpGetText(this.config.url, 'POST', msgStr, headers);
    if (this.bridge) {
      return;
    }
    const resJson: QuickAction = data ? json5.parse(data) : {};

    await this.obContext.apis.QuickActionApi.handleQuickOperation(event as QuickActionEvent, resJson);
  }

  open () {
    this.isEnable = true;
  }

  close () {
    this.isEnable = false;
  }

  async reload (newConfig: HttpClientConfig) {
    const wasEnabled = this.isEnable;
    const oldUrl = this.config.url;
    this.config = newConfig;

    if (newConfig.enable && !wasEnabled) {
      this.open();
      return OB11NetworkReloadType.NetWorkOpen;
    } else if (!newConfig.enable && wasEnabled) {
      this.close();
      return OB11NetworkReloadType.NetWorkClose;
    }

    if (oldUrl !== newConfig.url) {
      return OB11NetworkReloadType.NetWorkReload;
    }

    return OB11NetworkReloadType.Normal;
  }
}
