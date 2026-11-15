---
"@open-feishu-card/renderer": minor
"@open-feishu-card/adapter": patch
---

补齐 audio 组件的渲染属性：此前只有最基本的播放条，`style` / `time_display` /
`time_position` / `border` / `margin` / `padding` / `background_style` / `fill_color` /
`width` / `disabled` / `fallback` 大部分没有落地。

- `style`：`normal` 块级用 PlayRoundFilled/PauseRoundFilled，`flat` 与 inline 用
  PlayFilled/PauseFilled，`speak` 用 SpeakingOutlined（对齐飞书网页版 xn 的图标分支）。
- `time_display` × `time_position`：`default` 单槽（auto：未播放显示总时长），`both` +
  `both_sides` 拆成「当前 / 总时长」双槽，`both` + `start`/`end` 单槽并带 `--both` 宽度类；
  时间槽带 `data-audio-time` 供水合更新，≥1h 自动切 `HH:MM:SS`（`--long`）。
- `border`：`color` / `corner_radius`（兼容 RAW 的 `hasBorder`、`borderColor`、
  `customBorderColor`、`border.cornerRadius`）。
- `margin` / `padding`：兼容 RAW 四向对象与 DSL CSS 简写字符串。
- `background_style` / `fill_color`：支持 `customBackgroundStyle` / `customFillColor` 主题色。
- `width`：`fill` / 像素 / `default`（进度条 + 时长时 `min-width:164px`）。
- `disabled`：改为真机同款白色半透明蒙层（不再是整体 opacity）；`disabled_tips` 走 title。
- `fallback`：无媒体时 `drop` 不渲染，`fallback_text` 输出兜底文案。
- 顺带修复 markdown 内嵌 `<audio style='speak'>` 的 round-trip：`audioStyle` 现在会被
  `rawToDsl` 投影回 `style`，渲染器也同时读 `style` / `audioStyle`。
