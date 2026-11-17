---
"@open-feishu-card/optimize": minor
---

新增 `equalizeInteractiveContainerHeightsByPadding()`：不再写死 `height`，改为在每个较矮的 `interactive_container` 末尾追加一段不可见的可换行字符（`U+200B` + `U+3000`），让分栏各列按当前宽度自然等高。填充元素以 `ofc_hfill_` 前缀识别，重复运行会先清理旧填充，幂等；桌面与窄屏参考宽度可精确对齐，中间宽度最多差 1 行。原固定高度策略 `equalizeInteractiveContainerHeights()` 保留。
