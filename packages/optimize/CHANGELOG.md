# @open-feishu-card/optimize

## 0.2.0

### Minor Changes

- 79568b3: 新增 `equalizeInteractiveContainerHeightsByPadding()`：不再写死 `height`，改为在每个较矮的 `interactive_container` 末尾追加一段不可见的可换行字符（`U+200B` + `U+3000`），让分栏各列按当前宽度自然等高。填充元素以 `ofc_hfill_` 前缀识别，重复运行会先清理旧填充，幂等；桌面与窄屏参考宽度可精确对齐，中间宽度最多差 1 行。原固定高度策略 `equalizeInteractiveContainerHeights()` 保留。
- 79568b3: 新增 `upgradeTextToRichText()`：把 `tag: "plain_text"` 的文本对象升级为 `lark_md`，把普通文本组件 `div` 升级为富文本组件 `markdown`。plain_text 内容默认按官方文档做 HTML 实体转义，保证升级后仍按字面量展示；`div` 的 `text_size` / `text_align` / `lines` / `text_color` / `icon` 等字段会映射到 `markdown` 对应字段，`width` 非 `fill` 或存在无法映射字段时跳过并回报 `skipped`。

### Patch Changes

- 79568b3: `renderer` 支持卡片 `config.width_mode`，卡片默认宽度由 605px 对齐为官方的 600px。
  
  - `renderer`：根节点输出 `universal-card-root--width-{default|compact|fill}`。`default`（不填或非法值）上限 600px，`compact` 上限 400px 并强制走窄屏组件档位（对齐真机 `forceNarrow`），`fill` 取消 `max-width` 撑满容器；同时兼容 RAW 的 `width_mode` / `widthMode` 两种字段名。
  - `renderer`：`.universal-card-root` 的 `max-width`、header 高光 `background-size` 统一由 605px 改为 600px；`scripts/card-to-html.mjs` 的预览容器不再写死宽度，交给卡片的 `width_mode` 决定。
  - `optimize`：分栏等高的默认参考卡宽同步由 605px 改为 600px（显式传 `cardWidth` / `widths` 不受影响）。

## 0.1.0

### Minor Changes

- e2213ef: 新增 `@open-feishu-card/optimize`：发送前视觉优化。首个能力是分栏内交互容器等高——按真机字号 / 行高 / padding / margin / 折行规则预测每个 `interactive_container` 的自然高度，取列间最大值后写回 `height`，避免真机上各列参差不齐。
