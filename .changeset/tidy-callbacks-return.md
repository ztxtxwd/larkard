---
'@open-feishu-card/adapter': patch
'@open-feishu-card/schema': patch
'@open-feishu-card/renderer': patch
'@open-feishu-card/components': patch
---

回调行为不再在 RAW↔DSL 往返中丢失（服务端回读形态是 `action_request`，不是 `callback`）。

`im.message.get?card_msg_content_type=raw_card_content` 返回的回调 action 实际形态是
`{ type:'action_request', action:{ actionID, isValueObjectType, value:"" } }`。此前 raw→DSL 只认
`callback`，服务端返回的 action 全部落进 `return undefined`，整条 action（含 `behaviors` 字段）
静默消失；`interactive_container` 的 `value ?? {}` 还会把 `""` 原样透传成字符串。

**adapter**
- `button` / `interactive_container` / `column_set` / `column` 的 RAW `actions` 收成共用投影函数，
  `callback` 与 `action_request` 两种拼写都认。
- `value` 归一：对象原样保留；非空字符串保留（服务端接受字符串载荷）；被服务端清空
  （`isValueObjectType` / `actionID`）时投影为 `{}`，字符串空载荷保留 `""`。
- 未知 action type 不再静默丢：按 snake_case 原样保留进 `behaviors`。
- 新增可选诊断通道 `rawToDsl(raw, { onWarn })` / `rawCardToDsl(env, { onWarn })`，报告
  `unknown_action_type`（未知 type）与 `callback_payload_cleared`（载荷被服务端清空）、
  `unrepresentable_action`（column_set/column 的公开 schema 放不下回调）。
  不传 `onWarn` 时行为与输出不变。
- DSL→RAW 输出服务端拼写：回调写 `type:'action_request'`，平台 URL 写
  `pc_url` / `ios_url` / `android_url`（raw→DSL 两种拼写都收，往返不变）。

**schema / components**
- `CallbackBehavior.value` 放宽为 `record | string`（服务端接受字符串载荷）。

**renderer**
- `readCallbackValue` 同时识别 `action_request`；`resolveURL` 同时认 snake_case 平台 URL。

注意：即使投影正确，从「拉一张卡 → 再发出去」这条路上回调参数仍会为空——服务端两种回读形态
（raw 的 `value:""` / user_card_content 的 `{type:'callback'}`）都不回显载荷。要保住 `value`，
发送侧必须留存原始 DSL。
