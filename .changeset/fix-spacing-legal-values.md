---
"@open-feishu-card/check": patch
---

修复 `spacing-domain` 的两处误判：真机接受、却被当成非法值报错/删除。

- `column_set.horizontal_spacing` 除 `default` 外还接受 `auto`（两者落点都是默认间距）。
- 所有间距字段的空串 `""` 都接受，等同没设置。

依据是仓库 `docs/feishu-card-doc-gaps/column-spacing-value-domain.md` 的实测取值表。
新增两个回归用例（`column_set.horizontal_spacing: "auto"`、`vertical_spacing: ""`）。
