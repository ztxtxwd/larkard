---
"@open-feishu-card/renderer": patch
---

- 补 `note` 备注块与 `text` 文本叶子：`note` 按真机 12px/N600 行内流式渲染，`is_footer` 出顶部 16px + 分割线；`text` 兼容 v1/简化卡片内容里的 `{tag:'text',text:'...'}`。
- 容器直接子项补 `position: relative`（等价真机 `.universal-card-element-shell__container > .universal-card-element-shell`）：负 margin 面板叠到图片上时按 DOM 顺序压在上层，不再被图片内部 `position:relative` 的 wrapper 反盖。
- `background_style` / `background_color` 支持真机 fallbackStyle 的 `bg-white` → `bg-body`、`white` → `static-white`，白底块不再透明；`propertyBackgroundColor` 同时读取 `backgroundColor` / `background_color`。
