---
'@open-feishu-card/renderer': patch
---

渲染器：负外边距大图真正出血到卡片两边；图片默认直角，不再擅自加 4px 圆角。

**出血（右边留白）**
DSL 里 `margin: "-20px -20px 0px -20px"` 的顶层大图，本意是顶到卡片边、左右贯穿整行。
真机上那个带 margin 的盒子 `width` 是 auto，负 margin 让它同时向两侧撑宽，所以图是贯通的；
渲染器这边盒子写死了 `width:100%`，负 margin 只把它整体左移 20px —— 左边溢出被裁，
右边就空出一条 20px 的白边。

`applyOuterMargin` 改为按外边距符号区分：水平外边距为正仍收窄（`calc(100% - Npx)`，
抵消 `body > * { width:100% }`），为负则把盒子撑宽（`calc(100% + Npx)`），并放开
`max-width`（CSS 的 `max-width:100%` 会把出血宽度夹回容器宽，右边照样留白）。
对所有组件生效，不只是 img。

**圆角**
真机网页版 `.universal-card-image__host { border-radius: 0 }`：图片默认直角，圆角只由
`corner_radius` 给出。渲染器此前在 CSS 里写死 `border-radius: 4px`，导致没声明
`corner_radius` 的图四角被圆掉，与真机不符。现改为 0，`corner_radius` 的内联圆角不受影响。

**验证**
新增 2 条用例（负外边距出血的 calc 宽度 + max-width:none；未声明 corner_radius 时不加圆角）。
