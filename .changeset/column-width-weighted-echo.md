---
"@open-feishu-card/adapter": patch
---

修复 RAW→DSL 丢失 `column.widthValue` 权重，导致 `flex_mode: stretch` 的
weighted 列在预览里变成 1:1（真机是 1:2）。

真机的列宽渲染（网页版引擎 `ao()`）以 `widthValue` 为准，`width` + `weight`
只是没有回显时的兜底：

```js
if (widthValue) {
  if (type === 'column_width_weighted') { flexBasis = 0; flexGrow = value; }
  // pixels / builtin auto 同理
} else if (width) { width / weight 兜底 }
```

adapter 之前把 `column_width_weighted` 回显当成“和 `width` + `weight` 冗余”
直接丢掉。但 RAW 里的 `weight` 常常是默认值 1（甚至缺失），真正的权重只在
`widthValue.value` 里 —— 丢掉回显后 DSL 只剩 `weight: 1`，渲染器就按 1:1 排。

现在 column 的回显按真机优先级投影：

- `column_width_weighted` → `width: "weighted"` + `weight: value`
- `builtin_column_width` → `width: value`（`auto` 等）
- `pixels` → `width: "Npx"`

`weight` 与 `widthValue.value` 冲突时以 `widthValue` 为准（与真机一致）。
