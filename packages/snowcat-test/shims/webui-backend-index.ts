/**
 * vitest/独立客户端模式专用 shim：替代 snowcat-webui-backend/index.ts。
 *
 * 真实 index.ts 会拉起全部 WebUI 路由（Debug.ts 与 snowcat-onebot 存在模块循环：
 * Debug extends OneBotAction，打包器按依赖序处理没问题，纯 ESM 循环下
 * extends undefined）。调用方只需要 pendingTokenToSend 与 WebUiDataRuntime。
 * 注意：pendingTokenToSend 在 index.ts 是 export let（可写绑定），
 * Data.ts 子路径没有它——这里用活的 getter/setter 替身补齐语义。
 */
export { WebUiDataRuntime } from '../../snowcat-webui-backend/src/helper/Data';

let pendingToken: string | null = null;
export function getPendingTokenToSend (): string | null {
  return pendingToken;
}
export function setPendingTokenToSend (token: string | null): void {
  pendingToken = token;
}
// 命名导出必须与真模块同名（snowcat-onebot/index.ts 按名 import）；
// let 的活绑定语义由 getPendingTokenToSend 承担，常量快照只是兼容占位。
export const pendingTokenToSend: string | null = null;
export default {};
