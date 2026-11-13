/**
 * smoke：不依赖 QQ、不依赖 node_modules，直接跑协议翻译。
 *
 * 编译执行：
 *   tsc -p packages/snowcat-onebot/onebot12/tsconfig.json --noEmit false \
 *       --outDir /tmp/ob12 --module commonjs
 *   node /tmp/ob12/smoke.js
 */
import { OneBot12Bridge } from './bridge';
import { ActionMapLike, V11ActionHandlerLike, V11ReturnLike } from './actions';
import { OB12MessageEvent, OB12NoticeEvent } from './types';

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
  send_group_msg: () => ({ message_id: 987654321 }),
  send_private_msg: () => ({ message_id: 123456789 }),
  delete_msg: () => null,
  get_msg: () => ({
    message_id: 555,
    group_id: 10086,
    user_id: 20001,
    time: 1762900000,
    raw_message: 'hello',
    message: [{ type: 'text', data: { text: 'hello' } }],
  }),
  get_login_info: () => ({ user_id: 10001, nickname: '雪猫' }),
  get_stranger_info: () => ({ user_id: 20002, nickname: '路人', remark: '备注' }),
  get_friend_list: () => ([
    { user_id: 20002, nickname: '路人', remark: '备注' },
    { user_id: 20003, nickname: '熟人' },
  ]),
  get_group_info: () => ({ group_id: 10086, group_name: '测试群', member_count: 30 }),
  get_group_list: () => ([{ group_id: 10086, group_name: '测试群' }]),
  get_group_member_info: () => ({ group_id: 10086, user_id: 20002, nickname: '路人', card: '群名片' }),
  get_group_member_list: () => ([
    { group_id: 10086, user_id: 20002, nickname: '路人', card: '群名片' },
    { group_id: 10086, user_id: 20003, nickname: '熟人', card: '' },
  ]),
  set_group_ban: () => new Error('权限不足'),
  get_status: () => ({ good: true, online: true }),
  get_version_info: () => ({ app_name: 'SnowCat', app_version: '0.0.1' }),
});

const bridge = new OneBot12Bridge({
  actions,
  selfId: '10001',
  adapterName: 'onebot12-test',
});

