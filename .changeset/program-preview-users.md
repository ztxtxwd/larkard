---
'larkard': minor
---

新增卡片程序的多用户本地预览：

- `larkard/program/preview`：`createProgramPreview()` 在内存里跑一张共享卡，支持创建 / 选择 / 移除虚拟用户；切换用户只影响后续点击的 `$user`，不会分叉出多张卡。
- `larkard/program/preview/browser`：`mountProgramPreview()` 渲染一张卡并桥接点击、表单提交、下拉、勾选；`decorate` 可在每次重绘后做图表 / 图标 / 媒体后处理；`mountPreviewUserBar()` 提供新建 / 选择虚拟用户的最小工具条。
- `createVirtualUser()` 自动生成随机身份与首字头像，虚拟用户自动进入人员表，`person_list` / `at()` 显示姓名头像。
- 渲染器在 `interactive` 模式下为 `checker` 和可点击的 `interactive_container` 补上 `data-feishu-action` / `data-feishu-tag`。
- `findInteraction()` 从模拟器导出，供其它内存宿主复用点击匹配规则。
- 修复 `createToastHost()` 创建宿主 / toast 时漏加 `js` 标记：连续 toast 会重复建宿主、`destroy()` 也清不掉。
