---
"@open-feishu-card/renderer": patch
---

对齐真机前缀图标的尺寸与间距：

- `markdown.icon`：默认尺寸改用引擎 `j(字号)`（14px 正文 → 16px 图标，不再 1:1 跟随字号），右侧间距 4px → 8px；首元素为 heading 时按 `Aa(level)` 给图标尺寸，wrapper 跟随标题行高/上边距。
- `div.icon` / `person_list.icon`：默认尺寸同样走 `j(字号)`，wrapper 的 font-size/高度跟随正文/头像；`custom_icon` 补齐默认尺寸与宽高解析。
