import { NodeIKernelStorageCleanListener } from '@/snowcat-core/listeners';
import { GeneralCallResult } from './common';

export interface NodeIKernelStorageCleanService {

  addKernelStorageCleanListener (listener: NodeIKernelStorageCleanListener): number;

  removeKernelStorageCleanListener (listenerId: number): void;
  // 内核侧实测调用样例（路径为 <QQ数据目录> 下的相对段，实际值由运行时探测，随机器与账号不同）：
  // [
  // "hotUpdate",
  // [
  //   "<QQ数据目录>\\packages"
  // ]
  // ],
  // [
  // "tmp",
  // [
  //   "<QQ数据目录>\\tmp"
  // ]
  // ],
  // [
  // "SilentCacheappSessionPartation9212",
  // [
  //   "<QQ数据目录>\\Partitions\\qqnt_9212"
  // ]
  // ]
  addCacheScanedPaths (paths: Map<'tmp' | 'SilentCacheappSessionPartation9212' | 'hotUpdate', unknown>): unknown;

  addFilesScanedPaths (arg: unknown): unknown;

  scanCache (): Promise<GeneralCallResult & {
    size: string[];
  }>;

  addReportData (arg: unknown): unknown;

  reportData (): unknown;

  getChatCacheInfo (tableType: number, pageSize: number, order: number, startPosition: number): Promise<unknown>;

  getFileCacheInfo (fileType: number, restart: boolean, pageSize: number, lastRecord: number, param: unknown): Promise<unknown>;

  clearChatCacheInfo (chatInfoList: unknown[], clearKeys: number[]): Promise<unknown>;

  clearCacheDataByKeys (keys: Array<string>): Promise<GeneralCallResult>;

  setSilentScan (isSilent: boolean): unknown;

  closeCleanWindow (): unknown;

  clearAllChatCacheInfo (): unknown;

  endScan (arg: unknown): unknown;

  addNewDownloadOrUploadFile (arg: unknown): unknown;

  isNull (): boolean;
}
