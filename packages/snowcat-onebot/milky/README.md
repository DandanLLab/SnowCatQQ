# Milky 兼容层

把本项目的 OneBot 11 协议面翻译成 [Milky](https://milky.ntqqrev.org/) v1.3（QQ 机器人应用接口标准，Lagrange 生态对外标准）。

只做协议翻译，不改任何底层动作实现：`packages/snowcat-onebot/action/**` 一行没动，
Milky 的 API 请求翻成 11 的 `action + params` 交给现有 `ActionMap`，结果再翻回 Milky 形态。
模式与 `onebot12/` 一致（那里的 README 解释了为什么不直接改两套协议焊死）。

## 文件

| 文件 | 作用 |
| --- | --- |
| `types.ts` | Milky 1.3 的消息段 / 事件 / 响应外壳 / 返回码类型 |
| `events.ts` | v11 事件 → Milky event_type 信封（含消息段直转） |
| `actions.ts` | Milky API → v11 动作，参数与返回数据的整形 |
| `bridge.ts` | `MilkyBridge`：`dispatch()` 处理 API，`convertEvent()` 转发事件 |
| `network/http.ts` | `MilkyServerAdapter`：HTTP 服务 + SSE/WS 事件推送 + WebHook |
| `smoke.ts` | 不依赖 QQ、不依赖 node_modules 的协议冒烟测试 |

## 通信模型（规范 guide/communication）

- `POST /api/:api`：API 调用，Bearer access_token 鉴权（失败 HTTP 401），未知 API 返回 HTTP 404
- `GET /event`：事件推送，SSE（`text/event-stream`）；开启 `enableWebsocket` 时
  带 `Upgrade: websocket` 的请求走 WebSocket 长连接（按规范按 Upgrade 头分流）
- WebHook：`webhooks` 配置的每个地址都会收到与 `/event` 同一信封的 POST
- 响应外壳 `{status, retcode, data, message}`：成功 `retcode=0`，参数错 `-400`，
  未知 API `-404`，未登录 `-403`，其余内部错误 `-500`

## API 覆盖（v0.1 核心 10 个）

| Milky | 落到 OneBot 11 |
| --- | --- |
| `send_private_message` | `send_private_msg`（message 段翻译） |
| `send_group_message` | `send_group_msg` |
| `get_login_info` | `get_login_info` |
| `get_friend_list` | `get_friend_list` |
| `get_group_info` / `get_group_list` | 同名 |
| `get_group_member_list` | `get_group_member_list`（role 值整形） |
| `get_message` | `get_msg`（message_seq ↔ message_id） |
| `delete_message` | `delete_msg` |
| `get_version_info` | `get_version_info`（附 `milky_version: "1.3.0"`） |

消息段直转（双向）：`text` / `at ↔ mention` / `at(all) ↔ mention_all` / `face` /
`mface ↔ market_face` / `reply`（id ↔ message_seq）/ `image` / `record` / `video` /
`file` / `json、miniapp ↔ light_app` / `xml` / `markdown` / `forward ↔ forward`。
未知段按 Milky 兼容性纪律丢弃或降级为文本，不硬造子类型。

## 事件覆盖（v0.1）

| OB11 | Milky |
| --- | --- |
| `message`（group/private） | `message_receive`（chat_type: group/c2c） |
| `group_recall` / `friend_recall` | `message_recall` |
| `group_increase`（approve/invite） | `group_member_increase`（sub_type 4/3） |
| `group_decrease`（leave/kick） | `group_member_decrease`（sub_type 1/2） |
| 其余 notice / request / meta / message_sent | v0.1 不覆盖，直接丢弃（不硬造） |

## 接入方式

配置文件 `onebot11_<uin>.json` 的 `network.milkyServers` 新增数组项
（WebUI「网络配置 → 新建 → Milky 服务器」同款）：

```json5
{
  "name": "milky-main",
  "enable": true,
  "host": "127.0.0.1",
  "port": 3100,
  "token": "<REDACTED>",
  "enableCors": true,
  "enableWebsocket": false,
  "webhooks": [],
  "debug": false
}
```

公网部署必须配置强随机 `token`（规范要求，`127.0.0.1` 之外无 token 会被 WebUI 拦）。

## 类型与冒烟

```bash
# 类型检查（milky 四件套无外部依赖，可独立编译）
npx -y -p typescript@5.9 tsc --noEmit --strict \
    packages/snowcat-onebot/milky/types.ts \
    packages/snowcat-onebot/milky/events.ts \
    packages/snowcat-onebot/milky/actions.ts \
    packages/snowcat-onebot/milky/bridge.ts

# 冒烟：编译成 CJS 直接跑，不需要装依赖
npx -y -p typescript@5.9 tsc --noEmit false --outDir /tmp/milky \
    --module commonjs --moduleResolution node10 --target ES2021 \
    packages/snowcat-onebot/milky/{types,events,actions,bridge,smoke}.ts
echo '{"type":"commonjs"}' > /tmp/milky/package.json
node /tmp/milky/smoke.js
```

当前结果：类型检查 0 error，冒烟 53 项全通过。

## 已知边界（v0.1）

- 未覆盖的 API：`get_user_info` / `get_group_member_info` / `set_*` 群管系列 /
  文件接口（`get_resource_url` 等）。需要时在 `actions.ts` 的 `MILKY_API_SPECS`
  加一行映射即可，模式已铺好。
- `webhooks` 的 WebUI 表单编辑 v0.2 再加（数组编辑体验，先走配置文件）。
- 未接 `get_latest_events` 类本地缓冲（Milky 规范无此 API，事件只有推送）。
- 中立事件层是第二阶段工程：本层当前直接从 OB11 形态事件转译（派单纪律⑤），
  v12 的 `events.ts` 与本文件未来一起改挂中立源。

（本层 2026-11-13 立，参照 PR #57 OneBot 12 兼容层的适配层范式。Refs #56。）
