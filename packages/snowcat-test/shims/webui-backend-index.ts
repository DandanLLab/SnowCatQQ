/**
 * vitest 专用 shim：替代 snowcat-webui-backend/index.ts。
 *
 * 真实 index.ts 会拉起全部 WebUI 路由（Debug.ts 与 snowcat-onebot 存在模块循环：
 * Debug extends OneBotAction，打包器按依赖序处理没问题，vitest 纯 ESM 循环下
 * extends undefined）。自驾测试只需要 pendingTokenToSend 与 WebUiDataRuntime，
 * 这里从子路径直取，绕过路由装配。
 */
export { pendingTokenToSend } from '../../snowcat-webui-backend/src/helper/Data';
export { WebUiDataRuntime } from '../../snowcat-webui-backend/src/helper/Data';
export default {};