async function runActions (): Promise<void> {
  // 1. send_message → send_group_msg，ID 变数字
  const sendGroup = await bridge.dispatch({
    action: 'send_message',
    params: {
      detail_type: 'group',
      group_id: '10086',
      message: [{ type: 'text', data: { text: 'hi' } }],
    },
    echo: 'e-1',
  });
  eq('send_message(group) status', sendGroup.status, 'ok');
  eq('send_message(group) message_id 转字符串', rec(sendGroup.data)['message_id'], '987654321');
  check('send_message(group) 带 time', typeof rec(sendGroup.data)['time'] === 'number');
  eq('send_message(group) echo 原样返回', sendGroup.echo, 'e-1');
  const lastCall = calls[calls.length - 1];
  eq('send_message(group) 落在 send_group_msg', lastCall?.action, 'send_group_msg');
  eq('send_message(group) group_id 变数字', lastCall?.params['group_id'], 10086);

  // 2. send_message → send_private_msg
  const sendPrivate = await bridge.dispatch({
    action: 'send_message',
    params: { detail_type: 'private', user_id: '20002', message: 'plain' },
  });
  eq('send_message(private) message_id', rec(sendPrivate.data)['message_id'], '123456789');
  eq('send_message(private) 落在 send_private_msg', calls[calls.length - 1]?.action, 'send_private_msg');

  // 3. 缺参数 → 10003
  const missing = await bridge.dispatch({
    action: 'send_message',
    params: { detail_type: 'group', message: [] },
  });
  eq('send_message 缺 group_id → failed', missing.status, 'failed');
  eq('send_message 缺 group_id → 10003', missing.retcode, 10003);
  eq('失败时 data 为 null', missing.data, null);

  // 4. 未知动作 → 10002
  const unknown = await bridge.dispatch({ action: 'send_packet', params: {} });
  eq('未知动作 → 10002', unknown.retcode, 10002);

  // 5. get_self_info → get_login_info
  const selfInfo = await bridge.dispatch({ action: 'get_self_info', params: {} });
  eq('get_self_info user_id 转字符串', rec(selfInfo.data)['user_id'], '10001');
  eq('get_self_info user_name', rec(selfInfo.data)['user_name'], '雪猫');
  eq('get_self_info 走 get_login_info', calls[calls.length - 1]?.action, 'get_login_info');

  // 6. get_user_info 字段改名
  const userInfo = await bridge.dispatch({ action: 'get_user_info', params: { user_id: '20002' } });
  eq('get_user_info user_remark', rec(userInfo.data)['user_remark'], '备注');
  eq('get_user_info 走 get_stranger_info', calls[calls.length - 1]?.action, 'get_stranger_info');

  // 7. get_group_member_info：nickname/card → user_name/user_displayname
  const member = await bridge.dispatch({
    action: 'get_group_member_info',
    params: { group_id: '10086', user_id: '20002' },
  });
  eq('member user_id', rec(member.data)['user_id'], '20002');
  eq('member user_name', rec(member.data)['user_name'], '路人');
  eq('member user_displayname', rec(member.data)['user_displayname'], '群名片');

  // 8. delete_message → delete_msg
  const del = await bridge.dispatch({ action: 'delete_message', params: { message_id: '555' } });
  eq('delete_message status', del.status, 'ok');
  eq('delete_message data null', del.data, null);
  eq('delete_message 走 delete_msg', calls[calls.length - 1]?.action, 'delete_msg');

  // 9. get_message 返回 12 的消息结构
  const msg = rec((await bridge.dispatch({ action: 'get_message', params: { message_id: '555' } })).data);
  eq('get_message message_id', msg['message_id'], '555');
  eq('get_message group_id', msg['group_id'], '10086');
  eq('get_message alt_message', msg['alt_message'], 'hello');

  // 10. get_status 按 12 的 bots 结构
  const status = rec((await bridge.dispatch({ action: 'get_status', params: {} })).data);
  eq('get_status good', status['good'], true);
  eq('get_status bots[0].self.user_id', rec((status['bots'] as unknown[])[0])['self'], {
    platform: 'qq', user_id: '10001',
  });

  // 11. get_version 自报 12
  const version = rec((await bridge.dispatch({ action: 'get_version', params: {} })).data);
  eq('get_version onebot_version', version['onebot_version'], '12');
  eq('get_version impl', version['impl'], 'SnowCat');

  // 12. 底层失败 → 34xxx
  const denied = await bridge.dispatch({
    action: 'set_group_ban',
    params: { group_id: '10086', user_id: '20002', duration: 60 },
  });
  eq('底层失败 status', denied.status, 'failed');
  eq('底层失败 retcode', denied.retcode, 34000);
  eq('底层失败保留 message', denied.message, '权限不足');

  // 13. get_supported_actions 含 send_message
  const supported = await bridge.dispatch({ action: 'get_supported_actions', params: {} });
  check('get_supported_actions 含 send_message', (supported.data as string[]).includes('send_message'));

  // 14. handleLine：坏 JSON → 10001
  const badLine = JSON.parse(await bridge.handleLine('{not json')) as Record<string, unknown>;
  eq('坏 JSON → 10001', badLine['retcode'], 10001);

  // 15. handleLine：正常一行
  const goodLine = JSON.parse(
    await bridge.handleLine('{"action":"get_self_info","params":{},"echo":"abc"}')
  ) as Record<string, unknown>;
  eq('handleLine echo', goodLine['echo'], 'abc');
}

