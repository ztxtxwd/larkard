/**
 * DSL config.style.color 中的 cus-* 别名在 dslToRaw 时展开为渲染器已支持的
 * customBackgroundStyle / textStyle.customColor（对齐飞书 RAW 真机字段）。
 */
import type { CardElement, TextStyle } from './types.js';

export type CustomColorEntry = { light_mode: string; dark_mode: string };
export type ColorRegistry = Record<string, CustomColorEntry>;

export function readColorRegistry(card: Record<string, unknown>): ColorRegistry {
  const config = isRecord(card.config) ? card.config : undefined;
  const style = config && isRecord(config.style) ? config.style : undefined;
  const color = style && isRecord(style.color) ? style.color : undefined;
  if (!color) return {};
  const out: ColorRegistry = {};
  for (const [key, value] of Object.entries(color)) {
    if (!isRecord(value)) continue;
    const light = typeof value.light_mode === 'string' ? value.light_mode
      : typeof value.lightMode === 'string' ? value.lightMode
      : undefined;
    const dark = typeof value.dark_mode === 'string' ? value.dark_mode
      : typeof value.darkMode === 'string' ? value.darkMode
      : undefined;
    if (light && dark) out[key] = { light_mode: light, dark_mode: dark };
  }
  return out;
}

export function isCustomColorAlias(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('cus-');
}

/** column / column_set background_style cus-N → customBackgroundStyle */
export function expandBackgroundStyleAlias(
  style: unknown,
  registry: ColorRegistry,
): { light_mode: string; dark_mode: string } | undefined {
  if (!isCustomColorAlias(style)) return undefined;
  const entry = registry[style];
  if (!entry) return undefined;
  return { light_mode: entry.light_mode, dark_mode: entry.dark_mode };
}

/** textStyle.color cus-N → customColor（去掉 color，避免被当成命名色） */
export function expandTextStyleColor(
  textStyle: TextStyle | undefined,
  registry: ColorRegistry,
): TextStyle | undefined {
  if (!textStyle) return textStyle;
  const color = typeof textStyle.color === 'string' ? textStyle.color.trim() : undefined;
  if (!isCustomColorAlias(color)) return textStyle;
  const entry = registry[color];
  if (!entry) return textStyle;
  const { color: _drop, ...rest } = textStyle;
  return {
    ...rest,
    customColor: { lightMode: entry.light_mode, darkMode: entry.dark_mode },
  };
}

/** 递归展开 markdown 子树里的 cus-* 文字色 */
export function expandMarkdownElements(
  elements: CardElement[] | undefined,
  registry: ColorRegistry,
): CardElement[] | undefined {
  if (!Array.isArray(elements)) return elements;
  return elements.map((el) => {
    const property = el.property ? { ...el.property } : undefined;
    if (!property) return el;
    if (Array.isArray(property.elements)) {
      property.elements = expandMarkdownElements(property.elements, registry);
    }
    if (property.textStyle) {
      const expanded = expandTextStyleColor(property.textStyle, registry);
      if (expanded) property.textStyle = expanded;
    }
    return property === el.property ? el : { ...el, property };
  });
}

/** markdown.font_color 且 content 无 <font> 时，包一层 font 再解析 */
export function wrapMarkdownContentWithFontColor(
  content: string,
  fontColor: string | undefined,
): string {
  if (!fontColor || !content || /<font\s+color/i.test(content)) return content;
  return `<font color='${fontColor}'>${content}</font>`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
