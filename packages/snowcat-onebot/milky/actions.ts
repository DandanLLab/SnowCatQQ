/**
 * Milky 1.3 API → OneBot 11 动作。
 *
 * 只做协议翻译，不碰底层动作实现（与 onebot12 同一纪律）：
 * Milky 的请求翻译成 v11 的 action + params 交给现有 ActionMap 执行，
 * 结果再翻回 Milky 的响应形态（{status, retcode, data}）。
 *
 * 第一版核心 10 个 API（派单清单）：
 *   send_private_message / send_group_message / get_login_info / get_friend_list /
 *   get_group_info / get_group_list / get_group_member_list / get_message /
 *   delete_message / get_version_info
 */
import { MilkyRetCode, MilkySegment } from './types';
import { toMilkySegments } from './events';

/** v11 action 的返回体结构（见 action/OneBotAction.ts 的 OB11Return） */
export interface V11ReturnLike {
  status: string;
  retcode: number;
  data: unknown;
  message?: string;
  wording?: string;
}

/** 结构类型接收真实 ActionMap，避免把 snowcat-core 拖进依赖（同 onebot12） */
export interface V11ActionHandlerLike {
  websocketHandle (
    payload: unknown, echo: unknown, adapterName: string, config: unknown
  ): Promise<V11ReturnLike>;
}

export interface ActionMapLike {
  get (name: string): V11ActionHandlerLike | undefined;
}

export interface MilkyTranslateContext {
  selfId: number;
  config: unknown;
}

interface ApiSpec {
  /** 由 Milky 请求体推导 v11 动作名 */
  v11Action (payload: Record<string, unknown>): string;
  /** 参数清洗；抛错视为 BadParam */
  v11Params (payload: Record<string, unknown>): Record<string, unknown>;
  /** 返回数据整形；缺省原样透传 */
  data? (data: unknown, ctx: MilkyTranslateContext): unknown;
}

const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v));

const num = (v: unknown): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) {
    throw new MilkyBadParamError(`期望数字，收到 ${String(v)}`);
  }
  return n;
};

const rec = (v: unknown): Record<string, unknown> =>
  (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {});

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export class MilkyBadParamError extends Error {}

function requireParam (payload: Record<string, unknown>, key: string): unknown {
  const v = payload[key];
  if (v === undefined || v === null || v === '') {
    throw new MilkyBadParamError(`缺少必要参数 ${key}`);
  }
  return v;
}

// ==================== 消息段（OutgoingSegment）====================

/**
 * Milky 请求里的 message 字段是 { type, data } 扁平段数组（兼容 string 整条文本）。
 * 这里翻回 OB11 段数组交给底层 createSendElements。
 */
export function fromMilkySegments (raw: unknown): Array<{ type: string; data: Record<string, unknown>; }> {
  if (typeof raw === 'string') {
    return [{ type: 'text', data: { text: raw } }];
  }
  const segs = list(raw).map(seg => {
    const r = rec(seg);
    return { type: str(r['type']) || 'text', data: rec(r['data']) };
  });
  return segs.map(seg => {
    switch (seg.type) {
      case 'text':
        return { type: 'text', data: { text: str(seg.data['text']) } };
      case 'mention': {
        const out: Record<string, unknown> = { qq: str(seg.data['user_id']) };
        if (seg.data['name']) {
          out['name'] = str(seg.data['name']);
        }
        return { type: 'at', data: out };
      }
      case 'mention_all':
        return { type: 'at', data: { qq: 'all' } };
      case 'face':
        return { type: 'face', data: { id: str(seg.data['face_id']) } };
      case 'market_face':
        return { type: 'mface', data: { ...seg.data } };
      case 'reply':
        return { type: 'reply', data: { id: str(seg.data['message_seq']) } };
      case 'image':
        return { type: 'image', data: { file: str(seg.data['temp_url'] ?? seg.data['resource_id']) } };
      case 'record':
        return { type: 'record', data: { file: str(seg.data['temp_url'] ?? seg.data['resource_id']) } };
      case 'video':
        return { type: 'video', data: { file: str(seg.data['temp_url'] ?? seg.data['resource_id']) } };
      case 'file':
        return { type: 'file', data: { file: str(seg.data['file_id']), name: str(seg.data['file_name']) } };
      case 'light_app':
        return { type: 'json', data: { data: str(seg.data['json_payload']) } };
      case 'xml':
        return { type: 'xml', data: { service_id: num(seg.data['service_id'] ?? 0), data: str(seg.data['xml_payload']) } };
      case 'markdown':
        return { type: 'markdown', data: { content: str(seg.data['content']) } };
      case 'forward':
        return { type: 'forward', data: { id: str(seg.data['forward_id']) } };
      default:
        // 兼容性纪律：未知子类型不抛错，降级为文本说明
        return { type: 'text', data: { text: `[不支持的 Milky 消息段: ${seg.type}]` } };
    }
  });
}

