type OneBotProtocol = 'v11' | 'v12';

interface AdapterConfigInner {
  name: string;
  enable: boolean;
  debug: boolean;
  token: string;
}

interface AdapterConfig extends AdapterConfigInner {
  [key: string]: string | boolean | number;
}

type MessageFormat = 'array' | 'string';

interface HttpServerConfig extends AdapterConfig {
  protocol: 'v11' | 'v12';
  port: number;
  host: string;
  enableCors: boolean;
  enableWebsocket: boolean;
  messagePostFormat: MessageFormat;
}

interface HttpClientConfig extends AdapterConfig {
  protocol: 'v11' | 'v12';
  url: string;
  messagePostFormat: MessageFormat;
  reportSelfMessage: boolean;
}

interface WebsocketServerConfig extends AdapterConfig {
  protocol: 'v11' | 'v12';
  host: string;
  port: number;
  messagePostFormat: MessageFormat;
  reportSelfMessage: boolean;
  enableForcePushEvent: boolean;
  heartInterval: number;
}

interface WebsocketClientConfig extends AdapterConfig {
  protocol: 'v11' | 'v12';
  url: string;
  messagePostFormat: MessageFormat;
  reportSelfMessage: boolean;
  reconnectInterval: number;
  token: string;
  debug: boolean;
  heartInterval: number;
  verifyCertificate?: boolean;
}

interface HttpSseServerConfig extends HttpServerConfig {
  reportSelfMessage: boolean;
}

interface McpServerConfig extends AdapterConfig {
  host: string;
  port: number;
}

interface NetworkConfig {
  httpServers: Array<HttpServerConfig>;
  httpClients: Array<HttpClientConfig>;
  httpSseServers: Array<HttpSseServerConfig>;
  websocketServers: Array<WebsocketServerConfig>;
  websocketClients: Array<WebsocketClientConfig>;
  mcpServers: Array<McpServerConfig>;
}

interface TimeoutConfig {
  baseTimeout: number;
  uploadSpeedKBps: number;
  downloadSpeedKBps: number;
  maxTimeout: number;
}

interface OneBotConfig {
  network: NetworkConfig; // 网络配置
  musicSignUrl: string; // 音乐签名地址
  enableLocalFile2Url: boolean;
  parseMultMsg: boolean;
  imageDownloadProxy: string; // 图片下载代理地址
  timeout: TimeoutConfig; // 超时预测配置
}
