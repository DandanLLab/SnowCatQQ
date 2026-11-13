/**
 * 自驾测试（vitest）：雪猫通道全链路实弹验证。
 *
 * mock 只碰 QQ 协议 API（core.apis）；网络层/鉴权/协议桥/ActionMap 全生产代码。
 * A 路线（无登录态）：OneBot12 ws/http + Milky HTTP+SSE 真监听真请求。
 * B 路线复用：换掉 mockCore 即可打真客户端（登录窗口待定）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

const listeners: Array<{ close: () => Promise<void> | void; }> = [];
const ports = { ob12ws: 0, ob12http: 0, milky: 0 };
const selfInfoNick = '雪猫自驾测试';

function makeMockCore () {
  const selfInfo = { uid: 'u_mockSelf', uin: '10001', nick: '雪猫自驾测试', online: true };
  const logger = {
    log: () => {}, logError: () => {}, logWarning: () => {}, logDebug: () => {},
    logMessage: () => {}, logSelfInfo: () => {}, setLogSelfInfo: () => {},
  };
  return {
    selfInfo,
    context: { logger },
    eventWrapper: { on: () => {}, emit: () => {}, off: () => {} },
    apis: new Proxy({}, { get: () => new Proxy({}, { get: () => () => Promise.resolve(null) }) }),
  } as any;
}

beforeAll(async () => {
  const { NapCatOneBot11Adapter } = await import('@/snowcat-onebot/index');
  const logger = { log: (...a: unknown[]) => console.log('[cat]', ...a), logError: (...a: unknown[]) => console.log('[cat][ERR]', ...a), logWarning: () => {}, logDebug: () => {}, logMessage: () => {}, logSelfInfo: () => {}, setLogSelfInfo: () => {} };
  const pathWrapper: any = { configPath: './.selftest-config', pluginPath: './.selftest-plugins' };
  const listenerSink = () => ({ addKernelMsgListener: () => {}, addKernelBuddyListener: () => {}, addKernelGroupListener: () => {} });
  const context: any = { logger, pathWrapper, session: { getMsgService: listenerSink, getBuddyService: listenerSink, getGroupService: listenerSink, getWebSsoService: listenerSink } };

  const core = makeMockCore();
  core.context.basicInfoWrapper = { getFullQQVersion: () => '9.9.37-selftest' };
  // getUserDetailInfo 需要 thenable 链路（InitOneBot 首行 await）
  core.apis = {
    UserApi: { getUserDetailInfo: () => Promise.resolve({ nick: selfInfoNick }) },
    MsgApi: { sendMsg: () => Promise.resolve(null) },
    GroupApi: { registerParseGroupReactEventByCore: () => Promise.resolve() },
  };
  // WebUiDataRuntime.getQQLoginCallback() 需要 callable
  const { WebUiDataRuntime } = await import('snowcat-webui-backend');
  WebUiDataRuntime.setQQLoginCallback(() => {});

  const adapter = new NapCatOneBot11Adapter(core, context, pathWrapper);
  adapter.configLoader.configData = {
    network: {
      // 随机端口，避免并发测试冲突
      httpServers: [{ name: 't-http', protocol: 'v12', enable: true, port: 0 as unknown as number, host: '127.0.0.1', enableCors: true, enableWebsocket: false, messagePostFormat: 'array', token: '', debug: false }],
      httpSseServers: [],
      httpClients: [],
      websocketServers: [{ name: 't-ws', protocol: 'v12', enable: true, host: '127.0.0.1', port: 0 as unknown as number, messagePostFormat: 'array', reportSelfMessage: false, token: '', enableForcePushEvent: true, debug: false, heartInterval: 30000 }],
      websocketClients: [],
      mcpServers: [],
      milkyServers: [{ name: 't-milky', enable: true, host: '127.0.0.1', port: 0 as unknown as number, token: '', enableCors: true, enableWebsocket: false, webhooks: [], debug: false }],
      plugins: [],
    },
    musicSignUrl: '',
    enableLocalFile2Url: false,
    parseMultMsg: false,
    imageDownloadProxy: '',
    timeout: { baseTimeout: 10000, uploadSpeedKBps: 256, downloadSpeedKBps: 256, maxTimeout: 1800000 },
  } as any;

  await adapter.InitOneBot();
  await new Promise((r) => setTimeout(r, 800));

  // 收集真实监听端口
  const mgr = adapter.networkManager;
  for (const a of mgr.adapters.values()) {
    if (a.name === 't-http') {
      const server = (a as unknown as { server?: http.Server }).server;
      ports.ob12http = (server?.address() as AddressInfo)?.port ?? 0;
      listeners.push({ close: () => a.close() });
    }
    if (a.name === 't-ws') {
      const wsServer = (a as unknown as { wsServer?: { address?: () => AddressInfo } }).wsServer;
      ports.ob12ws = wsServer?.address?.()?.port ?? 0;
      listeners.push({ close: () => a.close() });
    }
    if (a.name === 't-milky') {
      const server = (a as unknown as { server?: http.Server }).server;
      ports.milky = (server?.address() as AddressInfo)?.port ?? 0;
      listeners.push({ close: () => a.close() });
    }
  }
}, 30_000);

afterAll(async () => {
  for (const l of listeners) await l.close();
});

function httpRequest (port: number, path: string, { method = 'GET', body = null, token = '' } = {}) {
  return new Promise<{ status: number | undefined; body: string; headers: http.IncomingHttpHeaders; }>((resolve, reject) => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    const req = http.request({ host: '127.0.0.1', port, path, method, headers, timeout: 5000 }, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: raw, headers: res.headers }));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('自驾测试：OneBot12 通道（生产网络层）', () => {
  it('OB12 http-server get_version 动作走 v12 桥', async () => {
    expect(ports.ob12http).toBeGreaterThan(0);
    const res = await httpRequest(ports.ob12http, '/get_version', { method: 'POST', body: {} });
    const body = JSON.parse(res.body);
    expect(res.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.data.onebot_version).toBe('12');
    // impl 来自底层 get_version_info 的 app_name（SnowCat.Onebot），断言非空即可
    expect(String(body.data.impl).length).toBeGreaterThan(0);
  });

  it('OB12 http-server 未知动作报 unsupported', async () => {
    const res = await httpRequest(ports.ob12http, '/get_moon_phase', { method: 'POST', body: {} });
    const body = JSON.parse(res.body);
    expect(body.status).toBe('failed');
    expect(body.retcode).toBe(10002); // OB12RetCode.UnsupportedAction
  });
});

describe('自驾测试：Milky 通道（生产网络层）', () => {
  it('get_version_info 响应外壳与版本协商', async () => {
    expect(ports.milky).toBeGreaterThan(0);
    const res = await httpRequest(ports.milky, '/api/get_version_info', { method: 'POST', body: {} });
    const body = JSON.parse(res.body);
    expect(res.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.retcode).toBe(0);
    expect(body.data.milky_version).toBe('1.3.0');
  });

  it('未知 API → HTTP 404', async () => {
    const res = await httpRequest(ports.milky, '/api/get_moon_phase', { method: 'POST', body: {} });
    expect(res.status).toBe(404);
  });

  it('token 鉴权：错 token 401 / 对 token 200（带 token 重装配验证放 B 路线真机窗口）', async () => {
    // 本实例 token 为空（内网形态），401 路径由 smoke + B 路线覆盖
    const res = await httpRequest(ports.milky, '/api/get_version_info', { method: 'POST', body: {}, token: 'anything' });
    expect(res.status).toBe(200);
  });

  it('/event SSE 端点建立（content-type: text/event-stream）', async () => {
    const ok = await new Promise<boolean>((resolve) => {
      const req = http.get({ host: '127.0.0.1', port: ports.milky, path: '/event', timeout: 4000 }, (res) => {
        const ok = res.statusCode === 200 && String(res.headers['content-type']).includes('text/event-stream');
        req.destroy();
        resolve(ok);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
    });
    expect(ok).toBe(true);
  });
});