/** v11 消息段数组 → Milky IncomingSegment（get_message 用） */
function toIncomingSegments (raw: unknown): MilkySegment[] {
  return toMilkySegments(raw);
}

// ==================== 响应整形 helper ====================

function toSelfInfo (raw: unknown): Record<string, unknown> {
  const r = rec(raw);
  return { user_id: num(r['user_id']), nickname: str(r['nickname']) };
}

function toFriendInfo (raw: unknown): Record<string, unknown> {
  const r = rec(raw);
  const out: Record<string, unknown> = {
    user_id: num(r['user_id']),
    nickname: str(r['nickname']),
  };
  if (r['remark'] !== undefined && r['remark'] !== null && r['remark'] !== '') {
    out['remark'] = str(r['remark']);
  }
  return out;
}

function toGroupInfo (raw: unknown): Record<string, unknown> {
  const r = rec(raw);
  const out: Record<string, unknown> = {
    group_id: num(r['group_id']),
    group_name: str(r['group_name']),
  };
  if (r['member_count'] !== undefined) {
    out['member_count'] = num(r['member_count']);
  }
  if (r['max_member_count'] !== undefined) {
    out['max_member_count'] = num(r['max_member_count']);
  }
  return out;
}

const ROLE_MAP: Record<string, string> = {
  owner: 'owner',
  admin: 'admin',
  member: 'member',
};

function toGroupMemberInfo (raw: unknown): Record<string, unknown> {
  const r = rec(raw);
  const role = ROLE_MAP[str(r['role'])] ?? 'member';
  const out: Record<string, unknown> = {
    user_id: num(r['user_id']),
    nickname: str(r['nickname']),
    role,
  };
  if (r['card'] !== undefined && r['card'] !== null && r['card'] !== '') {
    out['card'] = str(r['card']);
  }
  if (r['title'] !== undefined && r['title'] !== null && r['title'] !== '') {
    out['title'] = str(r['title']);
  }
  if (r['level'] !== undefined) {
    out['level'] = num(r['level']);
  }
  return out;
}

/** get_message 的返回：OB11 消息对象 → Milky 消息结构 */
function toMessagePayload (raw: unknown): Record<string, unknown> {
  const r = rec(raw);
  const groupId = num(r['group_id']);
  const userId = num(r['user_id'] ?? rec(r['sender'])['user_id']);
  const out: Record<string, unknown> = {
    message_seq: num(r['message_seq'] ?? r['message_id']),
    time: typeof r['time'] === 'number' ? r['time'] : Math.floor(Date.now() / 1000),
    user_id: userId,
    peer_id: groupId || userId,
    chat_type: groupId ? 'group' : 'c2c',
    segments: toIncomingSegments(r['message'] ?? r['arrayMsg']),
  };
  return out;
}

// ==================== 10 个核心 API ====================

