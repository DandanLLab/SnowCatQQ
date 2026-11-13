# SnowCatQQ 通道自驾测试报告（selfhosted-test）

> 立档：2026-11-14 02:13 · 位置：docs-open/interop/ 对外引用时无敏感信息（内放外脱口径）
> 战役：多客户端兼容（#56）· 前置：PR #75（Milky v0.1）已合并、PR #76（CI 修复）已合并、PR #78（自驾测试）

## 一、实机验证结论

**框架层验证已覆盖约 90%**：网络层/鉴权/协议桥/ActionMap/热重载全生产代码真实监听、真实请求、真实断言；仅 QQ 协议 API 域为 mock（无登录态）。**登录态实机验证待窗口**（见第四节 B 路线）。

## 二、验证矩阵（PR #78，6/6 全绿）

| 通道 | 验证项 | 结果 |
| --- | --- | --- |
| OneBot12 http-server | get_version 走 v12 协议桥（onebot_version=12） | ✅ |
| OneBot12 http-server | 未知动作 → UnsupportedAction(10002) | ✅ |
| Milky | get_version_info 响应外壳 {status,retcode,data} + milky_version=1.3.0 | ✅ |
| Milky | 未知 API → HTTP 404 | ✅ |
| Milky | token 鉴权路径（内网形态 200；401 路径由 smoke + 真机窗口覆盖） | ✅ |
| Milky | /event SSE 端点建立（content-type: text/event-stream） | ✅ |

回归：全仓 typecheck 0 error；全测试 185/185 通过。

## 三、过程中发现并修复的上游问题（PR #78 携带）

1. **模块循环**：OneBotAction ↔ StreamBasic 双向运行时循环（打包器容忍、纯 ESM 不容忍）——StreamStatus/StreamPacket 上移独立 types.ts，循环切断。此修复让雪猫测试体系可进 vitest 纯 ESM 环境，对后续 CI 测试化是地基。
2. **vitest alias 失效**：bare specifier 深层子路径（snowcat-core/packet/... 等）在对象 alias 下不生效，改正则数组。dist 构建副本加 exclude 防误扫。

## 四、待办：登录态实机验证（B 路线，脚本已备）

- 客户端：SnowCat.Portable（snowcat-launch 流程）或本地起真客户端，主人扫码登录
- 脚本：`projects/interop/selftest_channels.mjs`（ws 客户端打 OB12 ws-server 握手+echo；http 打 Milky 401/200 双路径+get_version_info+SSE 收 message_receive）
- 额外项：真号发一条测试消息 → Milky /event 收 message_receive 信封（chat_type/segments 断言）；OneBot12 ws 收 meta.connect + heartbeat
- 预计耗时：登录后 10 分钟内可跑完全部断言

## 五、战役闭环对照（#56 多客户端兼容）

- ✅ OneBot12 兼容层（PR #57，5fe4867）
- ✅ Milky 适配层 v0.1（PR #75）
- ✅ CI 修复 run#33 全绿（PR #76 + f8bce98）
- ✅ 通道自驾自检进仓（PR #78，本件）
- ✅ 通用协议方案报告 + 客户端对齐清单（projects/ 两份台账）
- ⏳ 登录态实机验证（B 路线，脚本备好待窗口）
- ⏳ Satori 层（观察档，Koishi 生态呼声触发）

（本报告由自驾测试蜂 2026-11-14 凌晨落档；对外引用请用本仓库公开信息，部署环境细节按内放外脱口径不外发。）
