---
"@open-feishu-card/renderer": minor
"@open-feishu-card/optimize": patch
---

`renderer` 支持卡片 `config.width_mode`，卡片默认宽度由 605px 对齐为官方的 600px。

- `renderer`：根节点输出 `universal-card-root--width-{default|compact|fill}`。`default`（不填或非法值）上限 600px，`compact` 上限 400px 并强制走窄屏组件档位（对齐真机 `forceNarrow`），`fill` 取消 `max-width` 撑满容器；同时兼容 RAW 的 `width_mode` / `widthMode` 两种字段名。
- `renderer`：`.universal-card-root` 的 `max-width`、header 高光 `background-size` 统一由 605px 改为 600px；`scripts/card-to-html.mjs` 的预览容器不再写死宽度，交给卡片的 `width_mode` 决定。
- `optimize`：分栏等高的默认参考卡宽同步由 605px 改为 600px（显式传 `cardWidth` / `widths` 不受影响）。
