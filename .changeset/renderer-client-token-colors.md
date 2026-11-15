---
"@open-feishu-card/renderer": patch
---

配色对齐客户端 light token 表（`feishu-web-dump/debugger/19ecdc88…js` 的 name→export→值映射），
修掉「整体比真机偏蓝」的几处来源：

1. `--bg-float-overlay` 改回实色 `#f5f6f7`（客户端 token = `rgb(245,246,247)`）。
   此前按 JPEG 真机截图量到 `(246,246,246)` 把它改成了 `rgba(30,30,30,.04)`：JPEG 色度子采样
   会把 `#f5f6f7` 压成中性 246，属于误判。现在 `grey` 与 `grey-50` 都是 `#f5f6f7`，
   与真机 PNG（om_footer_shot.png）逐通道一致。
2. 分割线改用 `--line-divider-default`（客户端 light = `rgba(31,35,41,.15)` → 叠白 `(222,222,223)`）：
   `hr`、`collapse_divider`、`blockquote` 竖线、表格 `th/td` 底边不再写死 `#dee0e3`
   （蓝色阶实色，叠白后 B 通道多 4 阶）。表格列线改用 `--bg-filler`（`#eff0f1`）。
3. 表格表头：
   - `header_style.background_style=grey` 由 `#f5f6f7` 改为 `#f2f3f5`（真机 token
     `udtoken-table-bg-head` = N100，见 fallbackStyle `table.background_color.grey`）。
   - 支持 `header_style.text_color` / `text_size` / `lines`：真机把表头单元格当 PlainText 渲染
     （`textStyle: bold/size/color/customColor`），`text_color=grey` 应为 `#646a73`，
     此前一律写死 `#1f2329`（蓝黑）。
4. 暗色：`--bg-float-overlay` = `#373737`、`--line-divider-default` = `rgba(207,207,207,.15)`;
   表格 `th/td` 不再单独覆盖 `border-color`，跟随 token。
