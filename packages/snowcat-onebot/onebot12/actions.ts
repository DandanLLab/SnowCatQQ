/**
 * OneBot 12 动作 → OneBot 11 动作。
 *
 * 12 把 send_private_msg / send_group_msg 合并成 send_message，动作名整体去掉
 * 了 *_msg 后缀（get_version_info → get_version、set_group_leave → leave_group），
 * 所有 ID 从 number 变成 string。这里只做协议翻译，不碰底层实现。
 */
import { OB12ActionResponse, OB12RetCode, OB12_PLATFORM } from './types';
import { buildAltMessage, toSegments } from './events';

/** v11 action 的返回体结构（见 action/OneBotAction.ts 的 OB11Response） */
export interface V11ReturnLike {
  status: string;
  retcode: number;
  data: unknown;
  message?: string;
  wording?: string;
}

/** 这里只用到 websocketHandle，用结构类型接收真实的 ActionMap，避免把 snowcat-core 拖进依赖 */
export interface V11ActionHandlerLike {
  websocketHandle (
    payload: unknown, echo: unknown, adapterName: string, config: unknown
  ): Promise<V11ReturnLike>;
}

export interface ActionMapLike {
  get (name: string): V11ActionHandlerLike | undefined;
}

export interface TranslateContext {
  selfId: string;
  config: unknown;
}

export interface BuildOk {
  ok: true;
  v11Action: string;
  v11Params: Record<string, unknown>;
}

export interface BuildErr {
  ok: false;
  retcode: number;
  message: string;
}

export type BuildResult = BuildOk | BuildErr;

interface ActionSpec {
  /** 由 12 的参数推导 11 的动作名，可以是多对一 */
  v11Action (params: Record<string, unknown>): string;
  /** 参数清洗；抛错视为 Bad Param */
  v11Params (params: Record<string, unknown>): Record<string, unknown>;
  /** 返回数据整形；缺省原样透传 */
  data? (data: unknown, ctx: TranslateContext): unknown;
}

const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v));

const num = (v: unknown): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) {
    throw new Error(`期望数字，收到 ${String(v)}`);
  }
  return n;
};

const bool = (v: unknown): boolean => v === true || v === 'true' || v === 1 || v === '1';

const rec = (v: unknown): Record<string, unknown> =>
  (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {});

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function requireParam (params: Record<string, unknown>, key: string): unknown {
  const v = params[key];
  if (v === undefined || v === null || v === '') {
    throw new Error(`缺少必要参数 ${key}`);
  }
  return v;
}

function toUserInfo (raw: unknown): Record<string, unknown> {
  const r = rec(raw);
  return {
    user_id: str(r['user_id']),
    user_name: str(r['nickname'] ?? r['user_name']),
    user_displayname: '',
    user_remark: str(r['remark'] ?? r['user_remark']),
  };
}

function toMemberInfo (raw: unknown): Record<string, unknown> {
  const r = rec(raw);
  return {
    user_id: str(r['user_id']),
    user_name: str(r['nickname'] ?? r['user_name']),
    user_displayname: str(r['card'] ?? r['user_displayname']),
  };
}

function toGroupInfo (raw: unknown): Record<string, unknown> {
  const r = rec(raw);
  return {
    group_id: str(r['group_id']),
    group_name: str(r['group_name']),
  };
}

/** get_message 的返回：11 的消息对象 → 12 的消息结构 */
function toMessagePayload (raw: unknown): Record<string, unknown> {
  const r = rec(raw);
  const segments = toSegments(r['message'] ?? r['arrayMsg']);
  const groupId = str(r['group_id']);
  const out: Record<string, unknown> = {
    message_id: str(r['message_id']),
    message: segments,
    alt_message: buildAltMessage(segments, typeof r['raw_message'] === 'string' ? r['raw_message'] : undefined),
    user_id: str(r['user_id'] ?? rec(r['sender'])['user_id']),
    time: typeof r['time'] === 'number' ? r['time'] : Math.floor(Date.now() / 1000),
  };
  if (groupId.length > 0) {
    out['group_id'] = groupId;
  }
  return out;
}

