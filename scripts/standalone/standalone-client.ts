/**
 * 独立客户端模式入口（standalone client entry）。
 *
 * 目标：雪猫本体作为独立协议端进程跑起来——不依赖 QQ Electron 壳、
 * 不依赖 QQ 登录态、不加载 wrapper.node，只装配协议皮（OneBot12 + Milky）
 * 与生产网络层，对外暴露标准协议通道。
 *
 * 装配链（与 InitOneBot 生产路径同一批真实代码）：
 *   NapCatOneBot11Adapter 全装配
 *   = configLoader（onebot11 配置读写）+ ActionMap（全部动作真实现）
 *     + OB11NetworkManager（适配器注册/开停/热重载）
 *     + OneBot12 桥（v12 协议翻译）+ Milky 桥（v1.3 协议翻译）+ 鉴权。
 *
 * mock 部分只有两块：
 *   1) SnowCatCore 外壳：selfInfo（uin/nick）与 context.logger，
 *      ActionMap 动作在独立模式下不触 QQ API 域的仅直接工作，
 *      触 QQ API 的动作返回明确错误（协议层可见，不静默）。
 *   2) context.session：空 listener 容器（InitOneBot 注册内核监听用）。
 *
 * 运行（仓库根）：
 *   npx tsx scripts/standalone/standalone-client.ts
 *   npx tsx scripts/standalone/standalone-client.ts --port-ob12 3001 --port-milky 3100 --port-http 3000 --token <tok>
 *
 * 通道产物：
 *   OneBot12 ws-server :3001（meta.connect 握手 + heartbeat + 动作）
 *   OneBot12 http-server :3000（v12 POST /:action）
 *   Milky :3100（POST /api/:api + GET /event SSE，Bearer token 鉴权）
 */

