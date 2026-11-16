---
"@open-feishu-card/renderer": patch
---

修复「容器里的整行元素不撑满」：分栏 / 按钮行在预览里比真机窄一截。

真机给每个元素外面都套了一层 `.universal-card-element-shell { width: 100% }`，所以块级子元素永远占满容器宽度，容器上的 `horizontal_align`（→ `align-items`）只对 `width: auto` 的元素生效。渲染器没有这层壳，此前只给 `.universal-card-body` 的直接子元素补了 `width: 100%`，其余容器（`column` / `interactive_container` / `collapsible_panel` 内容区）里只要写了 `horizontal_align: left`（→ `align-items: flex-start`），里层 `column_set`、按钮行就缩成内容宽——真机整行撑满，预览里却窄一块，看着像「每个交互容器自带一个默认宽度」。

- `styles.css`：把「子元素默认撑满」从 `.universal-card-body` 扩到 `column` / `interactive_container` / `collapsible_panel__content`，用 `:where()` 归零特异性（组件自己声明的宽度仍然优先），并排除按钮、inline 语音条（`markdown_audio`）与横排容器（新增 `--row` 修饰类）。
- `interactive_container` 宽度对齐真机 `useSize()`：`widthValue` 是唯一真值来源——缺省 → `width: 100%`、`fill` → `100%`、`auto` → `auto`、`pixels` → `Npx`。此前缺省不写宽度，会被父级 `align-items` 缩成内容宽。