export const ACTION_SPECS: Record<string, ActionSpec> = {
  send_message: {
    v11Action: params => {
      const detailType = str(params['detail_type']);
      if (detailType === 'group') return 'send_group_msg';
      if (detailType === 'private') return 'send_private_msg';
      throw new Error(`不支持的 detail_type: ${detailType || '(空)'}`);
    },
    v11Params: params => {
      const detailType = str(params['detail_type']);
      const out: Record<string, unknown> = {
        message: params['message'] ?? [],
        auto_escape: false,
      };
      if (detailType === 'group') {
        out['group_id'] = num(requireParam(params, 'group_id'));
      } else {
        out['user_id'] = num(requireParam(params, 'user_id'));
      }
      return out;
    },
    data: raw => {
      const r = rec(raw);
      return {
        message_id: str(r['message_id']),
        time: typeof r['time'] === 'number' ? r['time'] : Date.now() / 1000,
      };
    },
  },

  delete_message: {
    v11Action: () => 'delete_msg',
    v11Params: params => ({ message_id: num(requireParam(params, 'message_id')) }),
    data: () => null,
  },

  get_message: {
    v11Action: () => 'get_msg',
    v11Params: params => ({ message_id: num(requireParam(params, 'message_id')) }),
    data: raw => toMessagePayload(raw),
  },

  get_self_info: {
    v11Action: () => 'get_login_info',
    v11Params: () => ({}),
    data: raw => {
      const r = rec(raw);
      return {
        user_id: str(r['user_id']),
        user_name: str(r['nickname']),
        user_displayname: '',
      };
    },
  },

  get_user_info: {
    v11Action: () => 'get_stranger_info',
    v11Params: params => ({ user_id: str(requireParam(params, 'user_id')) }),
    data: toUserInfo,
  },

  get_friend_list: {
    v11Action: () => 'get_friend_list',
    v11Params: () => ({}),
    data: raw => list(raw).map(toUserInfo),
  },

  get_group_info: {
    v11Action: () => 'get_group_info',
    v11Params: params => ({ group_id: str(requireParam(params, 'group_id')) }),
    data: toGroupInfo,
  },

  get_group_list: {
    v11Action: () => 'get_group_list',
    v11Params: () => ({}),
    data: raw => list(raw).map(toGroupInfo),
  },

  get_group_member_info: {
    v11Action: () => 'get_group_member_info',
    v11Params: params => ({
      group_id: str(requireParam(params, 'group_id')),
      user_id: str(requireParam(params, 'user_id')),
    }),
    data: toMemberInfo,
  },

  get_group_member_list: {
    v11Action: () => 'get_group_member_list',
    v11Params: params => ({ group_id: str(requireParam(params, 'group_id')) }),
    data: raw => list(raw).map(toMemberInfo),
  },

  set_group_name: {
    v11Action: () => 'set_group_name',
    v11Params: params => ({
      group_id: num(requireParam(params, 'group_id')),
      group_name: str(requireParam(params, 'group_name')),
    }),
    data: () => null,
  },

  leave_group: {
    v11Action: () => 'set_group_leave',
    v11Params: params => ({ group_id: num(requireParam(params, 'group_id')) }),
    data: () => null,
  },

  set_group_kick: {
    v11Action: () => 'set_group_kick',
    v11Params: params => ({
      group_id: num(requireParam(params, 'group_id')),
      user_id: num(requireParam(params, 'user_id')),
      reject_add_request: bool(params['reject_add_request']),
    }),
    data: () => null,
  },

  set_group_ban: {
    v11Action: () => 'set_group_ban',
    v11Params: params => ({
      group_id: num(requireParam(params, 'group_id')),
      user_id: num(requireParam(params, 'user_id')),
      duration: params['duration'] === undefined ? 1800 : num(params['duration']),
    }),
    data: () => null,
  },

  set_group_whole_ban: {
    v11Action: () => 'set_group_whole_ban',
    v11Params: params => ({
      group_id: num(requireParam(params, 'group_id')),
      enable: bool(params['enable']),
    }),
    data: () => null,
  },

  set_group_admin: {
    v11Action: () => 'set_group_admin',
    v11Params: params => ({
      group_id: num(requireParam(params, 'group_id')),
      user_id: num(requireParam(params, 'user_id')),
      enable: bool(params['enable']),
    }),
    data: () => null,
  },

  set_group_card: {
    v11Action: () => 'set_group_card',
    v11Params: params => ({
      group_id: num(requireParam(params, 'group_id')),
      user_id: num(requireParam(params, 'user_id')),
      card: str(params['card']),
    }),
    data: () => null,
  },

  send_like: {
    v11Action: () => 'send_like',
    v11Params: params => ({
      user_id: num(requireParam(params, 'user_id')),
      times: params['times'] === undefined ? 1 : num(params['times']),
    }),
    data: () => null,
  },

  get_status: {
    v11Action: () => 'get_status',
    v11Params: () => ({}),
    data: (raw, ctx) => {
      const r = rec(raw);
      return {
        good: r['good'] !== false,
        bots: [{
          self: { platform: OB12_PLATFORM, user_id: ctx.selfId },
          online: r['online'] !== false,
        }],
      };
    },
  },

  get_version: {
    v11Action: () => 'get_version_info',
    v11Params: () => ({}),
    data: raw => {
      const r = rec(raw);
      return {
        impl: str(r['app_name'] ?? 'snowcat'),
        version: str(r['app_version'] ?? '0.0.0'),
        onebot_version: '12',
      };
    },
  },
};

/** 标准动作之外由 bridge 本地实现的两个元动作 */
export const BUILTIN_ACTIONS = ['get_supported_actions', 'get_latest_events'] as const;

export const SUPPORTED_ACTIONS: string[] = [
  ...BUILTIN_ACTIONS,
  ...Object.keys(ACTION_SPECS),
];

export function buildRequest (action: string, params: Record<string, unknown>): BuildResult {
  const spec = ACTION_SPECS[action];
  if (!spec) {
    return { ok: false, retcode: OB12RetCode.UnsupportedAction, message: `不支持的动作 ${action}` };
  }
  try {
    return {
      ok: true,
      v11Action: spec.v11Action(params),
      v11Params: spec.v11Params(params),
    };
  } catch (e) {
    return {
      ok: false,
      retcode: OB12RetCode.BadParam,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

/** v11 的 retcode → 12 的返回码段 */
export function mapRetCode (v11RetCode: number): number {
  switch (v11RetCode) {
    case 0: return OB12RetCode.Ok;
    case 1400:
    case 400: return OB12RetCode.BadParam;
    case 1404: return OB12RetCode.UnsupportedAction;
    case 1403: return OB12RetCode.BadRequest;
    default: return OB12RetCode.PlatformError;
  }
}

export function translateResponse (
  action: string, ret: V11ReturnLike, ctx: TranslateContext
): OB12ActionResponse<unknown> {
  if (ret.status !== 'ok') {
    return {
      status: 'failed',
      retcode: mapRetCode(ret.retcode),
      data: null,
      message: ret.message ?? ret.wording ?? '',
    };
  }
  const spec = ACTION_SPECS[action];
  const data = spec?.data ? spec.data(ret.data, ctx) : (ret.data ?? null);
  return { status: 'ok', retcode: OB12RetCode.Ok, data, message: '' };
}
