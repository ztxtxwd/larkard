# @open-feishu-card/optimize

发送前的卡片**视觉优化**。纯函数、零运行时依赖，不渲染 DOM。

当前提供：

- 同一分栏内 `interactive_container` 的等高（下面两种策略）；
- 纯文本 → 富文本升级（`plain_text` → `lark_md`，普通文本 `div` → 富文本 `markdown`）。

## 1. 补字符：不写 height（推荐）

真机 `interactive_container.height` 只接受 `auto` 或 `[10,999]px`。固定 px 只能取一个值，而桌面和窄屏下文字折行数不同，必然在一边留下大片空白。

`equalizeInteractiveContainerHeightsByPadding()` 改为在较矮的容器末尾追加一段**不可见的可换行字符**，让内容自己撑到和最高列一样高：

- 填充字符默认 `U+3000`（表意空格）：宽度 1em、不可见，可以在字与字之间换行；列越窄，自动折出越多行；
- 内容以 `U+200B` 开头，防止整行被 markdown 当成空白行裁掉；
- 填充物是独立的 `markdown` 元素，`element_id` 以 `ofc_hfill_` 开头；重复运行会先删掉旧填充再按当前内容重算；
- 不写 `height`，不会裁字。两个参考宽度可以精确对齐，中间宽度最多差 1 行。

```ts
import { equalizeInteractiveContainerHeightsByPadding } from '@open-feishu-card/optimize';

const { card, groups, skipped, changes } = equalizeInteractiveContainerHeightsByPadding(dsl, {
  widths: [600, 360],
  overwriteFixedHeight: true, // 清掉之前固定高度策略写下的 height
});
```

注意：

- 卡片文本里会多出不可见字符，复制 / 选中时可能带出 `U+3000`；对文本会被二次编辑、搜索、给读屏软件朗读的场景要谨慎。
- 填充靠整行折行量化，两个参考宽度之间可能差 1 行（约一个 line-height）。这是不写死高度的代价。
- 可以用 `fillerTextSize` 改填充字号（默认 `notation`，12px / 行高 22px）；如果差异来自正文行，改成 `normal` 会更贴。
- `maxFillerChars`（默认 600）限制单个容器最多补多少字符，超过时整组跳过。

## 2. 固定高度

`equalizeInteractiveContainerHeights()` 保持「宁可有留白，也不裁字」的策略：

1. 找出 `column_set` 中「每列恰好一个顶层 `interactive_container`」的组；
2. 按真机布局规则预测每个容器的自然高度（字号 / 行高 / padding / border / margin / 子项间距 / 折行）；
3. 取所有参考宽度下的最大值，给组内所有容器写 `height: "Npx"`。

```ts
import { equalizeInteractiveContainerHeights } from '@open-feishu-card/optimize';

const { card, groups, skipped, changes } = equalizeInteractiveContainerHeights(dsl);

// 默认按渲染器 600px 卡片宽度预测。要同时覆盖窄屏：
const narrowSafe = equalizeInteractiveContainerHeights(dsl, { widths: [600, 360] });
```

### 什么时候会跳过

优化器宁可不动，也不猜一个可能裁字的高度。以下情况整组跳过，并在 `skipped` 里给出原因：

- 列数 < 2；
- 列宽不是 `weighted` / 固定 px（`auto` 宽度算不出来）；
- 某列不是恰好一个顶层 `interactive_container`；
- 目标容器已经写死 `height`（可用 `overwriteFixedHeight: true` 重新按内容预测），或 `direction: horizontal`；
- 容器内有 chart / table / audio / video / 嵌套容器等不在测量白名单里的组件；
- 自然高度超过 `maxHeight`；
- 各列预测高度本来就相同（`skipWhenEqual`，默认开启）。

### 测量精度

内置字宽表按 CJK 1em、ASCII Arial 度量，并对 ASCII 留 3% 余量：高度偏大只是留白，偏小会裁字。浏览器里可以传 Canvas 测量拿到当前字体的精确宽度：

```ts
const canvas = document.createElement('canvas').getContext('2d')!;
const measureText = (text: string, fontSize: number, bold: boolean) => {
  canvas.font = `${bold ? 'bold ' : ''}${fontSize}px -apple-system, "PingFang SC", Arial, sans-serif`;
  return canvas.measureText(text).width;
};
equalizeInteractiveContainerHeights(dsl, { measureText });
```

### 局限

固定高度对卡片宽度敏感。`widths: [600, 360]` 会按 360 的折行把高度写死，桌面 600 下第三列下面就会多出空白。需要同时贴合两端时用上面的补字符策略。

参考宽度请保持在 **320px 以上**：飞书客户端在卡片宽度 ≤ 320px 时会启用另一套 `flex_mode` 规则（`stretch` 堆叠、`bisect` / `trisect` 强制等宽），本优化器按宽卡布局计算列宽。窄屏上更稳妥的做法是让分栏自然堆叠，而不是钉死宽度和高度。

## 3. 纯文本 → 富文本

`upgradeTextToRichText()` 做两件事：

1. 把 `tag: "plain_text"` 的文本对象改成 `lark_md`；
2. 把普通文本组件 `div` 改成富文本组件 `markdown`。

```ts
import { upgradeTextToRichText } from '@open-feishu-card/optimize';

const { card, changes, skipped } = upgradeTextToRichText(dsl);
```

只处理 **schema 允许 `lark_md`** 的文本位置：

- `header.title` / `header.subtitle`；
- `div.text`（随后整个 `div` 会转成 `markdown`）；
- `checker.text`、`fallback_text.text`；
- `collapsible_panel.header.title` / `expanded_title`；
- 以及上述组件在 `column_set` / `interactive_container` / `form` / `collapsible_panel` 里的嵌套。

按钮、下拉选项、overflow、确认弹窗、tips、`img.alt` / `img.title` 等字段被 schema 固定为 `plain_text`，不会改。

### 内容转义

plain_text 是「按字面量展示」的；直接改 tag 后，内容里的 `*`、`_`、`<at>`、`:OK:` 会被 Markdown 引擎当成语法。默认会用官方文档给出的 HTML 实体转义（`* → &#42;`、`< → &#60;`）保持字面量：

```ts
upgradeTextToRichText(dsl, { escape: false }); // 想让原有文本参与 Markdown 解析
```

已经是 `lark_md` 的内容不会被转义，保持用户写的 Markdown 语法。

注意：空白排版不在转义范围内。Markdown 会折叠连续空格、重新解释行首空格和空行，而 `plain_text` 按字面量保留；需要严格保留空白时不要开启这项转换，或自行把空白换成 `&nbsp;` 等实体。

### div → markdown 的字段映射

| div | markdown |
| --- | --- |
| `element_id` / `text.element_id` | `element_id`（两者都有时保留组件级 ID） |
| `margin` | `margin` |
| `text.text_size` / `text_size` | `text_size` |
| `text.text_align` | `text_align` |
| `text.lines` | `text_lines` |
| `text.text_color`（plain_text 时生效） | `font_color` |
| `icon` / `ud_icon` | `icon` / `ud_icon` |

以下情况会跳过并写入 `skipped`，而不是猜一个会改变视觉的结果：

- `div.width` 是 `auto` 或固定 px：`markdown` 没有 `width` 字段，转换会改变布局；
- `div` / `div.text` 上有无法映射的字段：避免静默丢字段；
- `div.text.tag` 非法或缺少 `content`。

转成 `lark_md` 后，`checker.text.text_color` 这类「仅 plain_text 生效」的字段会失效，`changes[].lost` 会标出来。函数是纯函数且幂等：重复运行不会产生新的改动。
