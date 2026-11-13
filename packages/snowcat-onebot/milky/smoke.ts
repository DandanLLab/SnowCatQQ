/**
 * smoke：不依赖 QQ、不依赖 node_modules，直接跑 Milky 协议翻译。
 *
 * 编译执行（与 onebot12/smoke.ts 同一模式）：
 *   tsc -p packages/snowcat-onebot/milky/tsconfig.json --noEmit false \
 *       --outDir /tmp/milky --module commonjs --moduleResolution node10
 *   echo '{"type":"commonjs"}' > /tmp/milky/package.json
 *   node /tmp/milky/smoke.js
 */
import { MilkyBridge } from './bridge';
import { ActionMapLike, V11ActionHandlerLike, V11ReturnLike, fromMilkySegments } from './actions';
import { toMilkyEvent, MilkyV11EventLike } from './events';
import { MilkyRetCode, MILKY_STANDARD_VERSION } from './types';

declare const console: { log (...args: unknown[]): void; };

const rec = (v: unknown): Record<string, unknown> =>
  (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {});

let passed = 0;
const failures: string[] = [];

function check (name: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    passed++;
    return;
  }
  failures.push(`${name}${detail === undefined ? '' : ` → ${JSON.stringify(detail)}`}`);
}

function eq (name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(name, a === e, { actual: a, expected: e });
}

interface FakeCall {
  action: string;
  params: Record<string, unknown>;
}

const calls: FakeCall[] = [];

type FakeImpl = (params: Record<string, unknown>) => unknown;

function makeActionMap (table: Record<string, FakeImpl>): ActionMapLike {
  return {
    get (name: string): V11ActionHandlerLike | undefined {
      const impl = table[name];
      if (!impl) {
        return undefined;
      }
      return {
        async websocketHandle (payload: unknown): Promise<V11ReturnLike> {
          const params = rec(payload);
          calls.push({ action: name, params });
          const result = impl(params);
          if (result instanceof Error) {
            // 与真实实现一致：websocketHandle 捕获异常时用 1200
            return { status: 'failed', retcode: 1200, data: null, message: result.message };
          }
          return { status: 'ok', retcode: 0, data: result };
        },
      };
    },
  };
}

const actions = makeActionMap({
  send_group_msg: params => {
    check('send_group_msg 收到数字 group_id', typeof params['group_id'] === 'number', params['group_id']);
    check('send_group_msg 收到 OB11 段数组', Array.isArray(params['message']) && rec((params['message'] as unknown[])[0])['type'] === 'text', params['message']);
    return { message_id: 987654321 };
  },
  send_private_msg: () => ({ message_id: 123456789 }),
  delete_msg: () => null,
  get_msg: () => ({
    message_id: 555,
    message_seq: 555,
    group_id: 10086,
    user_id: 20001,
    time: 1762900000,
    raw_message: 'hello',
    message: [{ type: 'text', data: { text: 'hello' } }],
  }),
  get_login_info: () => ({ user_id: 10001, nickname: '雪猫' }),
  get_friend_list: () => ([
    { user_id: 20002, nickname: '路人', remark: '备注' },
    { user_id: 20003, nickname: '熟人' },
  ]),
  get_group_info: () => ({ group_id: 10086, group_name: '测试群', member_count: 30 }),
  get_group_list: () => ([{ group_id: 10086, group_name: '测试群', member_count: 30, max_member_count: 500 }]),
  get_group_member_list: () => ([
    { group_id: 10086, user_id: 20002, nickname: '路人', card: '群名片', role: 'admin' },
    { group_id: 10086, user_id: 20003, nickname: '熟人', role: 'member' },
  ]),
  get_version_info: () => ({ app_name: 'SnowCat', app_version: '0.0.1' }),
});

const bridge = new MilkyBridge({
  actions,
  selfId: 10001,
  adapterName: 'milky-test',
});

