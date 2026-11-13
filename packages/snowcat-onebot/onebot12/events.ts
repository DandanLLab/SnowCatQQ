/**
 * OneBot 11 事件 → OneBot 12 事件。
 *
 * 对照 specs/connect/data-protocol/event.md 与 specs/interface/**\/notice-events.md：
 * 12 的事件没有 post_type，改用 type + detail_type + sub_type；
 * 所有 ID 转成字符串；非元事件必须带 self。
 * 标准里没有定义的 v11 通知类型，按 specs/interface/rules.md 的扩展规则加 `qq.` 前缀。
 */
import {
  OB12Event, OB12MessageEvent, OB12NoticeEvent, OB12RequestEvent, OB12Segment, OB12Self,
  OB12_PLATFORM,
} from './types';

export interface V11SenderLike {
  user_id?: number | string;
  nickname?: string;
  card?: string;
}

export interface V11EventLike {
  post_type?: string;
  time?: number;
  self_id?: number | string;
  message_type?: string;
  sub_type?: string;
  notice_type?: string;
  request_type?: string;
  message_id?: number | string;
  user_id?: number | string;
  group_id?: number | string;
  operator_id?: number | string;
  target_id?: number | string;
  message?: unknown;
  raw_message?: string;
  sender?: V11SenderLike;
  nickname?: string;
  comment?: string;
  flag?: string;
  file?: { name?: string; size?: number; };
  duration?: number;
}

const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v));

const rec = (v: unknown): Record<string, unknown> =>
  (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {});

let seq = 0;

/** 事件 id 只要求唯一，不要求可反解。这里用时间戳 + 自增序号，避免引入额外依赖。 */
function nextEventId (): string {
  seq = (seq + 1) % 0xffffff;
  return `${Date.now().toString(16)}-${seq.toString(16).padStart(6, '0')}`;
}

function withOptional (target: Record<string, unknown>, key: string, value: unknown): void {
  if (value !== undefined && value !== null && value !== '') {
    target[key] = value;
  }
}

/** 单个消息段：标准段改名，非标准段统一加 qq. 前缀 */
function convertSegment (type: string, data: Record<string, unknown>): OB12Segment {
  switch (type) {
    case 'text':
      return { type: 'text', data: { text: str(data['text']) } };
    case 'at':
      return { type: 'mention', data: { user_id: str(data['qq'] ?? data['user_id']) } };
    case 'reply':
      return { type: 'reply', data: { message_id: str(data['id'] ?? data['message_id']) } };
    case 'image':
    case 'record':
    case 'video':
    case 'file': {
      const out: Record<string, unknown> = { file_id: str(data['file'] ?? data['file_id']) };
      withOptional(out, 'qq.url', data['url']);
      return { type, data: out };
    }
    default: {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(data)) {
        out[k] = v;
      }
      return { type: `qq.${type}`, data: out };
    }
  }
}

export function toSegments (raw: unknown): OB12Segment[] {
  if (Array.isArray(raw)) {
    return raw.map(seg => {
      const r = rec(seg);
      return convertSegment(str(r['type']) || 'text', rec(r['data']));
    });
  }
  if (typeof raw === 'string' && raw.length > 0) {
    return [{ type: 'text', data: { text: raw } }];
  }
  return [];
}

/** 12 的 alt_message：没有现成的就用段落拼一个粗糙版本 */
export function buildAltMessage (segments: OB12Segment[], rawMessage: string | undefined): string {
  if (rawMessage && rawMessage.length > 0) {
    return rawMessage;
  }
  return segments.map(seg => {
    switch (seg.type) {
      case 'text': return str(seg.data['text']);
      case 'mention': return `@${str(seg.data['user_id'])}`;
      case 'image': return '[图片]';
      case 'record': return '[语音]';
      case 'video': return '[视频]';
      case 'file': return '[文件]';
      case 'reply': return '';
      default: return `[${seg.type}]`;
    }
  }).join('');
}

