import { Type, Static } from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';
import { Value } from '@sinclair/typebox/value';
export type MessageFormat = 'array' | 'string';
/** OneBot 协议版本。v11 已弃用，仅保留兼容期，新接入请用 v12 */
export type OneBotProtocol = 'v11' | 'v12';

const HttpServerConfigSchema = Type.Object({
  name: Type.String({ default: 'http-server' }),
  protocol: Type.String({ default: 'v12', description: 'OneBot 协议版本：v12（默认）或 v11（已弃用）' }),
  enable: Type.Boolean({ default: false }),
  port: Type.Number({ default: 3000 }),
  host: Type.String({ default: '127.0.0.1' }),
  enableCors: Type.Boolean({ default: true }),
  enableWebsocket: Type.Boolean({ default: false }),
  messagePostFormat: Type.String({ default: 'array' }),
  token: Type.String({ default: '' }),
  debug: Type.Boolean({ default: false }),
});

const HttpSseServerConfigSchema = Type.Object({
  name: Type.String({ default: 'http-sse-server' }),
  protocol: Type.String({ default: 'v12', description: 'OneBot 协议版本：v12（默认）或 v11（已弃用）' }),
  enable: Type.Boolean({ default: false }),
  port: Type.Number({ default: 3000 }),
  host: Type.String({ default: '127.0.0.1' }),
  enableCors: Type.Boolean({ default: true }),
  enableWebsocket: Type.Boolean({ default: false }),
  messagePostFormat: Type.String({ default: 'array' }),
  token: Type.String({ default: '' }),
  debug: Type.Boolean({ default: false }),
  reportSelfMessage: Type.Boolean({ default: false }),
});

const HttpClientConfigSchema = Type.Object({
  name: Type.String({ default: 'http-client' }),
  protocol: Type.String({ default: 'v12', description: 'OneBot 协议版本：v12（默认）或 v11（已弃用）' }),
  enable: Type.Boolean({ default: false }),
  url: Type.String({ default: 'http://localhost:8080' }),
  messagePostFormat: Type.String({ default: 'array' }),
  reportSelfMessage: Type.Boolean({ default: false }),
  token: Type.String({ default: '' }),
  debug: Type.Boolean({ default: false }),
});

const WebsocketServerConfigSchema = Type.Object({
  name: Type.String({ default: 'websocket-server' }),
  protocol: Type.String({ default: 'v12', description: 'OneBot 协议版本：v12（默认）或 v11（已弃用）' }),
  enable: Type.Boolean({ default: false }),
  host: Type.String({ default: '127.0.0.1' }),
  port: Type.Number({ default: 3001 }),
  messagePostFormat: Type.String({ default: 'array' }),
  reportSelfMessage: Type.Boolean({ default: false }),
  token: Type.String({ default: '' }),
  enableForcePushEvent: Type.Boolean({ default: true }),
  debug: Type.Boolean({ default: false }),
  heartInterval: Type.Number({ default: 30000 }),
});

const WebsocketClientConfigSchema = Type.Object({
  name: Type.String({ default: 'websocket-client' }),
  protocol: Type.String({ default: 'v12', description: 'OneBot 协议版本：v12（默认）或 v11（已弃用）' }),
  enable: Type.Boolean({ default: false }),
  url: Type.String({ default: 'ws://localhost:8082' }),
  messagePostFormat: Type.String({ default: 'array' }),
  reportSelfMessage: Type.Boolean({ default: false }),
  reconnectInterval: Type.Number({ default: 5000 }),
  token: Type.String({ default: '' }),
  debug: Type.Boolean({ default: false }),
  heartInterval: Type.Number({ default: 30000 }),
  verifyCertificate: Type.Optional(Type.Boolean({ default: true })),
});

const PluginConfigSchema = Type.Object({
  name: Type.String({ default: 'plugin' }),
  enable: Type.Boolean({ default: false }),
  messagePostFormat: Type.String({ default: 'array' }),
  reportSelfMessage: Type.Boolean({ default: false }),
  debug: Type.Boolean({ default: false }),
});

const McpServerConfigSchema = Type.Object({
  name: Type.String({ default: 'mcp-server' }),
  enable: Type.Boolean({ default: false }),
  host: Type.String({ default: '127.0.0.1' }),
  port: Type.Number({ default: 3002 }),
  token: Type.String({ default: '' }),
  debug: Type.Boolean({ default: false }),
});

