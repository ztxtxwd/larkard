---
"larkard": patch
---

渲染器标签、分割线与链接样式对齐真机：

- `text_tag` 改为跟随父字号（父字号 ≤18px 时 18px 高 / 12px 字、padding 0 4px；更大字号按引擎公式缩放），外层按父行高做 `vertical-align:top + top=(行高-标签高)/2+0.5` 补偿，并去掉多余的 `margin:0 2px`。note 内按 notation 12px/20px 计算，header 的 `text_tag_list` 与真机一致不做行内偏移。
- `number_tag` 改为真机圆形徽标：固定 16×16（17px 字号时 18×18）、`border-radius:999px`、`rgba(31,35,41,.08)` 底色 / `rgba(31,35,41,.8)` 字色、外层 `padding:0 3px`，并按行高上移 `(行高-尺寸)/6`；支持 `background_color` / `font_color` 的 token 映射与 URL 链接。
- `hr` 上下间距改为真机的 16px，并补上首/尾元素收掉外侧 margin 的规则。
- markdown 链接改用 `--B500` (#336df4)，hover 不再出现下划线；note 内链接降为 N600。
