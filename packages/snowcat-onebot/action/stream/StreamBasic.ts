import { OneBotAction, OneBotRequestToolkit } from '../OneBotAction';
import { NetworkAdapterConfig } from '@/snowcat-onebot/config/config';
import type { StreamPacket } from './types';

// 类型与枚举本体在 ./types（从本文件上移，切断 OneBotAction ↔ StreamBasic 循环）
export { StreamStatus, StreamPacketBasic } from './types';
export type { StreamPacket } from './types';

export abstract class BasicStream<T, R> extends OneBotAction<T, StreamPacket<R>> {
  abstract override _handle (_payload: T, _adaptername: string, _config: NetworkAdapterConfig, req: OneBotRequestToolkit): Promise<StreamPacket<R>>;
}
