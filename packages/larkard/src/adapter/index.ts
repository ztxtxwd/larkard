/**
 * larkard/adapter
 *
 * 公开 DSL（JSON Schema 2.0）↔ 飞书内部 RAW JSON 的双向适配器。
 * 目标：完全无损的双向转换（见 AGENTS.md）。
 * - dslToRaw: 公开 DSL → 渲染器认得的 RAW 形态
 * - rawToDsl / rawCardToDsl: RAW envelope → 公开 DSL
 */
export { dslToRaw } from './dsl-to-raw.js';
export {
  rawToDsl,
  rawCardToDsl,
  isRawCardEnvelope,
  degradeUnknown,
} from './raw-to-dsl.js';
export type { RawToDslOptions, RawToDslWarning } from './raw-to-dsl.js';
export { normalizeStoredCardColors, createColorRegistry, registerColorEntry } from './normalize-stored-colors.js';
export type { CustomColorEntry } from './normalize-stored-colors.js';
export {
  readThemeColorLight,
  readThemeColorDark,
  resolveCustomBackgroundLight,
  resolveCustomBorderLight,
  resolveTextStyleColor,
  resolveTextStyleCustomColorPair,
  themePairToColorEntry,
  isCustomHexColor,
} from './custom-colors.js';
export type { ThemeColorPair } from './custom-colors.js';
export type * from './types.js';

export { parseMarkdown, parseInline } from './md-parse.js';
export { codeBlockLines } from './code-block.js';