function runEvents (): void {
  // 群消息：ID 全变字符串，段落改名
  const groupMsg = bridge.convertEvent({
    post_type: 'message',
    self_id: 10001,
    time: 1762900000,
    message_type: 'group',
    sub_type: 'normal',
    message_id: 555,
    group_id: 10086,
    user_id: 20002,
    raw_message: '你好[图片]',
    message: [
      { type: 'text', data: { text: '你好' } },
      { type: 'at', data: { qq: '20003' } },
      { type: 'image', data: { file: 'abc.image', url: 'https://example.com/a.jpg' } },
    ],
    sender: { user_id: 20002, nickname: '路人' },
  }) as OB12MessageEvent;

  check('群消息事件非 null', groupMsg !== null);
  eq('event.type', groupMsg.type, 'message');
  eq('event.detail_type', groupMsg.detail_type, 'group');
  eq('event.sub_type 归零', groupMsg.sub_type, '');
  eq('event.self', groupMsg.self, { platform: 'qq', user_id: '10001' });
  eq('event.message_id 字符串', groupMsg.message_id, '555');
  eq('event.user_id 字符串', groupMsg.user_id, '20002');
  eq('event.group_id 字符串', groupMsg.group_id, '10086');
  eq('event.alt_message 用 raw_message', groupMsg.alt_message, '你好[图片]');
  eq('at 段改名 mention', groupMsg.message[1], { type: 'mention', data: { user_id: '20003' } });
  eq('image 段带 qq.url', groupMsg.message[2], {
    type: 'image',
    data: { file_id: 'abc.image', 'qq.url': 'https://example.com/a.jpg' },
  });
  check('event.id 非空', typeof groupMsg.id === 'string' && groupMsg.id.length > 0);

  // 私聊消息
  const privateMsg = bridge.convertEvent({
    post_type: 'message',
    self_id: 10001,
    message_type: 'private',
    sub_type: 'friend',
    message_id: 556,
    user_id: 20002,
    message: 'hello',
  }) as OB12MessageEvent;
  eq('私聊 detail_type', privateMsg.detail_type, 'private');
  eq('私聊 sub_type 加前缀', privateMsg.sub_type, 'qq.friend');
  eq('私聊无 group_id', privateMsg.group_id, undefined);
  eq('字符串消息包成 text 段', privateMsg.message[0], { type: 'text', data: { text: 'hello' } });

  // 群成员增加 approve → join
  const increase = bridge.convertEvent({
    post_type: 'notice',
    self_id: 10001,
    notice_type: 'group_increase',
    sub_type: 'approve',
    group_id: 10086,
    user_id: 20002,
    operator_id: 10001,
  }) as OB12NoticeEvent;
  eq('group_increase detail_type', increase.detail_type, 'group_member_increase');
  eq('group_increase sub_type', increase.sub_type, 'join');
  eq('increase operator_id 字符串', increase.operator_id, '10001');

  // 群成员减少 kick
  const decrease = bridge.convertEvent({
    post_type: 'notice',
    self_id: 10001,
    notice_type: 'group_decrease',
    sub_type: 'kick',
    group_id: 10086,
    user_id: 20002,
  }) as OB12NoticeEvent;
  eq('group_decrease sub_type', decrease.sub_type, 'kick');

  // 撤回 → group_message_delete
  const recall = bridge.convertEvent({
    post_type: 'notice',
    self_id: 10001,
    notice_type: 'group_recall',
    group_id: 10086,
    user_id: 20002,
    operator_id: 20002,
    message_id: 555,
  }) as OB12NoticeEvent;
  eq('group_recall detail_type', recall.detail_type, 'group_message_delete');
  eq('group_recall sub_type', recall.sub_type, 'recall');

  // 好友添加
  const friendAdd = bridge.convertEvent({
    post_type: 'notice',
    self_id: 10001,
    notice_type: 'friend_add',
    user_id: 20002,
  }) as OB12NoticeEvent;
  eq('friend_add detail_type', friendAdd.detail_type, 'friend_increase');

  // 标准没有的 notice → qq. 前缀
  const poke = bridge.convertEvent({
    post_type: 'notice',
    self_id: 10001,
    notice_type: 'notify',
    sub_type: 'poke',
    group_id: 10086,
    user_id: 20002,
  }) as OB12NoticeEvent;
  eq('未定义通知加前缀', poke.detail_type, 'qq.notify');

  // message_sent 在 12 里没有对应形态
  const sent = bridge.convertEvent({
    post_type: 'message_sent',
    self_id: 10001,
    message_type: 'private',
    user_id: 20002,
    message: 'x',
  });
  eq('message_sent 被丢弃', sent, null);
}

async function runLatestEvents (): Promise<void> {
  const res = await bridge.dispatch({ action: 'get_latest_events', params: { limit: 2 } });
  const arr = res.data as unknown[];
  eq('get_latest_events 条数按 limit', arr.length, 2);
  const last = rec(arr[arr.length - 1]);
  eq('get_latest_events 从旧到新', last['type'], 'notice');
}

async function main (): Promise<void> {
  await runActions();
  runEvents();
  await runLatestEvents();

  if (failures.length > 0) {
    console.log(`FAIL ${failures.length} / PASS ${passed}`);
    for (const f of failures) {
      console.log('  ✗ ' + f);
    }
    throw new Error(`smoke 未通过：${failures.length} 项失败`);
  }
  console.log(`PASS ${passed} 项，全部通过`);
}

main().catch(e => {
  console.log(String(e instanceof Error ? e.message : e));
  throw e;
});
