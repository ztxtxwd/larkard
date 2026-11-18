---
"larkard": minor
---

新增 `larkard/palette` 与 `larkard/palette/browser`：

- 从图片像素提取确定性色板（OKLab 中位切分 + 强调色识别）；
- 支持任意卡片换色：把官方枚举/字面量物化成 `config.style.color` 的 cus-* token；
- icon / text_tag / header.template 等只能走官方枚举的字段回写最接近的枚举；
- 非 danger、非 form 按钮转成 `interactive_container`，以获得可自定义的底色/文字色；
- 官方色 light 值统一到 `content/colors.ts`，dark 色对在 `content/official-colors.ts`。