export const MILKY_API_SPECS: Record<string, ApiSpec> = {
  send_private_message: {
    v11Action: () => 'send_private_msg',
    v11Params: payload => ({
      user_id: num(requireParam(payload, 'user_id')),
      message: fromMilkySegments(requireParam(payload, 'message')),
    }),
    data: raw => {
      const r = rec(raw);
      return { message_seq: num(r['message_id']), time: Math.floor(Date.now() / 1000) };
    },
  },

  send_group_message: {
    v11Action: () => 'send_group_msg',
    v11Params: payload => ({
      group_id: num(requireParam(payload, 'group_id')),
      message: fromMilkySegments(requireParam(payload, 'message')),
    }),
    data: raw => {
      const r = rec(raw);
      return { message_seq: num(r['message_id']), time: Math.floor(Date.now() / 1000) };
    },
  },

  get_login_info: {
    v11Action: () => 'get_login_info',
    v11Params: () => ({}),
    data: toSelfInfo,
  },

  get_friend_list: {
    v11Action: () => 'get_friend_list',
    v11Params: () => ({}),
    data: raw => list(raw).map(toFriendInfo),
  },

  get_group_info: {
    v11Action: () => 'get_group_info',
    v11Params: payload => ({ group_id: num(requireParam(payload, 'group_id')) }),
    data: toGroupInfo,
  },

  get_group_list: {
    v11Action: () => 'get_group_list',
    v11Params: () => ({}),
    data: raw => list(raw).map(toGroupInfo),
  },

  get_group_member_list: {
    v11Action: () => 'get_group_member_list',
    v11Params: payload => ({ group_id: num(requireParam(payload, 'group_id')) }),
    data: raw => list(raw).map(toGroupMemberInfo),
  },

  get_message: {
    v11Action: () => 'get_msg',
    v11Params: payload => ({ message_id: num(requireParam(payload, 'message_seq')) }),
    data: toMessagePayload,
  },

  delete_message: {
    v11Action: () => 'delete_msg',
    v11Params: payload => ({ message_id: num(requireParam(payload, 'message_seq')) }),
    data: () => ({}),
  },

  get_version_info: {
    v11Action: () => 'get_version_info',
    v11Params: () => ({}),
    data: raw => {
      const r = rec(raw);
      return {
        impl: str(r['app_name'] ?? 'snowcat'),
        version: str(r['app_version'] ?? '0.0.0'),
        milky_version: '1.3.0',
      };
    },
  },
};

/** 第一版暴露的 API 名单（HTTP 层 404 判定与文档共用） */
export const SUPPORTED_MILKY_APIS: string[] = Object.keys(MILKY_API_SPECS);

export interface MilkyBuildOk {
  ok: true;
  v11Action: string;
  v11Params: Record<string, unknown>;
}

export interface MilkyBuildErr {
  ok: false;
  retcode: number;
  message: string;
}

export type MilkyBuildResult = MilkyBuildOk | MilkyBuildErr;

export function buildMilkyRequest (api: string, payload: Record<string, unknown>): MilkyBuildResult {
  const spec = MILKY_API_SPECS[api];
  if (!spec) {
    return { ok: false, retcode: MilkyRetCode.NotFound, message: `不支持的 API ${api}` };
  }
  try {
    return {
      ok: true,
      v11Action: spec.v11Action(payload),
      v11Params: spec.v11Params(payload),
    };
  } catch (e) {
    if (e instanceof MilkyBadParamError) {
      return { ok: false, retcode: MilkyRetCode.BadParam, message: e.message };
    }
    return {
      ok: false,
      retcode: MilkyRetCode.BadParam,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

/** v11 的 retcode → Milky 的返回码段 */
export function mapMilkyRetCode (v11RetCode: number): number {
  switch (v11RetCode) {
    case 0: return MilkyRetCode.Ok;
    case 1400:
    case 400: return MilkyRetCode.BadParam;
    case 1404: return MilkyRetCode.NotFound;
    case 1401:
    case 1403: return MilkyRetCode.NotLoggedIn;
    default: return MilkyRetCode.InternalError;
  }
}

export function translateMilkyResponse (
  api: string, ret: V11ReturnLike, ctx: MilkyTranslateContext
): { status: 'ok' | 'failed'; retcode: number; data: unknown; message: string; } {
  if (ret.status !== 'ok') {
    return {
      status: 'failed',
      retcode: mapMilkyRetCode(ret.retcode),
      data: null,
      message: ret.message ?? ret.wording ?? '',
    };
  }
  const spec = MILKY_API_SPECS[api];
  const data = spec?.data ? spec.data(ret.data, ctx) : (ret.data ?? {});
  return { status: 'ok', retcode: MilkyRetCode.Ok, data, message: '' };
}
