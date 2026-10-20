# @open-feishu-card/store

## 0.1.2

### Patch Changes

- 状态宿主按客户端纵向间距枚举（default 8 / medium 12 / large 16）写负上边距，此前误用横纵并集表，具名 token 一律差 4px
- 间距同时读取 RAW 的 `body.property.verticalSpacingValue` / `vertical_spacing`
- 正文横向排列（`body.direction = horizontal`）时不写负上边距
- `createStateHost` 的 `gap` 改为可选（默认不写 margin），支持像素串

## 0.1.0

### Minor Changes

- 新增 `@open-feishu-card/store`：空分栏宿主 + `action.multi_url` 封印卡片 state（deflate + base64url）
