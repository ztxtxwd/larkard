---
'@open-feishu-card/adapter': patch
'@open-feishu-card/renderer': patch
---

支持视频公开 DSL 的嵌套封面 `cover: { img_key }`。

- adapter：`dslToRaw` 把 `cover.img_key` 映射为 RAW `coverImageID`，不再把嵌套 `cover` 透传进 RAW（避免飞书按未知属性 200621 拒收）。
- renderer：`resolveVideoCoverSrc` 同时识别扁平 `coverImageID` / `image_key` / `cover_image_key` 与嵌套 `cover`（`img_key` / `imageID` / `image_id` 等）。有媒体源时输出 `<video poster>`，无媒体源时渲染封面壳。
