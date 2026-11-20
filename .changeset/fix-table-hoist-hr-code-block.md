---
"larkard": patch
---

修复 RAW 里的内嵌表格、分割线间距与代码块行距：

- **表格**：编辑器把 `table` 存成 markdown 的块级子元素，`rawToDsl` 此前把它降级成管道表文本（`| … |`），结构、列宽、行高、`page_size` 与 options/persons 单元格全部丢失，渲染器也不认管道表。现在 body 根级 markdown 里的 `table` 会提升为同级 `{ tag:'table' }`，前后剩余内容拆成独立的 markdown 元素并保持顺序；column 等不允许 table 的容器仍按文本降级。
- **分割线**：真机 body 是普通块容器，`hr` 的 16px margin 与容器间距按 margin collapse 取 `max`；渲染器用 flex + `row-gap`（不折叠），12px gap 叠 16px margin 变成 28px。现在容器把实际 `row-gap` 写入 `--universal-card-row-gap`，`hr` 的 margin 用 `max(0, 16px - gap)` 抵扣，恢复真机的 16px。
- **代码块**：RAW `contents` 的编辑器存储形态是「内容行（自带 `\n`）+ 独立的 `\n` entry」，此前按 entry 逐行渲染并再 join `\n`，每行之间多出空行。新增 `codeBlockLines` 统一归一三种编码；同时字号/行高/圆角对齐真机（14px / 22px / 8px），并在渲染时去掉会把行盒撑到 24px 的 `<code>` 包裹。
