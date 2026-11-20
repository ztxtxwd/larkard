# larkard

## 0.2.8

### Patch Changes

- 54710a7: 修正 table 的 markdown 单元格行高：区分根级 table 与 markdown 内嵌 table。
  
  - 真机根级 `table` 默认 `row_height: low`（32px）：markdown 单元格的 `row-item-wrapper--auto` 虽然 `overflow: auto`，但 `rowStyle` 仍带 `max-height: 32px`，所以换行内容在单元格内**上下滚动**，不撑高整行。
  - 真机对**嵌在 markdown 里**的 table 会把 `rowHeightValue` 强制改成 `auto`（上限 124px）：内容少时行被撑高，超过上限才滚动。
  - 渲染器此前把两种都按「无 max-height、撑高整行」处理；现在改为所有单元格都带 `max-height = row_max_height || row_height`，markdown 单元格额外加 `--auto`（`overflow:auto`）。`rawToDsl` 提升 markdown 内嵌 table 时补 `row_height: 'auto'`，复现真机的第二种行为。

## 0.2.7

### Patch Changes

- 651222b: 修复 table 的 markdown 单元格换行不撑高整行：
  
  - 真机 `dataType: "markdown"` 的单元格走 `row-item-wrapper--auto`，且没有 `max-height`；文本换行时 td / tr 会跟着长高（`row_height` 只是最小值）。
  - 渲染器此前对所有单元格都写 `max-height: 32px; overflow: hidden`，markdown 文本第二行会被裁掉，整行高度不变。现在 markdown 列不再设 `max-height`（`row_height: auto` 时仍受 `row_max_height` 约束）；text / number / options / persons 与 `lark_md` 仍按行高截断。

## 0.2.6

### Patch Changes

- 12e0960: 修复 RAW 里的内嵌表格、分割线间距与代码块行距：
  
  - **表格**：编辑器把 `table` 存成 markdown 的块级子元素，`rawToDsl` 此前把它降级成管道表文本（`| … |`），结构、列宽、行高、`page_size` 与 options/persons 单元格全部丢失，渲染器也不认管道表。现在 body 根级 markdown 里的 `table` 会提升为同级 `{ tag:'table' }`，前后剩余内容拆成独立的 markdown 元素并保持顺序；column 等不允许 table 的容器仍按文本降级。
  - **分割线**：真机 body 是普通块容器，`hr` 的 16px margin 与容器间距按 margin collapse 取 `max`；渲染器用 flex + `row-gap`（不折叠），12px gap 叠 16px margin 变成 28px。现在容器把实际 `row-gap` 写入 `--universal-card-row-gap`，`hr` 的 margin 用 `max(0, 16px - gap)` 抵扣，恢复真机的 16px。
  - **代码块**：RAW `contents` 的编辑器存储形态是「内容行（自带 `\n`）+ 独立的 `\n` entry」，此前按 entry 逐行渲染并再 join `\n`，每行之间多出空行。新增 `codeBlockLines` 统一归一三种编码；同时字号/行高/圆角对齐真机（14px / 22px / 8px），并在渲染时去掉会把行盒撑到 24px 的 `<code>` 包裹。

## 0.2.5

### Patch Changes

- 602c974: `checkCard` / `repairDeviceIssues` 新增真机约束 `markdown-font-color`。
  
  飞书发送接口不认块级 `markdown.font_color`，会以 200621
  （`unknown property, property: font_color`）整卡拒绝；而它是 Schema 明确支持的
  DSL 便利字段（渲染 / adapter 会展开）。现在 `checkCard(dsl, { fix: true })` 会在
  发送前把它展开为 content 内的 `<font color='…'>`（与 adapter 的 DSL → RAW 语义一致，
  已有内联 `<font color>` 或内容为空时只删除属性），并让 `fixes` 里能查到这条改动；
  不带 `fix` 时按 device error 拦截，避免「校验通过却发不出去」。

## 0.2.4

### Patch Changes

- 443654d: 修复 RAW → DSL 丢失块级元素后显式 `br` 的问题：
  
  - RAW markdown 里 `hr` / `list` / `code_block` 等块级元素后面的 `br`（真机表现为一行空白）此前被序列化成裸换行，紧跟在块自带的段落换行之后会被 markdown 解析器当作块间距丢弃。
  - 现在块边界上的 `br` 输出为官方支持的 `<br>` 标签，DSL 渲染后恢复真机的那行空白（例如 `---` 与后续链接之间）。

## 0.2.3

### Patch Changes

- 64d519d: 修复 `text_tag` 与真机不一致的字号和左外边距：
  
  - 真机标签使用设计系统 Tag `extra-small` 的 16px 高 / 10px 字 / padding 0 4px（此前误按网页引擎的 size-follow 改成 18px / 12px）。
  - 恢复桌面端 `.universal-card-text-tag` 的 `margin: 0 2px`（此前删成了 0）。
  - 保留按父行高的垂直居中补偿：`vertical-align:top + top=(父行高-16)/2+0.5`；note 内 12/20 → 2.5px，header 不做补偿。

## 0.2.2

### Patch Changes

- 0f9e167: 渲染器标签、分割线与链接样式对齐真机：
  
  - `text_tag` 改为跟随父字号（父字号 ≤18px 时 18px 高 / 12px 字、padding 0 4px；更大字号按引擎公式缩放），外层按父行高做 `vertical-align:top + top=(行高-标签高)/2+0.5` 补偿，并去掉多余的 `margin:0 2px`。note 内按 notation 12px/20px 计算，header 的 `text_tag_list` 与真机一致不做行内偏移。
  - `number_tag` 改为真机圆形徽标：固定 16×16（17px 字号时 18×18）、`border-radius:999px`、`rgba(31,35,41,.08)` 底色 / `rgba(31,35,41,.8)` 字色、外层 `padding:0 3px`，并按行高上移 `(行高-尺寸)/6`；支持 `background_color` / `font_color` 的 token 映射与 URL 链接。
  - `hr` 上下间距改为真机的 16px，并补上首/尾元素收掉外侧 margin 的规则。
  - markdown 链接改用 `--B500` (#336df4)，hover 不再出现下划线；note 内链接降为 N600。

## 0.2.1

### Patch Changes

- cebbc68: 修正渲染器里飞书表情的位置与间距：外层改为真机同款 `inline-block + font-size:0 + vertical-align:top`，表情高度等于行高时在行内垂直居中，不再整体偏上；按 inline atom 补 `margin: 0 2px`（连续表情不叠加左边距），与前置文字留出真机一致的间距。表情尺寸同时改为跟随所在 markdown 字号（引擎 `size = 字号 × 1.6`），`text_size=small/heading` 时不再固定为 22.4px；未知短码降级节点新增 `--fallback` 修饰类，避免被 `font-size:0` 吞掉。

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
