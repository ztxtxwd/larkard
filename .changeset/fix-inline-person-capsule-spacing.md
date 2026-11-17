---
"@open-feishu-card/renderer": patch
---

markdown 内联 person 尺寸与胶囊行距对齐真机：

- 胶囊仅头像 30px → 22px，胶囊头像+姓名 18px → 16px（正文 14px），仅头像/头像+姓名/胶囊三套公式按网页版 Person 组件分档。
- 胶囊内容盒固定为 `max(引擎行高 - 2, 字号)`，根节点撑满父级行高并保持 `align-items:center`；相邻两行胶囊之间恢复真机的上下留白（此前内容盒贴顶、整行等高，连续两行胶囊会贴在一起）。
