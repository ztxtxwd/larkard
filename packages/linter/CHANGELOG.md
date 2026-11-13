# @open-feishu-card/linter

## 0.3.0

### Minor Changes

- 6216759: 按真机（V7.4+，PC + iOS 实测）对齐 `column` 宽度语义，并修掉 `flex_mode: stretch` 的布局 bug。
  
  **renderer**
  
  - `flex_mode` 的列宽覆盖改为**窄屏才生效**，与客户端 `ni()` 一致（`isWide`：卡片容器
    > 320px 时把 flexMode 当 `none`）：column_set 挂 `--stretch/--bisect/--trisect/--flow`
    类，宽度覆盖与 `flex-wrap: wrap` 放进 `@container (max-width: 320px)` 规则里。
    宽卡预览下 `width` / `weighted` 照常生效（对齐 PC 真机），窄卡片里才堆叠/等分。
  - 修掉 `stretch` 的布局 bug：此前只把列改成 `width:100%` 却不换行，px 列又带
    `flex-shrink: 0`，于是它吃掉整行、把兄弟列压成 0（典型现象：stretch + `width:"16px"`，
    16px 列变成整行宽）。现在窄屏每列独占一行。
  - px 列不再写 `flex-shrink: 0`：真机在整行超过卡片内容宽时会**按 px 比例等比压缩**
    （600px 的行放进 576px 内容区 → 缩到 576），定死不缩会溢出卡片。
  - `flex_mode: flow` 在窄屏下把列宽回落 `auto`（客户端 `ei()` 同款）：px / weighted
    都被忽略、按内容宽排列；此前预览里 px 仍然生效。
  - px 超出 `[16,600]`（如 `10px` / `800px`）按 `auto` 渲染：真机既不报错也不夹取，直接当内容宽。
  
  **linter**
  
  - 新增 `column-width-range`：px 越界时提示客户端会忽略该值、退回 `auto`。
  - 新增 `column-weight-range`：`weight` 不是 1–5 的整数时提示该列会降级成 `auto`，
    同行其它 `weighted` 列分掉剩余宽度。
  
  **schema**
  
  - `column.width` / `weight` 的描述补充真机语义：px 不是绝对宽度（整行超宽会等比压缩）、
    越界值会被静默忽略、`flex_mode` 只在窄屏覆盖 `width`。

## 0.2.0

### Minor Changes

- 7fb447b: 新增规则 `markdown-bold-space`：加粗星号内侧紧贴空格时告警。
  
  模型生成卡片时常写出 `** 分区标题**` / `**分区标题 **`——星号与文字之间有空格，
  Markdown 不会加粗，客户端把 `**` 按字面渲染出来。Schema 本身合法，所以放在 linter
  （warning）而不是 validator。
  
  覆盖范围：
  - `markdown` 组件 `content`
  - `plain_text` / `lark_md` / `markdown` 文本对象里 tag 为 `lark_md` / `markdown` 的 `content`
  - `table` 中 `data_type` 为 `lark_md` / `markdown` 的列单元格
  
  判定按 CommonMark flanking 规则的简化版：开星号看后一个字符、收星号看前一个字符，
  只报星号**内侧**的空格；星号外侧贴空格（`**标题** 正文`）以及文字内部的空格都不报。
  行内代码与代码块内的星号会被跳过；`plain_text` 不算 Markdown，不报。

## 0.1.3

### Patch Changes

- 支持搭建工具文档：lint 规则作用在解包后的 `dsl` 子树上
- Updated dependencies
  - @open-feishu-card/parser@0.1.3

## 0.1.2

### Patch Changes

- 为库包增加 CommonJS 双格式构建（ESM + CJS），可通过 `require` 使用。
- Updated dependencies
  - @open-feishu-card/parser@0.1.2

## 0.1.1

### Patch Changes

- 首次正式发布：补齐构建产物与包内容（替换 npm 上的空占位 0.1.0）。
- Updated dependencies
  - @open-feishu-card/parser@0.1.1
