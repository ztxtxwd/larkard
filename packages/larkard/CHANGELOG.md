# larkard

## 0.2.0

### Minor Changes

- 45ee032: adapter / renderer：markdown 支持更多官方内联 HTML 标签，RAW ↔ DSL 往返补齐。
  
  - `parseMarkdown` / `parseInline` 识别 `<number_tag>`、`<local_datetime>`、`<link>`、`<a href>`、`<br>`、`<hr>`；显式 `<br>` 后紧跟的换行不再叠加空行。
  - RAW → markdown 投影：`number_tag` / `local_datetime` 不再丢角标外壳，`link` 携带 icon 或多端地址时输出 `<link>` 标签而不是纯 `[text](url)`。
  - 渲染器：`link` 支持前缀图标；`number_tag` 支持 `background_color` / `font_color` 自定义颜色。
- 45ee032: optimize：新增 `measureImage`（无 `size` 图片的原始宽高比查询）与 `preserveUnmeasuredFillers`（测不出来的分栏保留已有填充）。
  
  - `measureImage` 让 `fit_horizontal` 等内容图参与等高预测：浏览器可从已加载的 `<img>` 读 `naturalWidth/naturalHeight`，服务端可查媒体元信息；不传时行为不变（整组跳过）。
  - 嵌套 `interactive_container` 现在参与高度预测：纵向按子项求和、横向按最高子项估算。
  - `preserveUnmeasuredFillers: true` 时，`unsupported-child` / `container-width` / `container-empty` 跳过的分栏会保留入参里的填充元素，避免服务端把浏览器按真实图片尺寸补好的结果清掉；恢复的填充不重编号，新填充从已有最大编号之后发号。
- 45ee032: 新增 `larkard/palette` 与 `larkard/palette/browser`：
  
  - 从图片像素提取确定性色板（OKLab 中位切分 + 强调色识别）；
  - 支持任意卡片换色：把官方枚举/字面量物化成 `config.style.color` 的 cus-* token；
  - icon / text_tag / header.template 等只能走官方枚举的字段回写最接近的枚举；
  - 非 danger、非 form 按钮转成 `interactive_container`，以获得可自定义的底色/文字色；
  - 官方色 light 值统一到 `content/colors.ts`，dark 色对在 `content/official-colors.ts`。

## 0.1.2

### Patch Changes

- 57e8402: 渲染 markdown 时还原 `escapeMarkdown()` 写入的 HTML 实体：`parseInline` 产出的 `plain_text` 文本节点现在会把 `&#45;`、`&#42;`、`&amp;` 等还原成字面量，修复 `upgradeTextToRichText` 升级后的卡片在渲染器里直接显示 `&#45;` 的问题。行内代码与代码块保持原样（CommonMark 不在 code span 里解码实体）。

## 0.1.1

### Patch Changes

- e9ec8c7: 修复 `larkard/patch` 与 `larkard/state` 子路径的类型入口：`exports` 原先指向不存在的 `dist/patch/index.d.ts` / `dist/state/index.d.ts`，而 `tsc` 实际把声明生成在 `dist/core/patch/index.d.ts` / `dist/core/state/index.d.ts`，导致下游 TypeScript 报 TS7016（隐式 any）。运行时入口不变。

## 0.1.0

### Minor Changes

- eb13dfc: 首个 `larkard` 版本：把原 `@open-feishu-card/*` 工具链合并为单包多入口。
  
  - 主入口：解析、Schema 校验、最佳实践 lint、发送前检查、净化/编译
  - 子入口：`larkard/schema`、`larkard/adapter`、`larkard/renderer`（`/browser`、`/assets`、`/async`）、`larkard/components`、`larkard/optimize`、`larkard/patch`、`larkard/state`
  - CLI：`larkard`；LSP：`larkard-language-server`
  - 图标 / emoji / 字号行高 / 间距统一由内部 `content` 模块提供；RAW 类型与 Markdown tokenizer 统一在 `adapter`

飞书卡片 JSON 2.0 工具链。首个版本把原 `@open-feishu-card/*` 系列合并为单包多入口；
旧包的发布历史保留在 git 历史与 npm 上。
