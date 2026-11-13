# OneBot 12 兼容层

把本项目的 OneBot 11 协议面翻译成 OneBot 12（`botuniverse/onebot` 的 12 草案）。

只做协议转换，不改任何底层动作实现：`packages/snowcat-onebot/action/**` 一行没动，
12 的请求翻成 11 的 `action + params` 交给现有 `ActionMap`，结果再翻回 12 的形态。

## 为什么不直接改 294 个文件

现有 `packages/snowcat-onebot` 里动作按 11 的名字注册（`send_group_msg`、
`get_version_info`、`set_group_leave`…），事件类也都带 `post_type`。
逐个改等于把两套协议焊死在一起，上游同步时会持续冲突。
所以这里做的是适配层，11 的实现保持原样，12 走另一条出口。

## 文件

| 文件 | 作用 |
| --- | --- |
| `types.ts` | OneBot 12 的 ID / 事件 / 动作响应类型，以及规范的返回码表 |
| `events.ts` | v11 事件 → v12 事件（含 `qq.` 前缀的扩展规则） |
| `actions.ts` | v12 动作名 → v11 动作名，参数与返回数据的整形 |
| `bridge.ts` | `OneBot12Bridge`：`dispatch()` 处理动作，`convertEvent()` 转发事件 |
| `smoke.ts` | 不依赖 QQ、不依赖 node_modules 的协议冒烟测试 |

## 动作映射

| OneBot 12 | 落到 OneBot 11 |
| --- | --- |
| `send_message`（detail_type=group） | `send_group_msg` |
| `send_message`（detail_type=private） | `send_private_msg` |
| `delete_message` | `delete_msg` |
| `get_message` | `get_msg` |
| `get_self_info` | `get_login_info` |
| `get_user_info` | `get_stranger_info` |
| `get_friend_list` | `get_friend_list` |
| `get_group_info` / `get_group_list` | 同名 |
| `get_group_member_info` / `get_group_member_list` | 同名 |
| `set_group_name` | `set_group_name` |
| `leave_group` | `set_group_leave` |
| `set_group_kick` / `set_group_ban` / `set_group_whole_ban` / `set_group_admin` / `set_group_card` | 同名 |
| `send_like` | `send_like` |
| `get_status` | `get_status`（重排成 `{good, bots[]}`） |
| `get_version` | `get_version_info`（固定 `onebot_version: "12"`） |
| `get_supported_actions` / `get_latest_events` | 由 bridge 本地实现 |

字段整形：
- 所有 ID 出站转 `string`，入站转 `number`（底层 API 仍吃数字）
- `nickname` → `user_name`，`card` → `user_displayname`，`remark` → `user_remark`

## 事件映射

| OneBot 11 | OneBot 12 |
| --- | --- |
| `post_type: message` + `message_type: group` | `type: message`, `detail_type: group` |
| `post_type: message` + `message_type: private` | `type: message`, `detail_type: private` |
| `group_increase`（approve） | `notice.group_member_increase`, `sub_type: join` |
| `group_decrease`（leave/kick） | `notice.group_member_decrease` |
| `group_recall` | `notice.group_message_delete`, `sub_type: recall` |
| `friend_recall` | `notice.private_message_delete` |
| `friend_add` | `notice.friend_increase` |
| 其它 `notice_type` | `qq.<notice_type>`（按扩展规则加前缀） |
| `message_sent` / `meta_event` | 丢弃，12 没有对应形态 |

消息段：`at` → `mention`，`reply` → `reply`，`image/record/video/file` 的 `file` 改名
`file_id` 并把原 `url` 放在 `qq.url`，其余段统一加 `qq.` 前缀。

## 接入传输层

`bridge.handleLine()` 收一行 JSON 吐一行 JSON，与传输无关。接现有正向 WS，
在 `packages/snowcat-onebot/network/websocket-server.ts` 的 `handleMessage` 里
加一个分支即可（示例，未改动原文件）：

```ts
if (this.config.protocol === 'onebot12') {
  const line = await this.bridge.handleLine(message.toString());
  await this.checkStateAndReply<unknown>(JSON.parse(line), wsClient);
  return;
}
```

事件侧在 `onEvent` 里改成：

```ts
const line = this.bridge.convertEvent(event as V11EventLike);
if (line) wsClient.send(JSON.stringify(line));
```

连接建立时发 `meta.connect`，心跳用 `bridge.buildHeartbeatEvent()`。

## 类型与冒烟

```bash
# 类型检查（沿用仓库 tsconfig.base.json 的严格档：strict / noUncheckedIndexedAccess 等）
tsc -p packages/snowcat-onebot/onebot12/tsconfig.json --noEmit

# 冒烟：编译成 CJS 直接跑，不需要装依赖
rm -rf /tmp/ob12
tsc -p packages/snowcat-onebot/onebot12/tsconfig.json \
    --noEmit false --outDir /tmp/ob12 --module commonjs --moduleResolution node10
echo '{"type":"commonjs"}' > /tmp/ob12/package.json
node /tmp/ob12/smoke.js
```

当前结果：类型检查 0 error，冒烟 63 项全通过。

## 已知边界

- 未接 `upload_file` / `get_file` 系列：12 的文件接口是平台无关的 file_id 体系，
  和 NapCat 的 `file://`/`base64://` 两套语义对不上，硬映射会给出错误的 file_id。
  需要的话建议作为 `qq.upload_file` 扩展动作单独实现，而不是塞进标准动作。
- `get_latest_events` 不做长轮询等待，`timeout > 0` 时也立即返回当前缓冲。
- 单连接单账号：不处理请求里的 `self` 字段，多账号场景需要再加一层分发。
- `sub_type` 中 `kick_me` / `disband` 这类没有对应标准值的，用 `qq.` 前缀保留原语义。
