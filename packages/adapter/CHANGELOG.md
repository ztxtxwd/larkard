# @open-feishu-card/adapter

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
