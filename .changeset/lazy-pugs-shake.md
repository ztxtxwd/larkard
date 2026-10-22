---
'@open-feishu-card/renderer': minor
---

`interactive_container` 支持布局字段，预览与真机对齐。

此前渲染器只读 `vertical_spacing`，完全忽略 `direction` / `horizontal_align` / `vertical_align` / `horizontal_spacing`，容器内子组件一律退化为「左上贴边、固定 4px 行距」——components 包补上这些字段后，预览仍然画不对。

现在：
- `direction: "horizontal"` → `flex-direction: row`（缺省为 column）
- 两个 align 按主轴映射：`direction=vertical` 时 `vertical_align→justify-content`、`horizontal_align→align-items`；`direction=horizontal` 时两者交换
- `horizontal_spacing→column-gap`、`vertical_spacing→row-gap`，均与 direction 无关
- 未写这些字段时不输出对应样式，沿用原 CSS 默认值
