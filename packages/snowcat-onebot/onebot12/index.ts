/**
 * OneBot 12 兼容层。
 *
 * 只做协议翻译，不改底层动作实现：12 的请求翻成 11 的 action + params，
 * 交给现有 ActionMap 执行，再把结果和事件翻回 12 的形态。
 * 传输层（WebSocket / HTTP / SSE）沿用现有的 network/*，把 handleLine 接上去即可。
 */
export * from './types';
export * from './events';
export * from './actions';
export * from './bridge';
