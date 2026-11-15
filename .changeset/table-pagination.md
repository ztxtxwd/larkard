---
"@open-feishu-card/renderer": minor
---

table：支持真实分页。`page_size` 缺省按真机 5 行/页，单页不渲染翻页器（hideOnSinglePage）；翻页器对齐 antd small pagination，只输出「当前/总页数 + 上一页/下一页」，其余行以 `hidden` 留在 DOM。浏览器 `renderCard` 自动水合，SSR 可用 `feishuTablePagerHydrateScript()`。

另外把表格 1px 边框从最外层 `.universal-card-table` 移到 `.universal-card-table__scroll`，让翻页器位于边框之外（与真机结构一致）。
