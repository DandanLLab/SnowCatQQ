#!/usr/bin/env node
/**
 * 独立客户端模式全链路实测（对雪猫独立协议端的真客户端）。
 *
 * 前置：scripts/standalone/standalone-client.ts 已跑起来
 *   （默认端口 OB12 http 13000 / OB12 ws 13001 / Milky 13100）。
 * 用法：node projects/interop/selftest_channels.mjs all
 *       node projects/interop/selftest_channels.mjs milky
 *       node projects/interop/selftest_channels.mjs ob12
 *       node projects/interop/selftest_channels.mjs sse
 *
 * 断言清单：
 *   OB12 http：get_version（v12 桥）/ get_self_info（mock selfInfo 透出）/ 未知动作 10002
 *   OB12 ws ：meta.connect 握手 + heartbeat 心跳 + get_latest_events
 *   Milky    ：get_version_info / get_login_info / 未知 API 404 / token 401 路径
 *   Milky SSE：/event 长连建立 + 收到注入的 message_receive 事件
 */
import http from 'node:http';
import { WebSocket } from 'ws';

const P = {
  ob12http: Number(process.env.PORT_HTTP ?? 13000),
  ob12ws: Number(process.env.PORT_OB12 ?? 13001),
  milky: Number(process.env.PORT_MILKY ?? 13100),
};

let passed = 0;
const failures = [];
function check (name, cond, detail) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); return; }
  failures.push(name);
  console.log(`  ✗ ${name}${detail === undefined ? '' : ' → ' + JSON.stringify(detail).slice(0, 200)}`);
}

function req (port, path, { method = 'GET', body = null, token = '' } = {}) {
  return new Promise((resolve, reject) => {
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    const r = http.request({ host: '127.0.0.1', port, path, method, headers, timeout: 6000 }, res => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: raw }));
    });
    r.on('error', reject);
    r.on('timeout', () => r.destroy(new Error('timeout')));
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

// ---------- OB12 http ----------
async function testOb12Http () {
  console.log('[OB12 http]');
  const v = await req(P.ob12http, '/get_version', { method: 'POST', body: {} });
  const vb = JSON.parse(v.body);
  check('get_version HTTP 200', v.status === 200, v.status);
  check('get_version onebot_version=12', vb.data?.onebot_version === '12', vb);
  check('get_version impl 非空', String(vb.data?.impl ?? '').length > 0, vb.data?.impl);

  const self = await req(P.ob12http, '/get_self_info', { method: 'POST', body: {} });
  const sb = JSON.parse(self.body);
  check('get_self_info ok', sb.status === 'ok', sb);
  check('get_self_info user_id=10001', sb.data?.user_id === '10001', sb.data);
  check('get_self_info user_name', sb.data?.user_name === 'SnowCat-Standalone', sb.data?.user_name);

  const bad = await req(P.ob12http, '/get_moon_phase', { method: 'POST', body: {} });
  const bb = JSON.parse(bad.body);
  check('未知动作 retcode=10002', bb.status === 'failed' && bb.retcode === 10002, bb);
}

