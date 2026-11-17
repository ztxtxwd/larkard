---
"@open-feishu-card/schema": patch
"@open-feishu-card/check": patch
"@open-feishu-card/renderer": patch
"@open-feishu-card/components": patch
---

`corner_radius` 只接受**单个** px 或百分比值（飞书不支持 CSS 四角简写）。

- `schema`：新增 `CornerRadiusSchema`（单个 px / 百分比值；空字符串保留为编辑器「未设置」的回读形态），替换 `img` / `img_combination` / `interactive_container` / `audio.border` / `collapsible_panel.border` 的自由字符串；`"8px 0 0 8px"` 这类多值现在会校验失败。
- `renderer`：圆角统一走 `normalizeCornerRadius()`，多值 / 非法值不输出 `border-radius`，预览不再比真机「更能画」。
- `check`：新增真机规则 `corner-radius-domain`：`8px 8px 8px 8px` 这类四角全等的简写自动折叠为 `8px`；各角不同没有唯一正确解，只报错不修。
- `components`：`cornerRadius` 类型收窄为 `` `${number}px` | `${number}%` ``。
