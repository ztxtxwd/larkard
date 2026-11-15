# @open-feishu-card/adapter

## 0.4.3

### Patch Changes

- 77f0ec4: 补齐 audio 组件的渲染属性：此前只有最基本的播放条，`style` / `time_display` /
  `time_position` / `border` / `margin` / `padding` / `background_style` / `fill_color` /
  `width` / `disabled` / `fallback` 大部分没有落地。
  
  - `style`：`normal` 块级用 PlayRoundFilled/PauseRoundFilled，`flat` 与 inline 用
    PlayFilled/PauseFilled，`speak` 用 SpeakingOutlined（对齐飞书网页版 xn 的图标分支）。
  - `time_display` × `time_position`：`default` 单槽（auto：未播放显示总时长），`both` +
    `both_sides` 拆成「当前 / 总时长」双槽，`both` + `start`/`end` 单槽并带 `--both` 宽度类；
    时间槽带 `data-audio-time` 供水合更新，≥1h 自动切 `HH:MM:SS`（`--long`）。
  - `border`：`color` / `corner_radius`（兼容 RAW 的 `hasBorder`、`borderColor`、
    `customBorderColor`、`border.cornerRadius`）。
  - `margin` / `padding`：兼容 RAW 四向对象与 DSL CSS 简写字符串。
  - `background_style` / `fill_color`：支持 `customBackgroundStyle` / `customFillColor` 主题色。
  - `width`：`fill` / 像素 / `default`（进度条 + 时长时 `min-width:164px`）。
  - `disabled`：改为真机同款白色半透明蒙层（不再是整体 opacity）；`disabled_tips` 走 title。
  - `fallback`：无媒体时 `drop` 不渲染，`fallback_text` 输出兜底文案。
  - 顺带修复 markdown 内嵌 `<audio style='speak'>` 的 round-trip：`audioStyle` 现在会被
    `rawToDsl` 投影回 `style`，渲染器也同时读 `style` / `audioStyle`。

## 0.4.2

### Patch Changes

- 90395f9: 修复 RAW→DSL 丢失 `column.widthValue` 权重，导致 `flex_mode: stretch` 的
  weighted 列在预览里变成 1:1（真机是 1:2）。
  
  真机的列宽渲染（网页版引擎 `ao()`）以 `widthValue` 为准，`width` + `weight`
  只是没有回显时的兜底：
  
  ```js
  if (widthValue) {
    if (type === 'column_width_weighted') { flexBasis = 0; flexGrow = value; }
    // pixels / builtin auto 同理
  } else if (width) { width / weight 兜底 }
  ```
  
  adapter 之前把 `column_width_weighted` 回显当成“和 `width` + `weight` 冗余”
  直接丢掉。但 RAW 里的 `weight` 常常是默认值 1（甚至缺失），真正的权重只在
  `widthValue.value` 里 —— 丢掉回显后 DSL 只剩 `weight: 1`，渲染器就按 1:1 排。
  
  现在 column 的回显按真机优先级投影：
  
  - `column_width_weighted` → `width: "weighted"` + `weight: value`
  - `builtin_column_width` → `width: value`（`auto` 等）
  - `pixels` → `width: "Npx"`
  
  `weight` 与 `widthValue.value` 冲突时以 `widthValue` 为准（与真机一致）。
- 979b3b9: `img.title` 按真机 BaseText 渲染（此前完全忽略，预览里图片标题丢失）：
  
  **结构 / 样式对齐真机 dump**
  
  - 外壳 `.universal-card-image`（width:100%，承载 margin）+ 上方 `.universal-card-image__title`（`margin-bottom:8px`），与真机 CSS 一致。
  - `__wrapper` 补齐 `position:relative / align-items:center / flex:0 1 auto / width:100% / overflow:hidden`；`__host` 补齐 `width:100% / font-size:0 / position:static`（对齐真机 `universal-card-image` 规则）。
  - 外边距（含 `margin:8px 20px`、负 margin 出血）挂到外壳上，标题与图片作为整体参与布局，`calc` 宽度照旧。
  
  **文本能力**
  
  - 支持官方 BaseText 的 `plain_text` 与 `lark_md`：`lark_md` 按 markdown 子树渲染（对齐 / 字号 / 粗体等生效）。
  - 标题的 `text_size` / `text_color` 折叠进 `textStyle`（等价真机服务端归一）；`lines` / `text_lines` 支持行数截断；空标题不占位。
  - RAW ↔ DSL 往返补齐：`rawToDsl` 把图片标题投影成 `plain_text | lark_md` 并保留 `text_size` / `text_color` / `text_align` / `lines`；DSL→RAW 的文本叶子补上 `lines`。

