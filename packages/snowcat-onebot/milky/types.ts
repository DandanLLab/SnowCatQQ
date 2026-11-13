/**
 * Milky 1.3 数据类型定义。
 *
 * 依据 milky.ntqqrev.org 的 v1.3.0 规范（struct/Event、struct/IncomingSegment、
 * guide/communication 的响应外壳）。与 OneBot 类型刻意不共享：
 * Milky 全部 ID 为 int64（TS number），事件用 event_type 单段式，
 * 消息段是 { type, data } 的扁平两段式（与 OneBot 的 { type, data: {...} } 不同层）。
 *
 * 兼容性纪律（官网 guide/compatibility）：请求结构体只加可选/默认值字段，
 * 响应结构体只加不减不改名，联合类型只加子类型。
 */

/** 消息段：type 区分，data 随 type 变化 */
export interface MilkySegment {
  type: string;
  data: Record<string, unknown>;
}

/** 机器人自身信息（get_login_info） */
export interface MilkySelfInfo {
  user_id: number;
  nickname: string;
}

/** 用户信息（get_user_info，1.2 起含 more 字段可省略） */
export interface MilkyUserInfo {
  user_id: number;
  nickname: string;
  remark?: string;
  avatar_url?: string;
}

/** 好友信息（get_friend_list，仅列核心字段；扩展字段照规范只加不减） */
export interface MilkyFriendInfo {
  user_id: number;
  nickname: string;
  remark?: string;
}

/** 群信息（get_group_info） */
export interface MilkyGroupInfo {
  group_id: number;
  group_name: string;
  member_count?: number;
  max_member_count?: number;
}

/** 群成员信息（get_group_member_info / get_group_member_list） */
export interface MilkyGroupMemberInfo {
  user_id: number;
  nickname: string;
  role: 'member' | 'admin' | 'owner';
  card?: string;
  title?: string;
  level?: number;
}

/** 消息对象（get_message 的 data） */
export interface MilkyMessage {
  message_seq: number;
  time: number;
  user_id: number;
  peer_id: number;
  chat_type: 'group' | 'c2c';
  segments: MilkySegment[];
}

/** API 响应外壳（guide/communication：status/retcode/data/message） */
export interface MilkyResponse<T = unknown> {
  status: 'ok' | 'failed';
  retcode: number;
  data: T;
  message?: string;
}

/** 事件信封（emitEvent 统一出口） */
export interface MilkyEventEnvelope {
  time: number;
  self_id: number;
  event_type: string;
  data: Record<string, unknown>;
}

// ==================== 事件类型（struct/Event 的 v1.3 子集） ====================

/** message_receive（C2C / Group） */
export interface MilkyMessageReceiveEvent {
  peer_id: number;
  chat_type: 'group' | 'c2c';
  message: {
    message_seq: number;
    time: number;
    sender_id: number;
    sender_nickname: string;
    sender_nickname_card?: string;
    segments: MilkySegment[];
  };
}

/** message_recall（C2C / Group） */
export interface MilkyMessageRecallEvent {
  peer_id: number;
  chat_type: 'group' | 'c2c';
  message_seq: number;
  sender_id: number;
  operator_id?: number;
}

/** group_member_increase / group_member_decrease */
export interface MilkyGroupMemberChange {
  group_id: number;
  user_id: number;
  operator_id?: number;
  sub_type: number;
}

/** 群通知子类型（v1.3 规范枚举值） */
export const MilkyGroupMemberChangeSubType = {
  /** 主动退群 */
  Leave: 1,
  /** 被移出 */
  Kick: 2,
  /** 被邀请入群 */
  Invited: 3,
  /** 搜号码入群 */
  Approve: 4,
} as const;

// ==================== 返回码（guide/communication 实测口径） ====================

export const MilkyRetCode = {
  /** 成功 */
  Ok: 0,
  /** 参数解析失败（如 user_id 不合法） */
  BadParam: -400,
  /** 不支持或未找到的 API */
  NotFound: -404,
  /** 未处于登录状态 */
  NotLoggedIn: -403,
  /** 协议端内部错误 */
  InternalError: -500,
} as const;

/** 事件缓冲上限（get_latest_events 类功能暂不提供，此值仅供内部环形缓冲） */
export const MILKY_EVENT_BUFFER_MAX = 100;

/** Milky 标准版本号（version_info 用） */
export const MILKY_STANDARD_VERSION = '1.3.0';