/** v11 notice_type → 12 的 detail_type / sub_type */
function mapNotice (noticeType: string, subType: string | undefined): { detailType: string; subType: string; } {
  switch (noticeType) {
    case 'group_increase':
      return { detailType: 'group_member_increase', subType: subType === 'invite' ? 'invite' : 'join' };
    case 'group_decrease': {
      if (subType === 'leave') return { detailType: 'group_member_decrease', subType: 'leave' };
      if (subType === 'disband') return { detailType: 'group_member_decrease', subType: 'qq.disband' };
      return { detailType: 'group_member_decrease', subType: 'kick' };
    }
    case 'group_recall':
      return { detailType: 'group_message_delete', subType: 'recall' };
    case 'friend_recall':
      return { detailType: 'private_message_delete', subType: 'recall' };
    case 'friend_add':
      return { detailType: 'friend_increase', subType: '' };
    case 'friend_decrease':
      return { detailType: 'friend_decrease', subType: '' };
    // 以下标准未定义，按扩展规则加前缀
    case 'group_admin':
      return { detailType: 'qq.group_admin', subType: subType === 'unset' ? 'unset' : 'set' };
    default:
      return { detailType: `qq.${noticeType}`, subType: subType ?? '' };
  }
}

/**
 * 把一条 v11 事件转成 v12。
 * 返回 null 表示这一条在 12 里没有对应形态（例如 message_sent、lifecycle、heartbeat）。
 */
export function toOB12Event (event: V11EventLike): OB12Event | null {
  const self: OB12Self = { platform: OB12_PLATFORM, user_id: str(event.self_id) };
  const time = typeof event.time === 'number' ? event.time : Math.floor(Date.now() / 1000);

  switch (event.post_type) {
    case 'message': {
      const isGroup = event.message_type === 'group';
      const segments = toSegments(event.message);
      const out: OB12MessageEvent = {
        id: nextEventId(),
        self,
        time,
        type: 'message',
        detail_type: isGroup ? 'group' : 'private',
        sub_type: event.sub_type && event.sub_type !== 'normal' ? `qq.${event.sub_type}` : '',
        message_id: str(event.message_id),
        message: segments,
        alt_message: buildAltMessage(segments, event.raw_message),
        user_id: str(event.user_id ?? event.sender?.user_id),
      };
      if (isGroup) {
        out.group_id = str(event.group_id);
      }
      return out;
    }
    case 'notice': {
      const noticeType = event.notice_type ?? '';
      const mapped = mapNotice(noticeType, event.sub_type);
      const out: OB12NoticeEvent = {
        id: nextEventId(),
        self,
        time,
        type: 'notice',
        detail_type: mapped.detailType,
        sub_type: mapped.subType,
        'qq.notice_type': noticeType,
      };
      withOptional(out, 'user_id', str(event.user_id));
      withOptional(out, 'group_id', str(event.group_id));
      withOptional(out, 'operator_id', str(event.operator_id ?? event.target_id));
      withOptional(out, 'message_id', str(event.message_id));
      if (event.file) {
        out['qq.file'] = event.file;
      }
      return out;
    }
    case 'request': {
      // 12 标准没有定义 request 的具体类型，整条走扩展
      const requestType = event.request_type ?? 'unknown';
      const out: OB12RequestEvent = {
        id: nextEventId(),
        self,
        time,
        type: 'request',
        detail_type: `qq.${requestType}`,
        sub_type: event.sub_type ?? '',
        'qq.request_type': requestType,
        'qq.flag': str(event.flag),
        'qq.comment': str(event.comment),
      };
      withOptional(out, 'user_id', str(event.user_id));
      withOptional(out, 'group_id', str(event.group_id));
      return out;
    }
    default:
      // message_sent / meta_event(lifecycle, heartbeat) 不在 12 的事件集合里
      return null;
  }
}
