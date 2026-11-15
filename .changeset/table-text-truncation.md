---
"@open-feishu-card/renderer": patch
---

表格渲染对齐真机：单元格长文本默认不换行、超出用省略号截断。

- 行高换算单元格文本行数（客户端 `al()`/`Wi`）：`low` 1 行、`middle` 2 行、`high` 3 行，
  自定义像素行高按 `<54:1 <88:2 <110:3 <132:4 else 5` 阈值；1 行使用 nowrap + ellipsis，
  多行使用 `-webkit-line-clamp`。此前单元格只有 `word-break: break-word`，长文本全部换行、
  行高被撑开，与真机完全不同。
- 行高映射修正为 `low:32 / middle:54 / high:88`（客户端 `fallbackStyle.table.row_height_map`），
  缺省行高改为 `low`（真机默认单行 + 省略号）；`td`/`th` 不再自带内边距，改由内容层
  （表体 `0 8px`、表头 `6px 8px`）承担，行高才等于真机的 32/54/88。
- `row_height=auto`（RAW `builtin_table_row_height_extension`）不截断文本，内容最大
  `row_max_height`（缺省 124px）并可滚动。
- 列宽改为固定布局：`table-layout: fixed`，未写宽度的列最小 128px（客户端 `columnDefaultWidth`
  下限），空间不够时表格横向滚动；列宽全为 px/% 时表宽收紧到「列宽之和 + 每列 1px」
  （客户端 `Fl()`），不再把固定列拉满整卡、导致截断位置比真机靠后。
- 表头默认 1 行省略（`header_style.lines` 缺省 1，支持多行截断 / `full_displayed` 不限行数）。
- `lark_md` 单元格把行数写回 `markdown.property.lines`（拷贝 property，不改原卡片对象），由 markdown 的
  `children_wrapper` 做多行截断；`markdown` 单元格与真机一致不强制写 lines（避免截断图片/图表）。
