# @open-feishu-card/schema

## 0.1.10

### Patch Changes

- d14e395: 修正 `escapeMarkdown` 二次转义：此前逐字符多遍替换，后面转 `#` 时会把前面生成的实体再转一遍（`**` 变成 `&&#35;42;&&#35;42;`，卡片上显示乱码）。改为单遍替换，每个字符只转义一次。

## 0.1.9

### Patch Changes

- 3dee401: 回调行为不再在 RAW↔DSL 往返中丢失（服务端回读形态是 `action_request`，不是 `callback`）。
  
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

## 0.1.6

### Patch Changes

- 从 Schema 2.0 工具链移除 JSON 1.0 的 `action` / `note`

## 0.1.5

### Patch Changes

- 对齐官方 card-schema（P0/P1）：新增 `avatar`、`picker_date`、`fallback_text`、`collapse_divider` 组件
- 交互件补齐 `disabled_tips` / `value` / `required`；`overflow`、`select_img`、`person_list`、`header` 等公开字段
- `markdown.enable_streaming` / `text_lines`、`img.fallback_img_key`、`UdIconSchema` 支持 `tag: ud_icon`

## 0.1.4

### Patch Changes

- 飞书回读卡片时 custom_background_style / 丢失的 font_color 归一化：`normalizeStoredCardColors` 还原 cus-N + config.style.color；schema 补充 markdown.font_color 与 column.custom_background_style。

## 0.1.3

### Patch Changes

- 441c53b: disabled 的纯视觉 interactive_container 在表单外不再强制要求 behaviors（对齐官方组件库强调框写法：disabled + 白底/边框/圆角 + 无 behaviors）

## 0.1.2

### Patch Changes

- 为库包增加 CommonJS 双格式构建（ESM + CJS），可通过 `require` 使用。

## 0.1.1

### Patch Changes

- 首次正式发布：补齐构建产物与包内容（替换 npm 上的空占位 0.1.0）。
