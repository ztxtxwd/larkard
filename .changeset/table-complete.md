---
"@open-feishu-card/renderer": minor
"@open-feishu-card/adapter": patch
---

table：按飞书卡片 JSON 2.0 表格文档补齐全部参数，并对齐真机翻页器外观。

- 参数：`page_size` 按 [1,10] 夹紧；`row_height` 支持 low/middle/high/auto/自定义 px（[32,124]）；`row_max_height` 支持 [32,999]；`margin`、`freeze_first_column`（首列 sticky）落地；最多渲染 50 列。
- 列：`vertical_align`、`date_format` 生效；`width` 按 auto / [80,600]px / [1,100]% 夹紧；`display_name` 为空时与真机一致展示 `--`。
- 数据类型：新增 `date`（Unix 毫秒 / RAW `{type,value,format}`，YYYY/MM/DD/HH/mm/ss，缺省 RFC 3339 本地时区）；`number` 支持 `format.symbol` / `separator` / `precision`(0–10)；`markdown` / `lark_md` 支持 `![](image)`；空单元格展示 `--`。
- 翻页器：翻页区回到表格同一道外边框内，表格与翻页区间加分割线；按钮去掉描边/底色，仅保留 hover 背景；箭头按真机 `rotate(90deg)` 显示为上/下。
- adapter：RAW→DSL 补投影 `vertical_align` / `date_format` / `row_max_height` / `margin` / 像素 `row_height`；markdown 解析支持图片。