// ---------- 参数 ----------
const args = process.argv.slice(2);
function argOf (flag: string, fallback: number | string): number | string {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const PORT_HTTP = Number(argOf('--port-http', 3000));
const PORT_WS = Number(argOf('--port-ob12', 3001));
const PORT_MILKY = Number(argOf('--port-milky', 3100));
const TOKEN = String(argOf('--token', ''));
const SELF_UIN = String(argOf('--uin', '10001'));
const SELF_NICK = String(argOf('--nick', 'SnowCat-Standalone'));

// ---------- 1. mock 依赖（独立模式最小集） ----------

const bootAt = new Date().toISOString();
const logger = {
  log: (...a: unknown[]) => console.log(`[snowcat] ${a.join(' ')}`),
  logError: (...a: unknown[]) => console.log(`[snowcat][ERR] ${a.join(' ')}`),
  logWarning: (...a: unknown[]) => console.log(`[snowcat][WARN] ${a.join(' ')}`),
  logDebug: () => {},
  logMessage: () => {},
  logSelfInfo: () => {},
  setLogSelfInfo: () => {},
};

const selfInfo = { uid: 'u_standalone', uin: SELF_UIN, nick: SELF_NICK, online: true };

// 独立模式没有 QQ 登录态：ActionMap 里触 QQ API 的动作会打到这层代理，
// 返回明确错误（协议侧可见 retcode 非 0），绝不静默。
const qqApiProxy = new Proxy({}, {
  get: () => () => Promise.reject(new Error('standalone 模式：QQ 协议 API 未连接（无登录态），该动作不可用')),
});

// InitOneBot 启动链上有几处会先跑的 API 调用（非动作路径），独立模式下用
// 可完成的桩替身：getUserDetailInfo（取昵称）、sendMsg（WebUI token 提示，
// 独立模式没有 pendingToken 所以不会走）、registerParseGroupReactEventByCore。
const core: any = {
  selfInfo,
  context: { logger },
  eventWrapper: { on: () => {}, emit: () => {}, off: () => {} },
  apis: {
    UserApi: { getUserDetailInfo: () => Promise.resolve({ nick: SELF_NICK }) },
    MsgApi: { sendMsg: () => Promise.resolve(null) },
    GroupApi: { registerParseGroupReactEventByCore: () => Promise.resolve() },
  },
};
// InitOneBot 里用的是 core.context.basicInfoWrapper（不是 context 顶层的）
core.context.basicInfoWrapper = { getFullQQVersion: () => 'standalone-0.0.1' };
// 动作路径的 QQ API 兜底代理：塞在 core.apis 之上（core.apis 本身已含启动链桩）
core.apisProxy = qqApiProxy;

const listenerSink = () => ({
  addKernelMsgListener: () => {},
  addKernelBuddyListener: () => {},
  addKernelGroupListener: () => {},
});

const context: any = {
  logger,
  session: { getMsgService: listenerSink, getBuddyService: listenerSink, getGroupService: listenerSink, getWebSsoService: listenerSink },
  pathWrapper: { configPath: './standalone-config', pluginPath: './standalone-plugins' },
  workingEnv: 0,
  wrapper: {},
  basicInfoWrapper: { getFullQQVersion: () => 'standalone-0.0.1' },
  packetHandler: {},
  napi2nativeLoader: {},
};

// ---------- 2. 真装配（生产代码，无 QQ 依赖） ----------

// 独立模式下 webui-backend 走 shim（PR #78 自驾测试同款思路）：绕开
// Debug↔OneBotAction 模块循环与 terminal_manager 的 pty 装配。
// tsx 不吃 tsconfig paths，用自定义模块钩子把 'snowcat-webui-backend/index'
// 重定向到 shim，再动态 import 生产适配器。
const { register } = await import('node:module');
register(new URL('./esm-hooks.mjs', import.meta.url));

const { NapCatOneBot11Adapter } = await import('../../packages/snowcat-onebot/index.ts');

const adapter = new NapCatOneBot11Adapter(core, context, context.pathWrapper);

// 配置：独立模式默认开三通道，全部走生产网络适配器
adapter.configLoader.configData = {
  network: {
    httpServers: [{ name: 'standalone-http', protocol: 'v12', enable: true, port: PORT_HTTP, host: '127.0.0.1', enableCors: true, enableWebsocket: false, messagePostFormat: 'array', token: TOKEN, debug: false }],
    httpSseServers: [],
    httpClients: [],
    websocketServers: [{ name: 'standalone-ws', protocol: 'v12', enable: true, host: '127.0.0.1', port: PORT_WS, messagePostFormat: 'array', reportSelfMessage: false, token: TOKEN, enableForcePushEvent: true, debug: false, heartInterval: 30000 }],
    websocketClients: [],
    mcpServers: [],
    milkyServers: [{ name: 'standalone-milky', enable: true, host: '127.0.0.1', port: PORT_MILKY, token: TOKEN, enableCors: true, enableWebsocket: false, webhooks: [], debug: false }],
    plugins: [],
  },
  musicSignUrl: '',
  enableLocalFile2Url: false,
  parseMultMsg: false,
  imageDownloadProxy: '',
  timeout: { baseTimeout: 10000, uploadSpeedKBps: 256, downloadSpeedKBps: 256, maxTimeout: 1800000 },
} as any;

await adapter.InitOneBot();

// ---------- 3. 启动报告 ----------

console.log('');
console.log('=========================================');
console.log('[standalone] 独立客户端模式已启动（无 QQ 壳 / 无登录态）');
console.log(`[standalone] 启动时刻: ${bootAt}`);
console.log(`[standalone] selfInfo: uin=${SELF_UIN} nick=${SELF_NICK} online=true`);
console.log(`[standalone] OneBot12 http :${PORT_HTTP}  (POST /:action, protocol=v12)`);
console.log(`[standalone] OneBot12 ws   :${PORT_WS}  (meta.connect + heartbeat + 动作)`);
console.log(`[standalone] Milky         :${PORT_MILKY}  (POST /api/:api + GET /event SSE)`);
console.log(`[standalone] token: ${TOKEN ? '已设置（Bearer / access_token）' : '未设置（内网形态）'}`);
console.log('[standalone] 独立模式下触 QQ API 的动作返回明确错误；get_version/get_login_info/get_status 等元信息动作可用');
console.log('=========================================');

setInterval(() => {}, 1 << 30);
process.on('SIGINT', async () => {
  console.log('[standalone] 退出中，关闭全部网络适配器…');
  await adapter.networkManager.closeAllAdapters();
  process.exit(0);
});