## 0.4.1

### Patch Changes

- 42fb7bd: 补齐 `collapsible_panel` 的 header 字段：
  
  - `schema`：`header.expanded_title` 落地（此前 `parse()` 会静默丢弃）；`header.width` / `header.position` 改为官方枚举；标题文本对象支持 `lark_md` 与 `text_align` / `text_size` / `text_color` / `lines` / `margin` / `icon` / `i18n` 等排版字段。
  - `adapter`：RAW→DSL 不再丢弃 `header.width` / `header.vertical_align` / `header.position`（这三项是官方公开字段，丢弃会破坏 RAW ↔ DSL 无损）。
  - `renderer`：渲染 `expanded_title`（`details[open]` 时切换标题）、`header.background_color` / `width` / `vertical_align` / `position`，以及面板级 `direction` / `horizontal_spacing` / `vertical_spacing` / `horizontal_align` / `vertical_align`；`expanded` 缺省改为收起（对齐真机）。
  - `components`：新增 `headerWidth` / `headerVerticalAlign` / `headerPosition` / `horizontalAlign` / `verticalAlign` / `horizontalSpacing` / `verticalSpacing`。

## 0.4.0

### Minor Changes

- bdd86c4: 补齐 `img_combination` / `select_img` 全链路支持。
  
  - **schema**：`img_combination.img_list` 支持官方字段 `img_id` / `transparent`；`select_img.options` 支持 `img_id` / `transparent`。
  - **adapter**：RAW ↔ DSL 双向映射——`combinationMode` / `imgList` / `cornerRadiusValue` / `transparent` ↔ `combination_mode` / `img_list[{img_key}]` / `corner_radius` / `combination_transparent`；`select_img` 的 `options[].imageID` → `img_key`、camelCase 配置 → snake_case、RAW `actions` → `behaviors`；`dslToRaw` 反向生成渲染器可用的 RAW 形态。
  - **components**：`ImgCombination` 的图项支持 `imgId` / `transparent`；`SelectImg` 选项支持 `imgId` / `transparent` / `disabledTips` / `hoverTips`，组件级支持 `disabledTips`。
  - **renderer**：新增 `img_combination`（double / triple / bisect / trisect 布局）与 `select_img`（网格、选中/禁用态、表单内 checkbox/radio）渲染，样式对齐网页版引擎；`form` 渲染子元素时注入 `inForm` 上下文。

## 0.3.20

### Patch Changes

- 6a8360d: 支持视频公开 DSL 的嵌套封面 `cover: { img_key }`。
  
  - adapter：`dslToRaw` 把 `cover.img_key` 映射为 RAW `coverImageID`，不再把嵌套 `cover` 透传进 RAW（避免飞书按未知属性 200621 拒收）。
  - renderer：`resolveVideoCoverSrc` 同时识别扁平 `coverImageID` / `image_key` / `cover_image_key` 与嵌套 `cover`（`img_key` / `imageID` / `image_id` 等）。有媒体源时输出 `<video poster>`，无媒体源时渲染封面壳。

## 0.3.19

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

## 0.3.17

### Patch Changes

- button `callback` actions 在 RAW↔DSL 双向保留（不再被当成非 open_url 丢掉）

## 0.3.16

### Patch Changes

- raw→DSL 保留自定义 `element_id`（丢弃 `_1` 等自动编号）；`column_set`/`column` 的 RAW `actions` 投影为 `action.multi_url`，DSL→RAW 对称回写

## 0.3.15

### Patch Changes

- `normalizeStoredCardColors`：显式 `cus-text-*` 不再并进 `cus-accent` / `cus-muted`（RAW↔DSL 无损；同 hex 的深底浅字保留独立 text token）

## 0.3.14

### Patch Changes

