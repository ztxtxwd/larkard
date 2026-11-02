---
'@open-feishu-card/renderer': patch
---

预览对齐真机：header 白底 + 输入框/按钮/下拉不再撑满整行。

三处差异都出在渲染层（真机和预览吃的是同一份卡片 JSON），规则逆向自飞书网页版引擎：

- header 底色：真机 default/disabled 模板的 `bg_color` 是空串，即不设背景色、透出卡片根的
  `--bg-float`(#ffffff)。此前这里写死 #f5f6f7(N50)，预览里就多出一条浅灰标题栏，真机并没有。
  改成白色，并给 header 背景层挂 `--no-template`（真机无模板时底部不留内边距）。
- 输入框：真机 input 默认 `width:100%` 但 `max-width:282px`，只有 `width:"fill"` 才撑满。
- 下拉：真机 select 默认定宽 282px；`type:"text"` 自适应且无边框；`width:"fill"` 撑满。
- 按钮：真机按「卡片容器宽度 > 320px」分档（isWide）——宽屏自适应内容宽、窄屏撑满整行；
  text 族恒撑满（文字仍靠左）；`width:"fill"` 恒撑满。此前 0.2.27 那次按「默认按钮撑满整行」
  的结论写死了 block，这次一并纠正，改用容器查询实现窄屏分档。