async function runApis (): Promise<void> {
  // 1. send_group_message：Milky 段 → OB11 段，返回 message_seq
  const sendGroup = await bridge.dispatch('send_group_message', {
    group_id: 10086,
    message: [
      { type: 'text', data: { text: '你好' } },
      { type: 'mention', data: { user_id: 20002 } },
      { type: 'mention_all', data: {} },
      { type: 'image', data: { resource_id: 'img1', temp_url: 'https://example.com/a.png', width: 100, height: 100 } },
    ],
  });
  eq('send_group_message status', sendGroup.status, 'ok');
  eq('send_group_message retcode', sendGroup.retcode, MilkyRetCode.Ok);
  eq('send_group_message data.message_seq', rec(sendGroup.data)['message_seq'], 987654321);
  const lastCall = calls[calls.length - 1]!;
  eq('底层动作名', lastCall.action, 'send_group_msg');
  const ob11Msg = lastCall.params['message'] as Array<Record<string, unknown>>;
  eq('at 段还原', rec(ob11Msg[1])['type'], 'at');
  eq('mention_all 还原为 at/all', rec(rec(ob11Msg[2])['data'])['qq'], 'all');

  // 2. send_private_message 缺参 → -400
  const badSend = await bridge.dispatch('send_private_message', { message: [{ type: 'text', data: { text: 'x' } }] });
  eq('缺 user_id 报 -400', badSend.retcode, MilkyRetCode.BadParam);
  eq('失败响应 data 为 null', badSend.data, null);
  check('失败响应带 message', typeof badSend.message === 'string' && badSend.message.length > 0, badSend.message);

  // 3. get_login_info
  const login = await bridge.dispatch('get_login_info', {});
  eq('get_login_info user_id', rec(login.data)['user_id'], 10001);
  eq('get_login_info nickname', rec(login.data)['nickname'], '雪猫');

  // 4. get_friend_list
  const friends = await bridge.dispatch('get_friend_list', {});
  eq('get_friend_list 条数', (friends.data as unknown[]).length, 2);
  eq('好友 remark', rec((friends.data as unknown[])[0])['remark'], '备注');

  // 5. get_group_info / get_group_list
  const groupInfo = await bridge.dispatch('get_group_info', { group_id: '10086' });
  eq('get_group_info 字符串入参也可', rec(groupInfo.data)['group_id'], 10086);
  const groupList = await bridge.dispatch('get_group_list', {});
  eq('get_group_list max_member_count 透传', rec((groupList.data as unknown[])[0])['max_member_count'], 500);

  // 6. get_group_member_list
  const members = await bridge.dispatch('get_group_member_list', { group_id: 10086 });
  eq('成员 role 整形', rec((members.data as unknown[])[0])['role'], 'admin');

  // 7. get_message
  const getMsg = await bridge.dispatch('get_message', { message_seq: 555 });
  eq('get_message chat_type', rec(getMsg.data)['chat_type'], 'group');
  eq('get_message segments 首段 text', rec(rec((rec(getMsg.data)['segments'] as unknown[])[0]!)['data'])['text'], 'hello');
  const lastGetCall = calls[calls.length - 1]!;
  eq('get_message 底层动作', lastGetCall.action, 'get_msg');

  // 8. delete_message
  const del = await bridge.dispatch('delete_message', { message_seq: 555 });
  eq('delete_message 成功空对象', del.data, {});

  // 9. get_version_info
  const ver = await bridge.dispatch('get_version_info', {});
  eq('milky_version 固定 1.3.0', rec(ver.data)['milky_version'], MILKY_STANDARD_VERSION);

  // 10. 未知 API → -404
  const unknown = await bridge.dispatch('get_moon_phase', {});
  eq('未知 API 报 -404', unknown.retcode, MilkyRetCode.NotFound);
}

