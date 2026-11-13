/**
 * Milky 兼容层。
 *
 * 与 onebot12 同一纪律：只做协议翻译，不改底层动作实现。
 * Milky 1.3 的 API 请求翻成 v11 的 action + params 交给现有 ActionMap，
 * 结果与事件翻回 Milky 形态；传输层见 milky/network/http.ts。
 * 规范：milky.ntqqrev.org（v1.3.0）
 */
export * from './types';
export * from './events';
export * from './actions';
export * from './bridge';
