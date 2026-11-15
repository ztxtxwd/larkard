---
"@open-feishu-card/renderer": patch
---

表格列线（`th`/`td` 的 `border-right`）改用 `--line-divider-default`（`rgba(31,35,41,.15)`），
不再用 `--bg-filler` 实色 `#eff0f1`：

- 真机列线是半透明中性黑，叠在单元格底色上：表头列线叠 `#f2f3f5` → `(211,211,214)`（≈ 取色
  `#d4d4d7`），表体列线叠白 → `(222,222,223)`；
- 之前写死浅灰实色，表头列线比真机浅两档（`#eff0f1` vs `#d4d4d7`），看起来像一条发白的蓝灰线。
