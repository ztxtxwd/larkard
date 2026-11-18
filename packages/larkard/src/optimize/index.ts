/**
 * `larkard/optimize`
 *
 * 发送前的卡片视觉优化。当前提供：
 * - `equalizeInteractiveContainerHeightsByPadding()`：同一分栏内各列的唯一
 *   interactive_container 用不可见字符补到等高，不写死 `height`（推荐）。
 * - `equalizeInteractiveContainerHeights()`：预测等高后写回 `height: "Npx"`；
 *   单个固定高度无法同时贴合桌面和窄屏，会在一端留白。
 * - `upgradeTextToRichText()`：把 plain_text 文本对象升级为 lark_md，把普通文本
 *   组件 div 升级为 markdown 富文本组件；plain_text 内容默认做实体转义以保持
 *   字面量展示。
 *
 * 纯函数、零依赖、Node / 浏览器通用：不渲染 DOM，只按真机规则做布局预测。
 * 需要像素级真机结果时，可以在浏览器里传 `measureText`（Canvas measureText 包装）。
 */
export { equalizeInteractiveContainerHeights } from './equalize.js';
export { equalizeInteractiveContainerHeightsByPadding } from './pad.js';
export { upgradeTextToRichText } from './rich-text.js';
export {
  defaultMeasureText,
  measureTextByChar,
  charWidthEm,
  fontSizeOf,
  lineHeightForFontSize,
  textLineHeight,
  DEFAULT_LINE_HEIGHT,
  BASE_FONT_SIZE,
  BASE_LINE_HEIGHT,
  TEXT_SIZE_MAP,
  TEXT_SIZE_PX,
} from '../content/metrics.js';
export {
  measureMarkdownContent,
  parseInline,
  countVisualLines,
} from './markdown.js';
export type {
  EqualizeHeightsOptions,
  EqualizeResult,
  EqualizedContainer,
  EqualizedGroup,
  HeightChange,
  ImageSize,
  MeasureImage,
  MeasureText,
  PadHeightsOptions,
  PadHeightsResult,
  PaddedContainer,
  PaddedGroup,
  PaddingChange,
  Path,
  SkippedGroup,
  SkipReason,
  TextUpgradeChange,
  TextUpgradeKind,
  TextUpgradeSkip,
  TextUpgradeSkipReason,
  UpgradeTextOptions,
  UpgradeTextResult,
} from './types.js';
export type { JsonObject } from './types.js';
