/**
 * @open-feishu-card/store
 *
 * 卡片内嵌 state：空 `column_set`（零高度）+ `action.multi_url.url`，
 * 载荷为 `deflate → base64url`。
 *
 * 写入形态（DSL）：
 * ```json
 * {
 *   "tag": "column_set",
 *   "element_id": "card_state",
 *   "margin": "-8px 0 0 0",
 *   "action": { "multi_url": { "url": "lark://msgcard/unsupported_action#s1...." } },
 *   "columns": [{ "tag": "column", "width": "auto", "elements": [] }]
 * }
 * ```
 *
 * `margin` 的上外边距 = 正文纵向间距的负数（正文纵向排列时才有；横向正文不写）。
 * 间距按客户端纵向枚举算：default 8 / medium 12 / large 16。
 *
 * 回读请走 `raw_card_content`（`user_card_content` 会丢掉 URL）。
 */

export {
  STATE_CODEC_VERSION,
  STATE_URL_BASE,
  STATE_URL_PREFIX,
  StateCodecError,
  encodeStateUrl,
  decodeStateUrl,
  isStateUrl,
} from './codec.js';

export {
  STATE_ELEMENT_ID,
  buildStateHostPatch,
  createStateHost,
  findStateHost,
  readCardState,
  sealCardState,
  unsealCardState,
  type StateHostOptions,
  type StateHostPatch,
} from './host.js';

export { CARD_SIZE_BUDGET, cardByteLength } from './size.js';
