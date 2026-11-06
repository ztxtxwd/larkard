# @open-feishu-card/store

## 0.2.0

### Minor Changes

- 377a4f5: 支持多个命名宿主、CardKit 局部更新操作和卡片体积度量。
  
  - `sealCardState` / `readCardState` / `unsealCardState` / `findStateHost` / `createStateHost` 新增 `{ id }` 选项，一张卡可挂多个宿主（如不可变程序 + 可变状态）。封印只替换同 id 的旧宿主；命名宿主只按 id 查找，丢了标识的封印分栏只当默认宿主，避免多宿主串号。id 不符合 `element_id` 规则时抛 `StateCodecError`。
  - 新增 `buildStateHostPatch(state, { id })`：生成只改宿主封印的 `partial_update_element` 操作，可与视图改动放进同一次 batch_update。
  - 新增 `cardByteLength(card)` 与 `CARD_SIZE_BUDGET`（30KB，官方建议上限）。
  - `readCardState` / `findStateHost` 直接认 `im.message.get?card_msg_content_type=raw_card_content` 的 `{ json_card: "<字符串>" }` 信封，不必调用方先拆。

## 0.1.2

### Patch Changes

- 状态宿主按客户端纵向间距枚举（default 8 / medium 12 / large 16）写负上边距，此前误用横纵并集表，具名 token 一律差 4px
- 间距同时读取 RAW 的 `body.property.verticalSpacingValue` / `vertical_spacing`
- 正文横向排列（`body.direction = horizontal`）时不写负上边距
- `createStateHost` 的 `gap` 改为可选（默认不写 margin），支持像素串

## 0.1.0

### Minor Changes

- 新增 `@open-feishu-card/store`：空分栏宿主 + `action.multi_url` 封印卡片 state（deflate + base64url）
