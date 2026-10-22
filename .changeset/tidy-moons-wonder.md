---
'@open-feishu-card/renderer': patch
---

修复 `overflow` 未注册与 `interactive_container` 边框语义。

- **`overflow`（折叠按钮组）此前未注册**，`renderElement` 遇到它会返回 `null`，整块在预览里凭空消失而真机正常显示。现渲染为「…」图标触发器：静态预览只画触发器，interactive 模式用原生 `<details>` 做纯 CSS 下拉，选项文案与 `multi_url` 跳转都正确输出。
- **`border_color` 在 `has_border: false` 时仍会画边框**，与官方语义（仅 `has_border: true` 时生效）不符。现在未显式开启 `has_border` 时不再输出边框。
