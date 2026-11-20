---
"larkard": patch
---

修正 table 的 markdown 单元格行高：区分根级 table 与 markdown 内嵌 table。

- 真机根级 `table` 默认 `row_height: low`（32px）：markdown 单元格的 `row-item-wrapper--auto` 虽然 `overflow: auto`，但 `rowStyle` 仍带 `max-height: 32px`，所以换行内容在单元格内**上下滚动**，不撑高整行。
- 真机对**嵌在 markdown 里**的 table 会把 `rowHeightValue` 强制改成 `auto`（上限 124px）：内容少时行被撑高，超过上限才滚动。
- 渲染器此前把两种都按「无 max-height、撑高整行」处理；现在改为所有单元格都带 `max-height = row_max_height || row_height`，markdown 单元格额外加 `--auto`（`overflow:auto`）。`rawToDsl` 提升 markdown 内嵌 table 时补 `row_height: 'auto'`，复现真机的第二种行为。
