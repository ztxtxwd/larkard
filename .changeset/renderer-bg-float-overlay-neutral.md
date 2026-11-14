---
"@open-feishu-card/renderer": patch
---

`--bg-float-overlay` 改用客户端的中性 4% 叠色（对齐真机 (246,246,246)）

网页版主题表把 `--bg-float-overlay` alias 成 `var(--N50)` = `#f5f6f7`，比真机偏蓝一阶
（面板底色实测：真机 `(246,246,246)` 三通道相等，旧实现 `(245,246,247)`）。
客户端这套用的是 N900 的 4% 叠色，叠在卡片白底上正好 `#f6f6f6`。

这里取中性化的 N900 `rgba(30, 30, 30, 0.04)` 而不是 `rgba(31, 35, 41, 0.04)`：8bit alpha
量化后 N900-raw 会让蓝通道多一阶（压成 `(246,246,247)`），中性值三通道才都是 246。
保留半透明语义，`column_set` / `column` / `interactive_container` 的 `grey` 底色因此也能
叠在彩色底上自然融合。

暗色主题补 `--bg-float-overlay: rgba(255,255,255,0.12)`（反向叠白，落在 `#1a1a1a` 上约
`#393939`，对齐客户端 dark token）。
