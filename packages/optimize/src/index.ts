/**
 * `@open-feishu-card/optimize`
 *
 * 发送前的卡片视觉优化。当前提供：
 * - `equalizeInteractiveContainerHeights()`：同一分栏内各列的唯一
 *   interactive_container 预测等高，写回 `height: "Npx"`。
 *
 * 纯函数、零依赖、Node / 浏览器通用：不渲染 DOM，只按真机规则做布局预测。
 * 需要像素级真机结果时，可以在浏览器里传 `measureText`（Canvas measureText 包装）。
 */
export { equalizeInteractiveContainerHeights } from './equalize.js';
export {
  defaultMeasureText,
  measureTextByChar,
  charWidthEm,
  fontSizeOf,
  lineHeightForFontSize,
  DEFAULT_LINE_HEIGHT,
  BASE_FONT_SIZE,
  BASE_LINE_HEIGHT,
  TEXT_SIZE_PX,
} from './text-metrics.js';
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
  MeasureText,
  Path,
  SkippedGroup,
  SkipReason,
} from './types.js';
export type { JsonObject } from './types.js';
