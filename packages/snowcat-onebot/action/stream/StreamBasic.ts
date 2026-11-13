import { OneBotAction, OneBotRequestToolkit } from '../OneBotAction';
import { NetworkAdapterConfig } from '@/snowcat-onebot/config/config';
import type { StreamPacket } from './types';

// 类型与枚举本体在 ./types（从本文件上移，切断 OneBotAction ↔ StreamBasic 循环）
// 注意：StreamPacketBasic 是纯类型，必须用 export type 重导出——纯 ESM 下
// `export { Type } from` 会当值导入并报 named export 不存在（打包器容忍的坑）。
export { StreamStatus } from './types';
export type { StreamPacket, StreamPacketBasic } from './types';

export abstract class BasicStream<T, R> extends OneBotAction<T, StreamPacket<R>> {
  abstract override _handle (_payload: T, _adaptername: string, _config: NetworkAdapterConfig, req: OneBotRequestToolkit): Promise<StreamPacket<R>>;
}
