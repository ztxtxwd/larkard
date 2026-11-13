---
'@open-feishu-card/renderer': minor
'@open-feishu-card/schema': minor
'@open-feishu-card/components': minor
---

`column` 的 `horizontal_align` / `direction` 在预览里生效；`column_set` 的 `vertical_align` 明确废弃。

**background**：对齐字段在真机上由网页版引擎的同一个 `qr()` 产出，规则是

- `isRow = direction === 'horizontal'`
- `horizontal_align` → `isRow ? justify-content : align-items`
- `vertical_align` → `isRow ? align-items : justify-content`

但 `column_set` 调用时带了 `disableVerticalConfig: true`（`chunks` 里就是这一句），垂直对齐整段被跳过；官方《分栏》文档的 `column_set` 字段表同样没有 `vertical_align`。反过来的 `column` 两个对齐都吃，只是 `horizontal_align` 受 `unifyLayout` 开关控制。

**renderer**

- `column` 此前写死 `flex-direction: column`，只把 `vertical_align` 塞给 `justify-content`，`horizontal_align` 与 `direction` 完全没人读——于是「列内水平对齐」在预览里怎么点都不动，`direction: horizontal` 也永远排成竖列。
  现在按上面的规则映射，并补上 `horizontal_spacing → column-gap`（只在显式给值时输出，与真机一致）。
- `column_set` 忽略 `vertical_align` 的行为保留，加注释说明这是真机语义（`disableVerticalConfig`），不要再"修"。
- 新增 7 条用例锁定上述映射（含 RAW camelCase 与 `column_set` 忽略垂直对齐）。

**schema**

- `ColumnSetSchema` 去掉 `vertical_align`：真机不认，留着只会让模型生成一个静默失效的字段。需要列内容垂直居中写 `column.vertical_align`。
- `ColumnSetSchema` 的 describe 同步纠正（原文案推荐在 `column_set` 上写 `vertical_align=center`，是错的）。

**components**

- `ColumnSetProps` 去掉 `verticalAlign`，`renderColumnSet` 不再输出 `vertical_align`（`FeishuColumnSet` 类型本就没有这个字段）。垂直居中改用 `Column` 的 `verticalAlign`。
