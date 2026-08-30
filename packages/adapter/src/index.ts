/**
 * @open-feishu-card/adapter
 *
 * 公开 DSL（JSON Schema 2.0）↔ 飞书内部 RAW JSON 的双向适配器。
 * - dslToRaw: 公开 DSL → 渲染器认得的 RAW 形态
 * - rawToDsl / rawCardToDsl: RAW envelope → 公开 DSL
 *   （raw→DSL 完整对齐 feishu-raw-card-to-dsl）
 */
export { dslToRaw } from './dsl-to-raw.js';
export {
  rawToDsl,
  rawCardToDsl,
  isRawCardEnvelope,
  degradeUnknown,
} from './raw-to-dsl.js';
export { normalizeStoredCardColors } from './normalize-stored-colors.js';
export type { CustomColorEntry } from './normalize-stored-colors.js';
export {
  readThemeColorLight,
  resolveCustomBackgroundLight,
  resolveTextStyleColor,
} from './custom-colors.js';
export type { ThemeColorPair } from './custom-colors.js';
export type { CardElement, ElementProperty, JsonCard } from './types.js';
