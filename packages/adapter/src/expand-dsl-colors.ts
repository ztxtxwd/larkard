/**
 * DSL config.style.color 中的自定义色别名在 dslToRaw 时展开为渲染器已支持的
 * customBackgroundStyle / textStyle.customColor（对齐飞书 RAW 真机字段）。
 *
 * 别名不限于编辑器默认的 cus-*：业务卡也常用 mm_* 等任意 token 名登记在
 * config.style.color，真机按 registry 键查找；仅认 cus- 前缀会导致背景/描边丢失。
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

/** @deprecated 保留兼容；展开逻辑改为查 registry，不再依赖 cus- 前缀。 */
export function isCustomColorAlias(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('cus-');
}

/** 是否为 config.style.color 中已登记的别名（任意 token 名）。 */
export function isRegisteredColorAlias(
  value: unknown,
  registry: ColorRegistry,
): value is string {
  return typeof value === 'string' && !!value && Object.prototype.hasOwnProperty.call(registry, value);
}

/** column / column_set / interactive_container background_style → customBackgroundStyle */
export function expandBackgroundStyleAlias(
  style: unknown,
  registry: ColorRegistry,
): { light_mode: string; dark_mode: string } | undefined {
  if (!isRegisteredColorAlias(style, registry)) return undefined;
  const entry = registry[style];
  return { light_mode: entry.light_mode, dark_mode: entry.dark_mode };
}

/** textStyle.color 登记别名 → customColor（去掉 color，避免被当成命名色） */
export function expandTextStyleColor(
  textStyle: TextStyle | undefined,
  registry: ColorRegistry,
): TextStyle | undefined {
  if (!textStyle) return textStyle;
  const color = typeof textStyle.color === 'string' ? textStyle.color.trim() : undefined;
  if (!isRegisteredColorAlias(color, registry)) return textStyle;
  const entry = registry[color];
  const { color: _drop, ...rest } = textStyle;
  return {
    ...rest,
    customColor: { lightMode: entry.light_mode, darkMode: entry.dark_mode },
  };
}

/** border_color / background_style 等登记别名 → customBackgroundStyle 形态（供 RAW 渲染器读取） */
export function expandColorAlias(
  style: unknown,
  registry: ColorRegistry,
): { light_mode: string; dark_mode: string } | undefined {
  return expandBackgroundStyleAlias(style, registry);
}

/** 递归展开 markdown / list 子树里的 cus-* 文字色 */
export function expandMarkdownElements(
  elements: CardElement[] | undefined,
  registry: ColorRegistry,
): CardElement[] | undefined {
  if (!Array.isArray(elements)) return elements;
  return elements.map((el) => expandMarkdownNode(el, registry));
}

function expandMarkdownNode(el: CardElement, registry: ColorRegistry): CardElement {
  const property = el.property ? { ...el.property } : undefined;
  if (!property) return el;
  let changed = property !== el.property;

  if (Array.isArray(property.elements)) {
    const next = expandMarkdownElements(property.elements, registry);
    if (next !== property.elements) {
      property.elements = next;
      changed = true;
    }
  }

  // list.items[].elements — parseMarkdown 生成的列表项不走 property.elements
  if (Array.isArray(property.items)) {
    property.items = property.items.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const row = item as Record<string, unknown>;
      if (!Array.isArray(row.elements)) return item;
      const next = expandMarkdownElements(row.elements as CardElement[], registry);
      if (next === row.elements) return item;
      return { ...row, elements: next };
    });
    changed = true;
  }

  if (property.textStyle) {
    const expanded = expandTextStyleColor(property.textStyle, registry);
    if (expanded && expanded !== property.textStyle) {
      property.textStyle = expanded;
      changed = true;
    }
  }

  return changed ? { ...el, property } : el;
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
