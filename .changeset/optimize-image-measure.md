---
'larkard': minor
---

optimize：新增 `measureImage`（无 `size` 图片的原始宽高比查询）与 `preserveUnmeasuredFillers`（测不出来的分栏保留已有填充）。

- `measureImage` 让 `fit_horizontal` 等内容图参与等高预测：浏览器可从已加载的 `<img>` 读 `naturalWidth/naturalHeight`，服务端可查媒体元信息；不传时行为不变（整组跳过）。
- 嵌套 `interactive_container` 现在参与高度预测：纵向按子项求和、横向按最高子项估算。
- `preserveUnmeasuredFillers: true` 时，`unsupported-child` / `container-width` / `container-empty` 跳过的分栏会保留入参里的填充元素，避免服务端把浏览器按真实图片尺寸补好的结果清掉；恢复的填充不重编号，新填充从已有最大编号之后发号。
