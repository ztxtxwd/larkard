# @open-feishu-card/components

## 0.4.0

### Minor Changes

- 42fb7bd: 补齐 `collapsible_panel` 的 header 字段：
  
  - `schema`：`header.expanded_title` 落地（此前 `parse()` 会静默丢弃）；`header.width` / `header.position` 改为官方枚举；标题文本对象支持 `lark_md` 与 `text_align` / `text_size` / `text_color` / `lines` / `margin` / `icon` / `i18n` 等排版字段。
  - `adapter`：RAW→DSL 不再丢弃 `header.width` / `header.vertical_align` / `header.position`（这三项是官方公开字段，丢弃会破坏 RAW ↔ DSL 无损）。
  - `renderer`：渲染 `expanded_title`（`details[open]` 时切换标题）、`header.background_color` / `width` / `vertical_align` / `position`，以及面板级 `direction` / `horizontal_spacing` / `vertical_spacing` / `horizontal_align` / `vertical_align`；`expanded` 缺省改为收起（对齐真机）。
  - `components`：新增 `headerWidth` / `headerVerticalAlign` / `headerPosition` / `horizontalAlign` / `verticalAlign` / `horizontalSpacing` / `verticalSpacing`。
- 42fb7bd: `column` 的 `horizontal_align` / `direction` 在预览里生效；`column_set` 的 `vertical_align` 明确废弃。
  
  **background**：对齐字段在真机上由网页版引擎的同一个 `qr()` 产出，规则是
  
  - `isRow = direction === 'horizontal'`
  - `horizontal_align` → `isRow ? justify-content : align-items`
  - `vertical_align` → `isRow ? align-items : justify-content`
  
  但 `column_set` 调用时带了 `disableVerticalConfig: true`（`chunks` 里就是这一句），垂直对齐整段被跳过；官方《分栏》文档的 `column_set` 字段表同样没有 `vertical_align`。反过来的 `column` 两个对齐都吃，只是 `horizontal_align` 受 `unifyLayout` 开关控制。
  
  **renderer**
  
  - `column` 此前写死 `flex-direction: column`，只把 `vertical_align` 塞给 `justify-content`，`horizontal_align` 与 `direction` 完全没人读——于是「列内水平对齐」在预览里怎么点都不动，`direction: horizontal` 也永远排成竖列。
    现在按上面的规则映射，并补上 `horizontal_spacing → column-gap`（只在显式给值时输出，与真机一致）。
  - `column_set` 忽略 `vertical_align` 的行为保留，加注释说明这是真机语义（`disableVerticalConfig`），不要再"修"。
  - 新增 7 条用例锁定上述映射（含 RAW camelCase 与 `column_set` 忽略垂直对齐）。
  
  **schema**
  
  - `ColumnSetSchema` 去掉 `vertical_align`：真机不认，留着只会让模型生成一个静默失效的字段。需要列内容垂直居中写 `column.vertical_align`。
  - `ColumnSetSchema` 的 describe 同步纠正（原文案推荐在 `column_set` 上写 `vertical_align=center`，是错的）。
  
  **components**
  
  - `ColumnSetProps` 去掉 `verticalAlign`，`renderColumnSet` 不再输出 `vertical_align`（`FeishuColumnSet` 类型本就没有这个字段）。垂直居中改用 `Column` 的 `verticalAlign`。

## 0.3.0

### Minor Changes

- bdd86c4: 补齐 `img_combination` / `select_img` 全链路支持。
  
  - **schema**：`img_combination.img_list` 支持官方字段 `img_id` / `transparent`；`select_img.options` 支持 `img_id` / `transparent`。
  - **adapter**：RAW ↔ DSL 双向映射——`combinationMode` / `imgList` / `cornerRadiusValue` / `transparent` ↔ `combination_mode` / `img_list[{img_key}]` / `corner_radius` / `combination_transparent`；`select_img` 的 `options[].imageID` → `img_key`、camelCase 配置 → snake_case、RAW `actions` → `behaviors`；`dslToRaw` 反向生成渲染器可用的 RAW 形态。
  - **components**：`ImgCombination` 的图项支持 `imgId` / `transparent`；`SelectImg` 选项支持 `imgId` / `transparent` / `disabledTips` / `hoverTips`，组件级支持 `disabledTips`。
  - **renderer**：新增 `img_combination`（double / triple / bisect / trisect 布局）与 `select_img`（网格、选中/禁用态、表单内 checkbox/radio）渲染，样式对齐网页版引擎；`form` 渲染子元素时注入 `inForm` 上下文。

## 0.2.1

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

## 0.2.0

### Minor Changes

- 79fc9f6: 修复 TSX → DSL 转换时布局字段被静默丢弃的问题，使 JSX 重建的卡片与参考 JSON 真机效果一致。
  
  `interactive_container` 此前不输出 `horizontal_align` / `vertical_align` / `horizontal_spacing` / `vertical_spacing`，容器内子组件退化为左上贴边、固定 4px 行距；`column` 丢 `horizontal_align` / `horizontal_spacing`，`column_set` 丢 `vertical_align`；`normalizeIcon` 丢图标 `size`，导致折叠面板箭头等回落到默认 16px；`select_static` 丢组件级 `type` 与选项 `icon`。
  
  `collapsible_panel` 修正 `header.padding` 层级（新增 `headerPadding`），并支持展开态标题 `expandedTitle`（`header.expanded_title`）。
  
  **注意**：`CollapsiblePanel` 的 `padding` 现在只作用于面板本身，不再误写到 `header`。原意是控制标题区间距的用法需改用 `headerPadding`。

## 0.1.4

### Patch Changes

- `img` 按来源分派字段：`scaleType` 恒定写 `scale_type`；历史 `mode` 仅在本身是缩放值时也写 `scale_type`，尺寸值仍留在 `mode`（旧模板兼容）
- 修正 `crop_top` 落进 `mode` 触发 "img mode is not supported"（回调 200673）

## 0.1.1

### Patch Changes

- 从 Schema 2.0 工具链移除 JSON 1.0 的 `action` / `note`