- raw→DSL 保留 plain_text div 的 textStyle（size → text_size，color/customColor → text_color）与 margin，读卡再发不再丢灰色小字样式

## 0.3.13

### Patch Changes

- raw→DSL / dsl→raw 保留 open_url 的 pc_url / ios_url / android_url（复制按钮 lark://client/core/copy 不再在读卡时丢失）

## 0.3.12

### Patch Changes

- `avatar` 双向映射；`picker_date` ↔ `date_picker` 别名
- `raw-to-dsl` 保留 `person_list` 的 `mode`/`style`/`count` 与 `header.notation`
- Updated dependencies
  - @open-feishu-card/schema@0.1.5

## 0.3.11

### Patch Changes

- `config.style.color` 展开不再只认 `cus-*` 前缀：`mm_*` 等任意登记 token 均可展开为 `customBackgroundStyle` / `customBorderColor` / `customColor`
- `interactive_container` 的 `width`/`height`（`Npx` / `fill` / `auto`）写入 `widthValue` / `heightValue`

## 0.3.10

### Patch Changes

- dslToRaw 展开 `interactive_container` 的 `background_style` cus-* 为 `customBackgroundStyle`；同步展开 `collapsible_panel` 的 `background_color` / `border.color`，修复预览缺背景色。

## 0.3.9

### Patch Changes

- `normalizeStoredCardColors` 补齐 `interactive_container` 的 `custom_background_style` 归一化（与 column 一致）；已有 `config.style.color` 时先灌入 registry，避免 cus-bg-N 序号冲突。

## 0.3.8

### Patch Changes

- RAW→DSL 保留 config.summary；bg/text 色 alias 分表防串台；list.items 内 cus-* 色 dslToRaw 展开；custom_border_color 归一化为 border_color

## 0.3.7

### Patch Changes

- `normalizeStoredCardColors` 不再向 markdown 写入 `font_color`（飞书发送接口不接受）；回读缺色时改为 content 内联 `<font color='cus-N'>`，与 0.3.5 RAW→DSL 约定一致。

## 0.3.6

### Patch Changes

- dslToRaw 保留 config.style.color，并将 cus-* 别名展开为 customBackgroundStyle / textStyle.customColor，修复预览与渲染自定义色。

## 0.3.5

### Patch Changes

- RAW→DSL 自定义文字色改为在 markdown content 内联 `<font color>` 引用别名，不再写入 `font_color` 字段。

## 0.3.4

### Patch Changes

- RAW→DSL 自定义文字色：登记到 config.style.color，用 markdown.font_color 引用别名，不再内联 #hex `<font>`。

## 0.3.3

### Patch Changes

- RAW 自定义颜色：`customBackgroundStyle` / `textStyle.customColor` 投影与渲染；`rawToDsl` 输出自动 `normalizeStoredCardColors`。

## 0.3.2

### Patch Changes

- 飞书回读卡片时 custom_background_style / 丢失的 font_color 归一化：`normalizeStoredCardColors` 还原 cus-N + config.style.color；schema 补充 markdown.font_color 与 column.custom_background_style。

## 0.3.1

### Patch Changes

- header title/subtitle 支持 lark_md：RAW 的 originTag:lark_md 投影为公开 `{ tag:'lark_md', content }`，回写时解析成 markdown 元素树，渲染器画出 @ 提及而不是字面 `<at>`。

## 0.3.0

### Minor Changes

- raw→DSL 完整对齐 `feishu-raw-card-to-dsl`：移植 envelope/`json_attachment`、markdown 拼回、table/chart/person/button/video 等专用路径；新增 `rawCardToDsl` / `isRawCardEnvelope`；`degradeUnknown` 改为可选手动降级（不再自动套用）。

## 0.2.1

### Patch Changes

- 为库包增加 CommonJS 双格式构建（ESM + CJS），可通过 `require` 使用。

## 0.2.0

### Minor Changes

- 对齐上游 open-feishu-card@0.14.5：新增 audio/video 渲染与音频水合，markdown 内嵌 `<audio>`，以及 `mergeMentionsIntoPersons` / 命名色 CSS 变量等。

## 0.1.1

### Patch Changes

- 首次正式发布：补齐构建产物与包内容（替换 npm 上的空占位 0.1.0）。
