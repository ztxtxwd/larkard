# @open-feishu-card/components

## 0.1.4

### Patch Changes

- `img` 按来源分派字段：`scaleType` 恒定写 `scale_type`；历史 `mode` 仅在本身是缩放值时也写 `scale_type`，尺寸值仍留在 `mode`（旧模板兼容）
- 修正 `crop_top` 落进 `mode` 触发 "img mode is not supported"（回调 200673）

## 0.1.1

### Patch Changes

- 从 Schema 2.0 工具链移除 JSON 1.0 的 `action` / `note`