// Milky 协议服务端配置（milky.ntqqrev.org v1.3，默认关闭）
const MilkyServerConfigSchema = Type.Object({
  name: Type.String({ default: 'milky-server' }),
  enable: Type.Boolean({ default: false }),
  host: Type.String({ default: '127.0.0.1' }),
  port: Type.Number({ default: 3100 }),
  token: Type.String({ default: '' }),
  enableCors: Type.Boolean({ default: true }),
  enableWebsocket: Type.Boolean({ default: false }),
  webhooks: Type.Array(Type.String(), { default: [] }),
  debug: Type.Boolean({ default: false }),
});

const NetworkConfigSchema = Type.Object({
  httpServers: Type.Array(HttpServerConfigSchema, { default: [] }),
  httpSseServers: Type.Array(HttpSseServerConfigSchema, { default: [] }),
  httpClients: Type.Array(HttpClientConfigSchema, { default: [] }),
  websocketServers: Type.Array(WebsocketServerConfigSchema, { default: [] }),
  websocketClients: Type.Array(WebsocketClientConfigSchema, { default: [] }),
  mcpServers: Type.Optional(Type.Array(McpServerConfigSchema, { default: [] })),
  milkyServers: Type.Optional(Type.Array(MilkyServerConfigSchema, { default: [] })),
  plugins: Type.Array(PluginConfigSchema, { default: [] }),
}, { default: {} });

const TimeoutConfigSchema = Type.Object({
  baseTimeout: Type.Number({ default: 10000 }),
  uploadSpeedKBps: Type.Number({ default: 256 }),
  downloadSpeedKBps: Type.Number({ default: 256 }),
  maxTimeout: Type.Number({ default: 1800000 }),
}, { default: {} });

export const OneBotConfigSchema = Type.Object({
  network: NetworkConfigSchema,
  musicSignUrl: Type.String({ default: '' }),
  enableLocalFile2Url: Type.Boolean({ default: false }),
  parseMultMsg: Type.Boolean({ default: false }),
  imageDownloadProxy: Type.String({ default: '' }),
  timeout: TimeoutConfigSchema,
});

export type OneBotConfig = Static<typeof OneBotConfigSchema>;
export type HttpServerConfig = Static<typeof HttpServerConfigSchema>;
export type HttpSseServerConfig = Static<typeof HttpSseServerConfigSchema>;
export type HttpClientConfig = Static<typeof HttpClientConfigSchema>;
export type WebsocketServerConfig = Static<typeof WebsocketServerConfigSchema>;
export type WebsocketClientConfig = Static<typeof WebsocketClientConfigSchema>;
export type PluginConfig = Static<typeof PluginConfigSchema>;
export type McpServerConfig = Static<typeof McpServerConfigSchema>;
export type MilkyServerConfig = Static<typeof MilkyServerConfigSchema>;

export type NetworkAdapterConfig = HttpServerConfig | HttpSseServerConfig | HttpClientConfig | WebsocketServerConfig | WebsocketClientConfig | McpServerConfig | MilkyServerConfig | PluginConfig;
export type NetworkConfigKey = keyof OneBotConfig['network'];

export function loadConfig (config: Partial<OneBotConfig>): OneBotConfig {
  let data = config;
  data = Value.Parse(OneBotConfigSchema, data) as Partial<OneBotConfig>;
  const validate = TypeCompiler.Compile(OneBotConfigSchema);
  const valid = validate.Check(data);
  if (!valid) {
    const errorMsg = [...validate.Errors(data)].map(e => e.message).join(', ');
    throw new Error(errorMsg);
  }
  return data as OneBotConfig;
}

export function calculateTimeout (
  config: OneBotConfig['timeout'],
  dataSizeBytes: number,
  speedKBps: number
): number {
  return Math.min(
    config.baseTimeout + (dataSizeBytes / 1024 / Math.max(speedKBps, 1) * 1000),
    config.maxTimeout
  );
}

export function capTimeout (
  config: OneBotConfig['timeout'],
  timeoutMs: number
): number {
  return Math.min(timeoutMs, config.maxTimeout);
}
