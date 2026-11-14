# SnowCat 雪猫

> 雪取自 [SnowLuma](https://github.com/SnowLuma/SnowLuma)，猫取自 [NapCat](https://github.com/NapNeko/NapCatQQ)。
> 两个先行者铺下的路，自此由后来者接续。**上游在，我们跟；上游没了，我们扛。**

SnowCat 是一个由社区开发者维护的第三方 QQ 客户端：让开发者自己的智能体，接入开发者自己的生态。NapCat 4.18.28 底座 + SnowLuma 独门能力融合，全功能运行于 **QQ 9.9.37-54395（官方最新版）主进程内**。

## 核心特性

- **QQ 9.9.37-54395 全功能在役**：通过 V8 编译器通道注入（详见[制作文档](docs/dev/FROM-P1-TO-V8.md)），QQ 本体一字节未动
- **OneBot v12 全动作（默认协议）**：正向/反向 WS、HTTP、HTTP SSE 全接入方式；v11 兼容期 + Milky 1.3 兼容层
- **MCP 接入**：Streamable HTTP `/mcp`，全部 OneBot 动作自动暴露为 MCP 工具
- **56 项独门动作移植**（采自 SnowLuma）：QZone 全家桶、群相册、精华、打卡、装扮、闪照管理、收藏、点赞……
- **Packet 发包**：offset 表驱动，逐版本维护
- **雪猫 WebUI**：React + Tailwind + HeroUI 全面重制（总览/登录/网络/关于全页面）
- **便携环境制作器**：官方最新包一键解包、一键便携化
- **稳定线**：连接退避 + 真人节奏抖动 + 预算 + 熔断

## 快速开始

```powershell
# 1. 解包官方 QQ 安装包为便携结构（也可手动从官网下载安装包）
./tools/snowcat-qq-unpack.ps1 -Installer QQ_9.9.37_261103_x64_01.exe

# 2. 一键启动（部署 V8 通道 + 启动 + 健康检查）
./tools/build/snowcat-run.ps1

# 3. WebUI 就绪 → http://127.0.0.1:6099/webui/
```

## 文档

| 文档 | 内容 |
|---|---|
| [开源公告](docs/ANNOUNCEMENT.md) | 立场声明 · 生态主张 · 给官方的四个问题 |
| [从 P1 到 V8：完整攻关实录](docs/dev/FROM-P1-TO-V8.md) | 9.9.37 防护体系、全部死路档案、V8 通道原理、内核适配 |
| [架构审计](docs/dev/ARCHITECTURE-AUDIT.md) | 启动链、解包机制、逐字节审计结论 |

## 仓库结构

```
tools/
  snowcat-qq-unpack.ps1      官方安装包解包器
  snowcat-launch.ps1         零硬改启动器
  snowcat-portable-maker.ps1 便携制作器
  build/
    winmm-v8.c/.dll          V8 通道本体（源码+成品）
    snowcat-boot.js          引导脚本
    snowcat-run.ps1          9.9.37 一键启动器
    snowcat-hook.c           研究：观测 hook
    snowcat-inject.c         研究：注入器
    snowcat-reflect.c        研究：反射注入器
  webui-static/              WebUI 前端成品
docs/
  ANNOUNCEMENT.md            开源公告（终稿）
  dev/FROM-P1-TO-V8.md       攻关制作文档
  dev/ARCHITECTURE-AUDIT.md  架构审计
```

## 关于账号安全，说实话

第三方客户端无法在绝对意义上保证账号安全——这是事实，我们不回避。但不滥用，即是安全；有滥用，责任在使用者，不在工具，更不在社区。运行时全部在本地，代码全量开源，来源全部署名。**黑箱要求人「相信」，白盒只要求人「查看」。我们不索取信任，只提供证据。**

## 致谢

感谢 NapCat（126,400+ ⭐）与 SnowLuma（283 ⭐）。猫谢猫，雪接雪。你们留下的星，我们记下了，也不会让它们落空。

Ending 不是终点，是 SnowCat 的起点。

**SnowCat 开发组**
