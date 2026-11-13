/**
 * OneBot 11 事件/消息 → Milky 1.3 事件。
 *
 * 第一版按派单纪律从现有 OB11 形态事件转译（中立事件层第二阶段再做）。
 * 事件源是 networkManager 广播的 OneBotEvent / OB11Message（见 network/index.ts 的
 * OB11EmitEventContent），这里逐 post_type 分流转换。
 *
 * 消息段直转对照（OB11 → Milky IncomingSegment）：
 *   text → text / at → mention / at(all) → mention_all / face → face /
 *   reply → reply / image → image / record → record / video → video /
 *   file → file / forward → forward / json → light_app / xml → xml /
 *   markdown → markdown
 * 其余段按 Milky 兼容性纪律丢弃并在 alt 层留文本说明（不硬造未知子类型）。
 */
import {
  MilkyEventEnvelope, MilkyGroupMemberChange, MilkyGroupMemberChangeSubType,
  MilkyMessageReceiveEvent, MilkyMessageRecallEvent, MilkySegment,
} from './types';

export interface V11SenderLike {
  user_id?: number | string;
  nickname?: string;
  card?: string;
}

export interface V11SegmentLike {
  type: string;
  data: Record<string, unknown>;
}

/** 网络层广播的统一事件形态：类实例（带 post_type）或 OB11Message 对象 */
export interface MilkyV11EventLike {
  post_type?: string;
  time?: number;
  self_id?: number | string;
  message_type?: string;
  sub_type?: string;
  notice_type?: string;
  request_type?: string;
  message_id?: number | string;
  message_seq?: number | string;
  user_id?: number | string;
  group_id?: number | string;
  operator_id?: number | string;
  target_id?: number | string;
  sender_id?: number | string;
  message?: unknown;
  raw_message?: string;
  sender?: V11SenderLike;
  nickname?: string;
  card?: string;
  comment?: string;
  flag?: string;
  duration?: number;
  likes?: Array<{ emoji_id?: string; count?: number; }>;
}

const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v));

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const rec = (v: unknown): Record<string, unknown> =>
  (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {});

function withOptional (target: Record<string, unknown>, key: string, value: unknown): void {
  if (value !== undefined && value !== null && value !== '' && value !== 0) {
    target[key] = value;
  }
}

/** 单段：OB11 { type, data } → Milky { type, data }（扁平化字段） */
function convertSegment (type: string, data: Record<string, unknown>): MilkySegment | null {
  switch (type) {
    case 'text':
      return { type: 'text', data: { text: str(data['text']) } };
    case 'at': {
      const qq = str(data['qq']);
      if (qq === 'all') {
        return { type: 'mention_all', data: {} };
      }
      return { type: 'mention', data: { user_id: num(qq), name: str(data['name']) } };
    }
    case 'face':
      return { type: 'face', data: { face_id: str(data['id']) } };
    case 'mface':
      // 商城表情：Milky 是 market_face，字段直接对齐（v1.1+）
      return {
        type: 'market_face',
        data: {
          emoji_package_id: num(data['emoji_package_id']),
          emoji_id: str(data['emoji_id']),
          key: str(data['key']),
          summary: str(data['summary']),
          url: str(data['url']),
        },
      };
    case 'reply':
      return { type: 'reply', data: { message_seq: num(data['id'] ?? data['seq']) } };
    case 'image': {
      const out: Record<string, unknown> = {
        resource_id: str(data['file'] ?? data['file_id']),
        temp_url: str(data['url']),
        width: num(data['width']) || 0,
        height: num(data['height']) || 0,
        sub_type: 'normal',
      };
      withOptional(out, 'summary', data['summary']);
      return { type: 'image', data: out };
    }
    case 'record':
      return {
        type: 'record',
        data: { resource_id: str(data['file'] ?? data['file_id']), temp_url: str(data['url']) },
      };
    case 'video':
      return {
        type: 'video',
        data: {
          resource_id: str(data['file'] ?? data['file_id']),
          temp_url: str(data['url']),
        },
      };
    case 'file':
      return {
        type: 'file',
        data: {
          file_id: str(data['file'] ?? data['file_id']),
          file_name: str(data['name']),
        },
      };
    case 'json':
    case 'miniapp':
      return {
        type: 'light_app',
        data: { app_name: str(data['app_name'] ?? ''), json_payload: str(data['data'] ?? data['json']) },
      };
    case 'xml':
      return { type: 'xml', data: { service_id: num(data['service_id'] ?? 0), xml_payload: str(data['data'] ?? data['xml']) } };
    case 'markdown':
      return { type: 'markdown', data: { content: str(data['content']) } };
    case 'node':
      // 合并转发在事件侧表现为 forward 段，node 只出现在发送载荷（actions.ts 处理）
      return null;
    case 'forward':
      return {
        type: 'forward',
        data: { forward_id: str(data['id'] ?? data['forward_id'] ?? '') },
      };
    default:
      // 兼容性纪律：未知子类型不抛错，丢弃并降级（应用端按 text 兜底由对端决定）
      return null;
  }
}

