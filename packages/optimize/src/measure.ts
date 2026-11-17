/**
 * 元素高度预测。
 *
 * 覆盖 interactive_container 里常见的叶子组件：markdown / plain_text / div / img /
 * button / hr。遇到拿不准的组件（chart / table / audio / video / 嵌套容器 / 行内图片）
 * 返回 undefined，让等高优化跳过整组。
 */
import {
  hasBackground,
  isHorizontal,
  isRecord,
  lengthPx,
  parseBox,
  verticalSpacingPx,
  ZERO_BOX,
} from './box.js';
import {
  countVisualLines,
  measureMarkdownContent,
  parseInline,
} from './markdown.js';
import {
  BASE_FONT_SIZE,
  BASE_LINE_HEIGHT,
  DEFAULT_LINE_HEIGHT,
  fontSizeOf,
  lineHeightForFontSize,
} from './text-metrics.js';
import type { JsonObject, MeasureText } from './types.js';

export interface MeasureEnv {
  measure: MeasureText;
}

export interface ContainerMeasurement {
  /** 自然高度（border-box，含 padding 与描边，不含 margin）。 */
  height?: number;
  /** 容器内容区宽度（扣掉 padding 与描边）；成功时一定有。 */
  innerWidth?: number;
  /** 失败原因，交给上层生成 skipped.detail。 */
  detail?: string;
}

/** client interactive_container 的默认 padding（`ws={left:12,right:12,top:4,bottom:4}`）。 */
const CONTAINER_DEFAULT_PADDING = { top: 4, right: 12, bottom: 4, left: 12 };
/** CSS `.universal-card-interactive-container { row-gap: 4px }`。 */
export const CONTAINER_DEFAULT_ROW_GAP = 4;

/** 容器子项纵向间距：未声明时取 CSS 的 4px，否则按 spacing 枚举 / px 解析。 */
export function containerRowGap(el: JsonObject): number {
  return el.vertical_spacing == null
    ? CONTAINER_DEFAULT_ROW_GAP
    : verticalSpacingPx(el.vertical_spacing);
}

/** 按钮 size → 盒高（renderer / client 的 padding + line-height + 1px 描边）。 */
const BUTTON_HEIGHT: Record<string, number> = {
  tiny: 24,
  small: 28,
  medium: 32,
  large: 40,
};

function textStyleOf(el: JsonObject): JsonObject | undefined {
  const style = el.text_style ?? el.textStyle;
  return isRecord(style) ? style : undefined;
}

/** text_size / textStyle.size → 字号；未声明（或认不出）返回 undefined。 */
function declaredFontSize(el: JsonObject): number | undefined {
  const style = textStyleOf(el);
  const raw = el.text_size ?? el.textSize ?? style?.size;
  if (raw == null) return undefined;
  if (typeof raw === 'number') return raw > 0 ? raw : undefined;
  if (typeof raw !== 'string') return undefined;
  const size = fontSizeOf(raw);
  // fontSizeOf 对未知字符串会回落 14；这里要区分“没写”和“写了但认不出”，
  // 后者按 renderer 的行为退回 CSS 默认（14 / 22.4），而不是显式字号行高。
  return size === BASE_FONT_SIZE && raw.trim() !== 'normal' && raw.trim() !== 'medium'
    ? undefined
    : size;
}

function isBold(el: JsonObject): boolean {
  const style = textStyleOf(el);
  const attrs = style?.attributes;
  return Array.isArray(attrs) && attrs.includes('bold');
}

/** icon 字面尺寸：显式 size 优先，否则按父级字号估（renderer iconDefaultSize）。 */
function iconSize(el: JsonObject, fontSize: number): number {
  const icon = el.icon ?? el.ud_icon ?? el.udIcon;
  if (!isRecord(icon)) return 0;
  const rawSize = icon.size ?? (isRecord(icon.property) ? icon.property.size : undefined);
  const explicit = lengthPx(rawSize);
  if (explicit != null) return explicit;
  if (fontSize <= 16) return fontSize + 2;
  const scaled = Math.round(fontSize * 1.15);
  return scaled % 2 === 0 ? scaled : scaled + 1;
}

function hasIcon(el: JsonObject): boolean {
  const icon = el.icon ?? el.ud_icon ?? el.udIcon;
  return isRecord(icon);
}

