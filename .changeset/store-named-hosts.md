---
'@open-feishu-card/store': minor
---

支持多个命名宿主、CardKit 局部更新操作和卡片体积度量。

- `sealCardState` / `readCardState` / `unsealCardState` / `findStateHost` / `createStateHost` 新增 `{ id }` 选项，一张卡可挂多个宿主（如不可变程序 + 可变状态）。封印只替换同 id 的旧宿主；命名宿主只按 id 查找，丢了标识的封印分栏只当默认宿主，避免多宿主串号。id 不符合 `element_id` 规则时抛 `StateCodecError`。
- 新增 `buildStateHostPatch(state, { id })`：生成只改宿主封印的 `partial_update_element` 操作，可与视图改动放进同一次 batch_update。
- 新增 `cardByteLength(card)` 与 `CARD_SIZE_BUDGET`（30KB，官方建议上限）。
- `readCardState` / `findStateHost` 直接认 `im.message.get?card_msg_content_type=raw_card_content` 的 `{ json_card: "<字符串>" }` 信封，不必调用方先拆。