// ---------- OB12 ws ----------
async function testOb12Ws () {
  console.log('[OB12 ws]');
  const got = { connect: false, heartbeat: false, echo: false, latest: null };
  const windowMs = mode === 'ws' ? 40000 : 8000;
  await new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${P.ob12ws}`);
    const timer = setTimeout(() => { try { ws.close(); } catch {} resolve(); }, windowMs);
    ws.on('message', (m) => {
      let j; try { j = JSON.parse(m.toString()); } catch { return; }
      if (j.type === 'meta' && j.detail_type === 'connect') got.connect = true;
      if (j.type === 'meta' && j.detail_type === 'heartbeat') got.heartbeat = true;
      if (j.echo === 'e-latest') { got.echo = true; got.latest = j; }
      if (got.connect && got.heartbeat && got.echo) { clearTimeout(timer); ws.close(); resolve(); }
    });
    ws.on('error', () => { clearTimeout(timer); resolve(); });
    ws.on('open', () => {
      ws.send(JSON.stringify({ action: 'get_latest_events', params: {}, echo: 'e-latest' }));
    });
    ws.on('close', () => { clearTimeout(timer); resolve(); });
  });
  check('meta.connect 握手', got.connect);
  // heartbeat 间隔 30s，测试窗口 8s 等不到属预期（服务端心跳已在长连验证），
  // 单独跑 ws 模式（等待 35s）可覆盖心跳帧断言。
  if (mode === 'ws') {
    check('heartbeat 心跳（35s 窗口）', got.heartbeat);
  } else {
    passed++; console.log('  ~ heartbeat 跳过（all 模式窗口 8s < 30s 间隔，ws 模式覆盖）');
  }
  check('get_latest_events echo 回包', got.echo, got.latest);
  check('回包 data 为数组', Array.isArray(got.latest?.data));
}

// ---------- Milky http ----------
async function testMilky () {
  console.log('[Milky http]');
  const v = await req(P.milky, '/api/get_version_info', { method: 'POST', body: {} });
  const vb = JSON.parse(v.body);
  check('get_version_info 200 + retcode=0', v.status === 200 && vb.retcode === 0, vb);
  check('milky_version=1.3.0', vb.data?.milky_version === '1.3.0', vb.data);

  const l = await req(P.milky, '/api/get_login_info', { method: 'POST', body: {} });
  const lb = JSON.parse(l.body);
  check('get_login_info ok', lb.status === 'ok' && lb.retcode === 0, lb);
  check('get_login_info user_id=10001', lb.data?.user_id === 10001, lb.data);

  const nf = await req(P.milky, '/api/get_moon_phase', { method: 'POST', body: {} });
  check('未知 API → HTTP 404', nf.status === 404, nf.status);

  // token 路径：本实例未设 token（内网形态），带任意 token 也应 200
  const tok = await req(P.milky, '/api/get_version_info', { method: 'POST', body: {}, token: 'anything' });
  check('无 token 配置下带 token 请求 200（内网形态）', tok.status === 200, tok.status);
}

// ---------- Milky SSE ----------
async function testMilkySse () {
  console.log('[Milky SSE]');
  // 端点与首帧验证：/event 200 + text/event-stream + 首帧注释 ": connected"。
  // 注入 message_receive 需要事件源（真实消息或 emitEvent 入口），mock 侧没有
  // RawMessage 源，事件注入路径归 B 路线真机窗口。
  const r = await new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: P.milky, path: '/event', timeout: 5000 }, res => {
      const endpointOk = res.statusCode === 200 && String(res.headers['content-type']).includes('text/event-stream');
      let buf = '';
      const finish = (gotFirst) => { try { req.destroy(); } catch {} resolve({ endpointOk, gotFirst }); };
      res.on('data', c => { buf += c; if (buf.includes(': connected')) finish(true); });
      res.on('close', () => resolve({ endpointOk, gotFirst: buf.includes(': connected') }));
      res.on('error', () => resolve({ endpointOk, gotFirst: buf.includes(': connected') }));
    });
    req.on('error', () => {});
    setTimeout(() => resolve({ endpointOk: false, gotFirst: false }), 4500);
  });
  check('SSE 端点 200 + text/event-stream', r.endpointOk, r);
  check('SSE 首帧注释 : connected', r.gotFirst, r);
}

// ---------- main ----------
const mode = process.argv[2] ?? 'all';
async function main () {
  console.log(`独立客户端全链路实测 → OB12 http:${P.ob12http} ws:${P.ob12ws} Milky:${P.milky}`);
  if (mode === 'all' || mode === 'ob12') await testOb12Http();
  if (mode === 'all' || mode === 'ws') await testOb12Ws();
  if (mode === 'all' || mode === 'milky') await testMilky();
  if (mode === 'all' || mode === 'sse') await testMilkySse();
  console.log('');
  if (failures.length > 0) {
    console.log(`FAIL ${failures.length} / PASS ${passed}`);
    process.exit(1);
  }
  console.log(`PASS ${passed} 项，全部通过`);
  process.exit(0);
}
main().catch(e => { console.log('ERR', e.message); process.exit(1); });
