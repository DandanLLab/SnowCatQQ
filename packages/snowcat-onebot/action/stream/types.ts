/**
 * Stream 类型与枚举（从 StreamBasic.ts 上移，切断 OneBotAction ↔ StreamBasic
 * 的模块循环：OneBotAction 只需要这里的类型与枚举，BasicStream 继承 OneBotAction；
 * 两文件都改从本模块导入后循环消失）。
 */
export type StreamPacketBasic = {
  type: StreamStatus;
  data_type?: string;
};

export type StreamPacket<T> = T & StreamPacketBasic;

export enum StreamStatus {
  Stream = 'stream', // 分片流数据包
  Response = 'response', // 流最终响应
  Reset = 'reset', // 重置流
  Error = 'error', // 流错误
}
