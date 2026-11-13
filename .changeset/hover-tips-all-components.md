---
"@open-feishu-card/renderer": patch
---

补齐各组件的 `hover_tips` / `disabled_tips`：

- `button`、`video` 此前完全忽略悬浮提示，现在把文案挂到组件根节点的原生 `title` 上。
- `interactive_container`、`checker` 改为统一解析，禁用态展示 `disabled_tips`（不再吞掉或错误回退 `hover_tips`）。
- `select_img` 选项复用同一套解析逻辑（含组件级 `disabled` 连带禁用选项时的 `disabled_tips`）。
- 统一在 `renderElement` 里给根节点附加 `title`，自定义组件只要元素带 `hover_tips` 也会生效；组件自己已输出的 `title` 不会被覆盖。
- 兼容 RAW camelCase（`hoverTips` / `disabledTips`）、DSL snake_case（`hover_tips` / `disabled_tips`）以及两种文本叶子形态。