/** lines / text_lines：正数才生效。 */
function maxLinesOf(el: JsonObject): number | undefined {
  const raw = el.lines ?? el.text_lines ?? el.textLines;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

/** 一段纯文本按硬换行拆行后的视觉行数。 */
function plainTextHeight(
  content: string,
  width: number,
  fontSize: number | undefined,
  lineHeight: number,
  bold: boolean,
  maxLines: number | undefined,
  measure: MeasureText,
): number | undefined {
  let lines = 0;
  for (const line of String(content).replace(/\r\n?/g, '\n').split('\n')) {
    if (line === '') {
      lines += 1;
      continue;
    }
    const atoms = parseInline(line, fontSize ?? BASE_FONT_SIZE, bold);
    if (!atoms) return undefined;
    lines += countVisualLines(atoms, width, measure);
  }
  const capped = maxLines != null ? Math.min(lines, maxLines) : lines;
  return capped * lineHeight;
}

function measureMarkdownElement(
  el: JsonObject,
  width: number,
  env: MeasureEnv,
): number | undefined {
  const content = el.content;
  // RAW 的 elements 形态不走这里；公开 DSL 的 markdown 是字符串。
  if (typeof content !== 'string') return undefined;
  if (!content) return 0;

  const declared = declaredFontSize(el);
  const fontSize = declared ?? BASE_FONT_SIZE;
  const lineHeight = declared != null ? lineHeightForFontSize(declared) : DEFAULT_LINE_HEIGHT;
  const iconPx = hasIcon(el) ? iconSize(el, fontSize) : 0;
  const textWidth = width - (iconPx > 0 ? iconPx + 8 : 0);
  if (textWidth <= 0) return undefined;

  const height = measureMarkdownContent(content, textWidth, {
    fontSize,
    lineHeight,
    baseFontSize: fontSize,
    baseLineHeight: lineHeight,
    bold: isBold(el),
    measure: env.measure,
    maxLines: maxLinesOf(el),
  });
  if (height == null) return undefined;
  // 前缀图标 wrapper 高 1.6em，比正文矮时以正文为准。
  return iconPx > 0 ? Math.max(height, fontSize * 1.6) : height;
}

function measureTextElement(
  el: JsonObject,
  width: number,
  env: MeasureEnv,
): number | undefined {
  const content = el.content;
  if (typeof content !== 'string') return undefined;
  if (!content) return 0;
  const declared = declaredFontSize(el);
  const fontSize = declared ?? BASE_FONT_SIZE;
  // plain_text 只写 font-size，行高仍继承 CSS 的 line-height:1.6；
  // 引擎行高表（+2）只用于 markdown。
  const lineHeight = fontSize * BASE_LINE_HEIGHT;
  return plainTextHeight(
    content,
    width,
    declared,
    lineHeight,
    isBold(el),
    maxLinesOf(el),
    env.measure,
  );
}

/** div：一行「图标 + 文本」，或纯文本。 */
function measureDivElement(
  el: JsonObject,
  width: number,
  env: MeasureEnv,
): number | undefined {
  const rawWidth = el.width;
  let divWidth = width;
  if (rawWidth != null && rawWidth !== 'fill' && rawWidth !== 'default') {
    if (rawWidth === 'auto') return undefined;
    const px = lengthPx(rawWidth);
    if (px == null) return undefined;
    divWidth = Math.min(px, width);
  }

  const text = isRecord(el.text) ? el.text : undefined;
  const content = typeof el.text === 'string'
    ? el.text
    : typeof text?.content === 'string'
      ? text.content
      : '';
  const sizeRaw = text?.text_size ?? text?.textSize ?? el.text_size ?? el.textSize;
  const declared = sizeRaw == null
    ? undefined
    : (() => {
        const size = typeof sizeRaw === 'number' ? sizeRaw : fontSizeOf(String(sizeRaw));
        return typeof sizeRaw === 'string' && fontSizeOf(sizeRaw) === BASE_FONT_SIZE
          && sizeRaw !== 'normal' && sizeRaw !== 'medium'
          ? undefined
          : size;
      })();
  const fontSize = declared ?? BASE_FONT_SIZE;
  // div 里的文本是 plain_text，行高同样继承 1.6。
  const lineHeight = fontSize * BASE_LINE_HEIGHT;
  const iconPx = hasIcon(el) ? iconSize(el, fontSize) : 0;
  const textWidth = divWidth - (iconPx > 0 ? iconPx + 8 : 0);
  if (textWidth <= 0) return undefined;
  if (!content) return iconPx > 0 ? Math.max(iconPx, fontSize * 1.6) : 0;

  const textHeight = plainTextHeight(
    content,
    textWidth,
    declared,
    lineHeight,
    isBold(el) || isBold(text ?? {}),
    maxLinesOf(el),
    env.measure,
  );
  if (textHeight == null) return undefined;
  return Math.max(textHeight, iconPx > 0 ? fontSize * 1.6 : 0);
}

function imageTitleHeight(el: JsonObject): number {
  const title = el.title;
  const content = typeof title === 'string'
    ? title
    : isRecord(title) && typeof title.content === 'string'
      ? title.content
      : '';
  if (!content) return 0;
  const declared = isRecord(title) ? declaredFontSize(title) : undefined;
  // 图片标题是 plain_text，行高 1.6 倍；wrapper 再留 8px。
  const lineHeight = (declared ?? BASE_FONT_SIZE) * BASE_LINE_HEIGHT;
  return lineHeight + 8; // .universal-card-image__title { margin-bottom: 8px }
}

function measureImgElement(
  el: JsonObject,
  width: number,
  env: MeasureEnv,
): number | undefined {
  void env;
  const size = typeof el.size === 'string' ? el.size.trim() : '';
  let imageHeight: number | undefined;
  const pxPair = /^(\d+(?:\.\d+)?)px\s+(\d+(?:\.\d+)?)px$/i.exec(size);
  const ratio = /^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/.exec(size);
  if (pxPair) {
    imageHeight = Number(pxPair[2]);
  } else if (ratio) {
    const w = Number(ratio[1]);
    const h = Number(ratio[2]);
    if (!(w > 0) || !(h > 0)) return undefined;
    imageHeight = width * h / w;
  } else {
    // 没有显式尺寸：真实高度取决于图片原始宽高比，服务端拿不到。
    return undefined;
  }
  return imageTitleHeight(el) + imageHeight;
}

function measureButtonElement(el: JsonObject): number {
  const size = typeof el.size === 'string' ? el.size : 'medium';
  return BUTTON_HEIGHT[size] ?? BUTTON_HEIGHT.medium!;
}

/**
 * 单个子元素的外高（含自身 margin）。`width` 是父容器内容区宽度。
 * 返回 undefined 表示该组件不在预测白名单里。
 */
export function measureElement(
  el: JsonObject,
  width: number,
  env: MeasureEnv,
): number | undefined {
  const margin = parseBox(el.margin);
  if (!margin) return undefined;
  const innerWidth = width - margin.left - margin.right;
  if (innerWidth <= 0) return undefined;

  const tag = typeof el.tag === 'string' ? el.tag : '';
  let height: number | undefined;
  switch (tag) {
    case 'markdown':
      height = measureMarkdownElement(el, innerWidth, env);
      break;
    case 'plain_text':
    case 'text':
      height = measureTextElement(el, innerWidth, env);
      break;
    case 'div':
      height = measureDivElement(el, innerWidth, env);
      break;
    case 'img':
      height = measureImgElement(el, innerWidth, env);
      break;
    case 'button':
      height = measureButtonElement(el);
      break;
    case 'hr':
      // CSS .universal-card-hr { height:1px; margin:8px 0 }
      height = 17;
      break;
    default:
      height = undefined;
  }
  if (height == null) return undefined;
  return height + margin.top + margin.bottom;
}

/**
 * interactive_container 的可用外宽。
 *
 * 返回 undefined 表示宽度是 auto / 无法确定；这类容器不参与等高。
 */
export function containerOuterWidth(el: JsonObject, availableWidth: number): number | undefined {
  const margin = parseBox(el.margin);
  if (!margin) return undefined;
  const widthValue = el.width;
  let outer: number;
  if (widthValue == null || widthValue === 'fill' || widthValue === 'default') {
    outer = availableWidth - margin.left - margin.right;
  } else if (widthValue === 'auto') {
    return undefined;
  } else {
    const px = lengthPx(widthValue);
    if (px == null) return undefined;
    // 真机 element shell 对 pixels 宽度也加了 max-width:100%。
    outer = Math.min(px, availableWidth) - margin.left - margin.right;
  }
  return outer > 0 ? outer : undefined;
}

/** 容器的内容区宽度（扣掉 padding 与描边）。 */
export function containerInnerWidth(el: JsonObject, outerWidth: number): number | undefined {
  const padding = el.padding == null
    ? CONTAINER_DEFAULT_PADDING
    : parseBox(el.padding);
  if (!padding) return undefined;
  const bordered = el.has_border === true || el.hasBorder === true;
  const border = bordered ? 1 : 0;
  const inner = outerWidth - padding.left - padding.right - border * 2;
  return inner > 0 ? inner : undefined;
}

/**
 * 预测一个 interactive_container 的自然高度。
 *
 * 只支持纵向排列。横向容器的子项宽度取决于内容，无法用“整行宽度”简单预测。
 */
export function measureInteractiveContainer(
  el: JsonObject,
  outerWidth: number,
  env: MeasureEnv,
): ContainerMeasurement {
  if (isHorizontal(el)) {
    return { detail: 'horizontal' };
  }
  const padding = el.padding == null
    ? CONTAINER_DEFAULT_PADDING
    : parseBox(el.padding);
  if (!padding) return { detail: 'padding' };
  const bordered = el.has_border === true || el.hasBorder === true;
  const border = bordered ? 1 : 0;
  const innerWidth = outerWidth - padding.left - padding.right - border * 2;
  if (innerWidth <= 0) return { detail: 'width-overflow' };

  const elements = Array.isArray(el.elements) ? el.elements : [];
  if (elements.length === 0) return { detail: 'empty' };

  const rowGap = containerRowGap(el);
  let childrenHeight = 0;
  for (const raw of elements) {
    if (!isRecord(raw)) return { detail: 'child' };
    const height = measureElement(raw, innerWidth, env);
    if (height == null) {
      return { detail: typeof raw.tag === 'string' ? raw.tag : 'unknown' };
    }
    childrenHeight += height;
  }

  const height = padding.top + padding.bottom + border * 2
    + childrenHeight
    + rowGap * Math.max(0, elements.length - 1);
  return { height, innerWidth };
}

/** column_set 内边距：有底色时 CSS 默认 4px（`.universal-card-column-set--bg`）。 */
export function columnSetPadding(el: JsonObject) {
  if (el.padding != null) return parseBox(el.padding);
  return hasBackground(el) ? { top: 4, right: 4, bottom: 4, left: 4 } : ZERO_BOX;
}