function runEvents (): void {
  // 群消息事件 → message_receive
  const groupMsg: MilkyV11EventLike = {
    post_type: 'message',
    time: 1762900000,
    self_id: 10001,
    message_type: 'group',
    message_id: 777,
    group_id: 10086,
    user_id: 20002,
    sender: { user_id: 20002, nickname: '路人', card: '群名片' },
    message: [
      { type: 'text', data: { text: '早上好' } },
      { type: 'at', data: { qq: '10001' } },
      { type: 'face', data: { id: '12' } },
    ],
    raw_message: '早上好[@10001][表情]',
  };
  const ev = toMilkyEvent(groupMsg);
  check('群消息事件非空', ev !== null);
  eq('message_receive event_type', ev!.event_type, 'message_receive');
  eq('peer_id 为群号', rec(ev!.data)['peer_id'], 10086);
  eq('chat_type group', rec(ev!.data)['chat_type'], 'group');
  const msgData = rec(ev!.data)['message'] as Record<string, unknown>;
  eq('message_seq', msgData['message_seq'], 777);
  const segs = msgData['segments'] as Array<Record<string, unknown>>;
  eq('at → mention', rec(segs[1])['type'], 'mention');
  eq('mention user_id 数字化', rec(rec(segs[1])['data'])['user_id'], 10001);
  eq('face → face', rec(segs[2])['type'], 'face');

  // 私聊消息 → c2c
  const privateMsg: MilkyV11EventLike = {
    post_type: 'message',
    self_id: 10001,
    message_type: 'private',
    message_id: 888,
    user_id: 30001,
    sender: { user_id: 30001, nickname: '朋友' },
    message: [{ type: 'text', data: { text: 'hi' } }],
  };
  const ev2 = toMilkyEvent(privateMsg);
  eq('私聊 chat_type', rec(ev2!.data)['chat_type'], 'c2c');
  eq('私聊 peer_id', rec(ev2!.data)['peer_id'], 30001);

  // 群撤回 → message_recall
  const recall: MilkyV11EventLike = {
    post_type: 'notice',
    notice_type: 'group_recall',
    group_id: 10086,
    user_id: 20002,
    operator_id: 20003,
    message_id: 777,
    self_id: 10001,
  };
  const ev3 = toMilkyEvent(recall);
  eq('message_recall event_type', ev3!.event_type, 'message_recall');
  eq('recall operator_id', rec(ev3!.data)['operator_id'], 20003);

  // 入群 → group_member_increase（approve=4）
  const increase: MilkyV11EventLike = {
    post_type: 'notice',
    notice_type: 'group_increase',
    sub_type: 'approve',
    group_id: 10086,
    user_id: 20004,
    self_id: 10001,
  };
  const ev4 = toMilkyEvent(increase);
  eq('group_member_increase event_type', ev4!.event_type, 'group_member_increase');
  eq('approve sub_type=4', rec(ev4!.data)['sub_type'], 4);

  // 踢人 → group_member_decrease（kick=2）
  const kick: MilkyV11EventLike = {
    post_type: 'notice',
    notice_type: 'group_decrease',
    sub_type: 'kick',
    group_id: 10086,
    user_id: 20005,
    operator_id: 20003,
    self_id: 10001,
  };
  const ev5 = toMilkyEvent(kick);
  eq('group_member_decrease event_type', ev5!.event_type, 'group_member_decrease');
  eq('kick sub_type=2', rec(ev5!.data)['sub_type'], 2);

  // bridge 事件出口
  const evLine = bridge.convertEvent(groupMsg);
  check('bridge.convertEvent 非空', evLine !== null);
  eq('bridge event_type', evLine!.event_type, 'message_receive');

  // 未覆盖形态丢弃：request / meta / admin notice / message_sent
  eq('request 丢弃', toMilkyEvent({ post_type: 'request', request_type: 'friend' }), null);
  eq('meta 丢弃', toMilkyEvent({ post_type: 'meta_event' }), null);
  eq('admin notice 第一版丢弃', toMilkyEvent({ post_type: 'notice', notice_type: 'group_admin' }), null);
  eq('message_sent 丢弃', toMilkyEvent({ post_type: 'message_sent' }), null);
}

function runOutgoingSegments (): void {
  // Milky → OB11 出站段往返
  const ob11 = fromMilkySegments([
    { type: 'text', data: { text: 'hi' } },
    { type: 'reply', data: { message_seq: 42 } },
    { type: 'record', data: { resource_id: 'r1', temp_url: 'https://x/a.silk' } },
    { type: 'light_app', data: { json_payload: '{"a":1}' } },
    { type: 'unknown_future', data: { x: 1 } },
  ]);
  eq('出站 text 直转', rec(ob11[0])['type'], 'text');
  eq('reply → OB11 reply', rec(ob11[1])['type'], 'reply');
  eq('reply message_seq→id', rec(rec(ob11[1])['data'])['id'], '42');
  eq('record temp_url→file', rec(rec(ob11[2])['data'])['file'], 'https://x/a.silk');
  eq('light_app → json', rec(ob11[3])['type'], 'json');
  eq('未知段降级 text', rec(ob11[4])['type'], 'text');

  // 纯文本 message 字段
  eq('字符串 message 展开为 text 段', rec(fromMilkySegments('纯文本')[0])['type'], 'text');
}

async function main (): Promise<void> {
  await runApis();
  runEvents();
  runOutgoingSegments();

  if (failures.length > 0) {
    console.log(`FAIL ${failures.length} / PASS ${passed}`);
    for (const f of failures) {
      console.log('  x ' + f);
    }
    throw new Error(`smoke 未通过：${failures.length} 项失败`);
  }
  console.log(`PASS ${passed} 项，全部通过`);
}

main().catch(e => {
  console.log(String(e instanceof Error ? e.message : e));
  throw e;
});