/** OB11 消息内容（段数组或纯文本）→ Milky 段数组 */
export function toMilkySegments (raw: unknown): MilkySegment[] {
  if (Array.isArray(raw)) {
    return raw
      .map(seg => {
        const r = rec(seg);
        return convertSegment(str(r['type']) || 'text', rec(r['data']));
      })
      .filter((s): s is MilkySegment => s !== null);
  }
  if (typeof raw === 'string' && raw.length > 0) {
    return [{ type: 'text', data: { text: raw } }];
  }
  return [];
}

let seq = 0;

/** Milky 事件无 id 字段（信封只有 time/self_id/event_type），seq 仅供内部缓冲去重 */
function nextSeq (): number {
  seq = (seq + 1) % 0xffffff;
  return seq;
}

/** 消息事件：OB11 message → Milky message_receive */
function toMessageReceive (event: MilkyV11EventLike): MilkyEventEnvelope | null {
  const isGroup = event.message_type === 'group';
  const sender = event.sender ?? {};
  const segments = toMilkySegments(event.message);
  const message: MilkyMessageReceiveEvent['message'] = {
    message_seq: num(event.message_id ?? event.message_seq),
    time: typeof event.time === 'number' ? event.time : Math.floor(Date.now() / 1000),
    sender_id: num(event.user_id ?? sender.user_id),
    sender_nickname: str(sender.nickname ?? event.nickname),
    segments,
  };
  withOptional(message as unknown as Record<string, unknown>, 'sender_nickname_card', sender.card);
  return {
    time: Math.floor(Date.now() / 1000),
    self_id: num(event.self_id),
    event_type: 'message_receive',
    data: {
      peer_id: isGroup ? num(event.group_id) : num(event.user_id ?? sender.user_id),
      chat_type: isGroup ? 'group' : 'c2c',
      message,
    },
  };
}

/** 撤回：group_recall / friend_recall → message_recall */
function toMessageRecall (event: MilkyV11EventLike): MilkyEventEnvelope | null {
  const isGroup = event.notice_type === 'group_recall';
  const data: MilkyMessageRecallEvent = {
    peer_id: isGroup ? num(event.group_id) : num(event.user_id),
    chat_type: isGroup ? 'group' : 'c2c',
    message_seq: num(event.message_id),
    sender_id: num(event.user_id),
  };
  withOptional(data as unknown as Record<string, unknown>, 'operator_id', num(event.operator_id));
  return {
    time: Math.floor(Date.now() / 1000),
    self_id: num(event.self_id),
    event_type: 'message_recall',
    data: data as unknown as Record<string, unknown>,
  };
}

/** 群成员增减：group_increase → group_member_increase（sub_type 按 Milky 枚举） */
function toGroupMemberIncrease (event: MilkyV11EventLike): MilkyEventEnvelope {
  const subType = event.sub_type === 'invite'
    ? MilkyGroupMemberChangeSubType.Invited
    : MilkyGroupMemberChangeSubType.Approve;
  const data: MilkyGroupMemberChange = {
    group_id: num(event.group_id),
    user_id: num(event.user_id),
    operator_id: num(event.operator_id),
    sub_type: subType,
  };
  return {
    time: Math.floor(Date.now() / 1000),
    self_id: num(event.self_id),
    event_type: 'group_member_increase',
    data: data as unknown as Record<string, unknown>,
  };
}

/** group_decrease → group_member_decrease */
function toGroupMemberDecrease (event: MilkyV11EventLike): MilkyEventEnvelope {
  const subType = event.sub_type === 'kick'
    ? MilkyGroupMemberChangeSubType.Kick
    : MilkyGroupMemberChangeSubType.Leave;
  const data: MilkyGroupMemberChange = {
    group_id: num(event.group_id),
    user_id: num(event.user_id),
    operator_id: num(event.operator_id),
    sub_type: subType,
  };
  return {
    time: Math.floor(Date.now() / 1000),
    self_id: num(event.self_id),
    event_type: 'group_member_decrease',
    data: data as unknown as Record<string, unknown>,
  };
}

/**
 * 把一条网络层事件转成 Milky 事件信封。
 * 返回 null 表示这一条在 Milky v1.3 里没有对应形态（第一版不硬造），调用方直接丢弃。
 */
export function toMilkyEvent (event: MilkyV11EventLike): MilkyEventEnvelope | null {
  switch (event.post_type) {
    case 'message':
      return toMessageReceive(event);
    case 'message_sent':
      // 自己发送的消息第一版不上报（reportSelfMessage 场景后续再接）
      return null;
    case 'notice': {
      const noticeType = event.notice_type ?? '';
      switch (noticeType) {
        case 'group_recall':
        case 'friend_recall':
          return toMessageRecall(event);
        case 'group_increase':
          return toGroupMemberIncrease(event);
        case 'group_decrease':
          return toGroupMemberDecrease(event);
        default:
          // 其余通知（admin/ban/poke/emoji 等）第一版不覆盖，不硬造
          return null;
      }
    }
    case 'request':
    case 'meta_event':
      // Milky v1.3 的好友/入群申请走 group_notifications 轮询而非推送事件，第一版不覆盖
      return null;
    default:
      return null;
  }
}

/** 冒烟/测试用：内部缓冲序号导出 */
export function peekSeq (): number {
  return nextSeq();
}
