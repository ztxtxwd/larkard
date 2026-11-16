---
"@open-feishu-card/schema": patch
"@open-feishu-card/renderer": patch
---

修复彩色图标（`*_colorful`）的两处不一致：

- **schema**：`IconTokenSchema` 补上客户端内置的 AI 图标（`ai-common_colorful`、`ai-search_colorful` 等 11 个）与官方文档里漏收的 `approval_colorful`，避免合法卡片被校验判为非法。
- **renderer**：这些彩色图标在真机上是自带渐变的彩色图形，而 `ud-icons` 字体是单色轮廓（原始 woff2 无 COLR/CPAL），此前会继承父级颜色（header 里就是模板蓝）。现在命 `COLORFUL_ICON_GRADIENTS` 的 token 改用 `background-clip:text` 渐变着色（AI 系列：`#4752E6 → #CF5ECF`，暗色 `#7B83F7 → #B54AB5`），header 也不再给彩色图标注入标题色。
