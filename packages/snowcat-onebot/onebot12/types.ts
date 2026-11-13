/**
 * OneBot 12 数据类型定义。
 *
 * 依据 botuniverse/onebot 的 OneBot-12 草案（specs/connect 与 specs/interface）。
 * 与原仓库的 OneBot 11 类型刻意不共享：12 的所有 ID 都是 string，
 * 事件用 type / detail_type / sub_type 三段式，动作名也不再带 send_xxx_msg 这类前缀。
 */

/** OneBot 12 中所有 ID 一律为字符串 */
export type OB12Id = string;

/** 消息段。data 为段内字段，标准段见 specs/interface/message/segments.md */
export interface OB12Segment {
  type: string;
  data: Record<string, unknown>;
}

/** 消息内容：消息段数组，或整条纯文本 */
export type OB12Message = OB12Segment[] | string;

/** 机器人自身标识 */
export interface OB12Self {
  platform: string;
  user_id: string;
}

/** 事件基本类型 */
export type OB12EventType = 'meta' | 'message' | 'notice' | 'request';

/** 所有事件的公共字段（meta 之外的事件还要带 self） */
export interface OB12EventBase {
  id: string;
  time: number;
  type: OB12EventType;
  detail_type: string;
  sub_type: string;
}

/** 非元事件的公共字段 */
export interface OB12EventWithSelf extends OB12EventBase {
  self: OB12Self;
}

/** message.group / message.private */
export interface OB12MessageEvent extends OB12EventWithSelf {
  type: 'message';
  detail_type: 'group' | 'private' | string;
  message_id: string;
  message: OB12Segment[];
  alt_message: string;
  user_id: string;
  group_id?: string;
}

/** notice.*，具体字段随 detail_type 变化，未列出的扩展字段照原样透传 */
export interface OB12NoticeEvent extends OB12EventWithSelf {
  type: 'notice';
  user_id?: string;
  group_id?: string;
  operator_id?: string;
  message_id?: string;
  [key: string]: unknown;
}

/** meta.connect / meta.heartbeat / meta.status_update，不带 self */
export interface OB12MetaEvent extends OB12EventBase {
  type: 'meta';
  detail_type: 'connect' | 'heartbeat' | 'status_update' | string;
  [key: string]: unknown;
}

export interface OB12RequestEvent extends OB12EventWithSelf {
  type: 'request';
  user_id?: string;
  group_id?: string;
  [key: string]: unknown;
}

export type OB12Event = OB12MessageEvent | OB12NoticeEvent | OB12RequestEvent | OB12MetaEvent;

/** 动作请求 */
export interface OB12ActionRequest {
  action: string;
  params?: Record<string, unknown>;
  echo?: unknown;
}

/** 动作响应 */
export interface OB12ActionResponse<T = unknown> {
  status: 'ok' | 'failed';
  retcode: number;
  data: T;
  message?: string;
  /** 请求里带了非空 echo 时原样返回 */
  echo?: string;
}

/** get_self_info / get_user_info 的响应数据 */
export interface OB12UserInfo {
  user_id: OB12Id;
  user_name: string;
  user_displayname: string;
  user_remark?: string;
}

/** get_group_info 的响应数据 */
export interface OB12GroupInfo {
  group_id: OB12Id;
  group_name: string;
}

/** get_group_member_info 的响应数据 */
export interface OB12GroupMemberInfo {
  user_id: OB12Id;
  user_name: string;
  user_displayname: string;
}

/** get_status 的响应数据 */
export interface OB12BotStatus {
  self: OB12Self;
  online: boolean;
}

export interface OB12Status {
  good: boolean;
  bots: OB12BotStatus[];
}

/** get_version 的响应数据 */
export interface OB12VersionInfo {
  impl: string;
  version: string;
  onebot_version: string;
}

/** 返回码，见 specs/connect/data-protocol/action-response.md */
export const OB12RetCode = {
  Ok: 0,
  BadRequest: 10001,
  UnsupportedAction: 10002,
  BadParam: 10003,
  UnsupportedParam: 10004,
  UnsupportedSegment: 10005,
  BadSegmentData: 10006,
  InternalHandlerError: 20002,
  PlatformError: 34000,
} as const;

export const OB12_PLATFORM = 'qq';
export const OB12_STANDARD_VERSION = '12';
