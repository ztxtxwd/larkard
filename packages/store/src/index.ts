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
 *   "action": { "multi_url": { "url": "lark://msgcard/unsupported_action#s1...." } },
 *   "columns": [{ "tag": "column", "width": "auto", "elements": [] }]
 * }
 * ```
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
  createStateHost,
  findStateHost,
  readCardState,
  sealCardState,
  unsealCardState,
} from './host.js';
