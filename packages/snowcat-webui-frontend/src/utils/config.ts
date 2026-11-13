/**
 * OneBot 配置归一化。
 *
 * 后端在不同版本 / 便携版 / 首次启动时可能返回残缺的 network 字段
 * （例如老后端没有 mcpServers），前端直接 `.map` 会抛
 * `Cannot read properties of undefined (reading 'map')` 并整页白屏。
 * 这里统一补齐结构，保证 UI 侧拿到的一定是完整可迭代的对象。
 */

const NETWORK_KEYS = [
  'httpServers',
  'httpClients',
  'httpSseServers',
  'websocketServers',
  'websocketClients',
  'mcpServers',
  'milkyServers',
] as const;

export type NetworkKey = (typeof NETWORK_KEYS)[number];

const DEFAULT_TIMEOUT: TimeoutConfig = {
  baseTimeout: 10000,
  uploadSpeedKBps: 256,
  downloadSpeedKBps: 256,
  maxTimeout: 1800000,
};

const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

/** 单条网络配置至少要有可用的 name，否则排序 / key / 查找全部会崩 */
const normalizeItem = (item: unknown): Record<string, unknown> => {
  if (!item || typeof item !== 'object') {
    return { name: '' };
  }

  const record = item as Record<string, unknown>;

  return {
    ...record,
    name: typeof record['name'] === 'string' ? record['name'] : '',
    enable: record['enable'] === true,
    debug: record['debug'] === true,
  };
};

export const normalizeOneBotConfig = (
  raw?: Partial<OneBotConfig> | null
): OneBotConfig => {
  const source = (raw ?? {}) as Partial<OneBotConfig>;
  const sourceNetwork = (source.network ?? {}) as Partial<NetworkConfig>;
  const network = {} as NetworkConfig;

  for (const key of NETWORK_KEYS) {
    // 用 Record 绕开每个字段各自不同的联合类型，归一化后仍满足 NetworkConfig 约束
    (network as unknown as Record<string, unknown>)[key] = asArray(
      sourceNetwork[key]
    ).map(normalizeItem);
  }

  return {
    network,
    musicSignUrl: typeof source.musicSignUrl === 'string' ? source.musicSignUrl : '',
    enableLocalFile2Url: source.enableLocalFile2Url === true,
    parseMultMsg: source.parseMultMsg !== false,
    imageDownloadProxy: typeof source.imageDownloadProxy === 'string' ? source.imageDownloadProxy : '',
    timeout: { ...DEFAULT_TIMEOUT, ...(source.timeout ?? {}) },
  };
};

/** 取 network 字段，永远返回数组 */
export const getNetworkList = <T extends NetworkKey> (
  config: OneBotConfig | undefined,
  key: T
): OneBotConfig['network'][T] => {
  const list = config?.network?.[key];

  return (Array.isArray(list) ? list : []) as OneBotConfig['network'][T];
};

export { NETWORK_KEYS };
