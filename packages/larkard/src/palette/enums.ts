/**
 * 枚举-only 颜色字段的回写。
 *
 * 这些字段没有 `config.style.color` 通道（icon.color / text_tag / header.template /
 * number_tag / table header / audio…），只能从官方枚举里挑一个最接近目标色的值。
 *
 * 目标色来自合成后的主题锚点：custom token 已经换成图片配色，枚举字段跟随同一套
 * 锚点，保证整张卡的色相是统一的。
 */

import {
  contrastRatio,
  oklchToRgba,
  parseColor,
  rgbaToOklch,
  type Rgba,
} from './color.js';
import type { ImagePalette } from './extract.js';
import {
  backgroundPair,
  borderPair,
  nearestHeaderTemplate,
  nearestOfficialByChroma,
  nearestTableBackground,
  nearestTableTextColor,
  nearestTextTagColor,
  officialPair,
} from './official.js';
import type { CardColorInventory } from './roles.js';
import type { DerivedTheme } from './synthesize.js';

export interface RecolorAnchors {
  canvas: Rgba;
  panel: Rgba;
  ink: Rgba;
  muted: Rgba;
  accent: Rgba;
  accent2: Rgba;
  onAccent: Rgba;
}

export interface EnumRemapResult {
  card: Record<string, unknown>;
  changed: number;
}

type JsonObject = Record<string, unknown>;

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function neutralHue(image: ImagePalette): number {
  return image.neutral.c < 0.002 ? 0 : image.neutral.h;
}

function fromRole(
  theme: DerivedTheme,
  inventory: CardColorInventory,
  role: string,
): Rgba | undefined {
  const token = inventory.tokens.find((item) => item.role === role);
  const value = token ? theme.colors[token.name]?.light_mode : undefined;
  return value ? parseColor(value) ?? undefined : undefined;
}

/** 主题锚点：优先用卡片自己的 token，没有就按图片生成一套。 */
export function buildAnchors(
  theme: DerivedTheme,
  inventory: CardColorInventory,
  image: ImagePalette,
  polarity: 'light' | 'dark' = image.polarity,
): RecolorAnchors {
  const hue = neutralHue(image);
  const neutralChroma = image.neutral.c < 0.002
    ? 0
    : clamp(image.neutral.c, 0.006, 0.025);

  const canvas = fromRole(theme, inventory, 'canvas')
    ?? oklchFallback(polarity === 'light' ? 0.96 : 0.20, neutralChroma, hue);
  const panel = fromRole(theme, inventory, 'panel')
    ?? oklchFallback(polarity === 'light' ? 0.99 : 0.26, neutralChroma, hue);
  const ink = fromRole(theme, inventory, 'ink')
    ?? oklchFallback(polarity === 'light' ? 0.18 : 0.94, 0.008, hue);
  const muted = fromRole(theme, inventory, 'muted')
    ?? oklchFallback(polarity === 'light' ? 0.46 : 0.72, 0.01, hue);

  const accentToken = fromRole(theme, inventory, 'accent')
    ?? fromRole(theme, inventory, 'button');
  const accentFromImage = image.accents[0]
    ? oklchFallback(
        polarity === 'light' ? 0.55 : 0.70,
        clamp(image.accents[0].c, 0.08, 0.16),
        image.accents[0].h,
      )
    : ink;
  const accent = accentToken ?? accentFromImage;
  const accent2 = fromRole(theme, inventory, 'accent_2') ?? accent;

  const onAccent = fromRole(theme, inventory, 'button_text')
    ?? fromRole(theme, inventory, 'on_surface')
    ?? bestForeground(accent);

  return { canvas, panel, ink, muted, accent, accent2, onAccent };
}

function oklchFallback(l: number, c: number, h: number): Rgba {
  return oklchToRgba({ l, c, h });
}

function bestForeground(background: Rgba): Rgba {
  const black: Rgba = { r: 0, g: 0, b: 0, a: 1 };
  const white: Rgba = { r: 255, g: 255, b: 255, a: 1 };
  return contrastRatio(black, background) >= contrastRatio(white, background) ? black : white;
}

function sourceColor(value: string): Rgba | null {
  const pair = officialPair(value);
  return pair ? parseColor(pair.light) : null;
}

function isGreySource(value: string): boolean {
  const rgba = sourceColor(value);
  return rgba ? rgbaToOklch(rgba).c < 0.04 : false;
}

function remapIcon(value: string, anchors: RecolorAnchors): string {
  const source = sourceColor(value);
  if (!source) return value;
  const sourceGrey = rgbaToOklch(source).c < 0.04;
  const targetGrey = rgbaToOklch(anchors.accent).c < 0.04;
  const grey = sourceGrey || targetGrey;
  const target = grey
    ? (source && rgbaToOklch(source).l < 0.5 ? anchors.ink : anchors.muted)
    : anchors.accent;
  return nearestOfficialByChroma(target, grey);
}

function remapTextTag(value: string, anchors: RecolorAnchors): string {
  const source = sourceColor(value);
  if (!source) return value;
  return nearestTextTagColor(source, anchors.accent);
}

function remapNumberBackground(value: string, anchors: RecolorAnchors): string {
  if (!sourceColor(value)) return value;
  const grey = isGreySource(value) || rgbaToOklch(anchors.accent).c < 0.04;
  return nearestOfficialByChroma(grey ? anchors.panel : anchors.accent, grey);
}

function remapNumberForeground(value: string, anchors: RecolorAnchors): string {
  if (!sourceColor(value)) return value;
  const grey = isGreySource(value) || rgbaToOklch(anchors.accent).c < 0.04;
  return nearestOfficialByChroma(grey ? anchors.ink : anchors.onAccent, grey);
}

function remapTextColor(value: string, anchors: RecolorAnchors): string {
  const source = sourceColor(value);
  if (!source) return value;
  const grey = rgbaToOklch(source).c < 0.04 || rgbaToOklch(anchors.accent).c < 0.04;
  const target = grey
    ? (rgbaToOklch(source).l < 0.5 ? anchors.ink : anchors.muted)
    : anchors.accent;
  return nearestOfficialByChroma(target, grey);
}

function remapFillColor(value: string, anchors: RecolorAnchors): string {
  if (!sourceColor(value)) return value;
  const grey = isGreySource(value) || rgbaToOklch(anchors.accent).c < 0.04;
  return nearestOfficialByChroma(grey ? anchors.ink : anchors.accent, grey);
}

function remapHeaderBackground(value: string, anchors: RecolorAnchors): string {
  if (!sourceColor(value)) return value;
  const grey = isGreySource(value) || rgbaToOklch(anchors.accent).c < 0.04;
  return nearestOfficialByChroma(grey ? anchors.panel : anchors.accent, grey);
}

/** 在 markdown 里按属性名替换颜色值，保留引号与其它属性。 */
function replaceAttrs(
  content: string,
  tagName: string,
  attrs: readonly string[],
  map: (attr: string, value: string) => string,
): string {
  const tagRe = new RegExp(`<${tagName}\\b([^>]*)>`, 'gi');
  return content.replace(tagRe, (full, body: string) => {
    let next = body;
    for (const attr of attrs) {
      const attrRe = new RegExp(`(\\b${attr}\\s*=\\s*)(['"])([^'"]*)\\2`, 'i');
      next = next.replace(attrRe, (match, prefix: string, quote: string, value: string) => {
        const replacement = map(attr, value);
        return replacement === value ? match : `${prefix}${quote}${replacement}${quote}`;
      });
    }
    return `<${tagName}${next}>`;
  });
}

function remapInline(content: string, anchors: RecolorAnchors): { content: string; changed: number } {
  let changed = 0;
  const count = (before: string, after: string): void => {
    if (before !== after) changed += 1;
  };

  let next = content;
  // 理论上 <font> 已经在物化阶段换成 token；这里兜底处理没走到的内容。
  const font = replaceAttrs(next, 'font', ['color'], (_attr, value) => remapTextColor(value, anchors));
  count(next, font);
  next = font;

  const textTag = replaceAttrs(next, 'text_tag', ['color'], (_attr, value) => remapTextTag(value, anchors));
  count(next, textTag);
  next = textTag;

  const numberTag = replaceAttrs(next, 'number_tag', ['background_color', 'font_color'], (attr, value) =>
    attr === 'background_color'
      ? remapNumberBackground(value, anchors)
      : remapNumberForeground(value, anchors));
  count(next, numberTag);
  next = numberTag;

  const audio = replaceAttrs(next, 'audio', ['background_color', 'fill_color'], (attr, value) =>
    attr === 'background_color'
      ? remapHeaderBackground(value, anchors)
      : remapFillColor(value, anchors));
  count(next, audio);
  next = audio;

  return { content: next, changed };
}

function remapHeader(header: JsonObject, anchors: RecolorAnchors): number {
  let changed = 0;
  if (isRecord(header.icon) && typeof header.icon.color === 'string') {
    const after = remapIcon(header.icon.color, anchors);
    if (after !== header.icon.color) {
      header.icon = { ...header.icon, color: after };
      changed += 1;
    }
  }
  if (isRecord(header.ud_icon) && isRecord(header.ud_icon.style)
    && typeof header.ud_icon.style.color === 'string') {
    const after = remapIcon(header.ud_icon.style.color, anchors);
    if (after !== header.ud_icon.style.color) {
      header.ud_icon = {
        ...header.ud_icon,
        style: { ...header.ud_icon.style, color: after },
      };
      changed += 1;
    }
  }
  for (const key of ['title', 'subtitle', 'expanded_title'] as const) {
    const text = header[key];
    if (!isRecord(text)) continue;
    const copy = { ...text };
    if (typeof copy.text_color === 'string') {
      const after = remapTextColor(copy.text_color, anchors);
      if (after !== copy.text_color) {
        copy.text_color = after;
        changed += 1;
      }
    }
    if (isRecord(copy.icon) && typeof copy.icon.color === 'string') {
      const after = remapIcon(copy.icon.color, anchors);
      if (after !== copy.icon.color) {
        copy.icon = { ...copy.icon, color: after };
        changed += 1;
      }
    }
    if (typeof copy.content === 'string') {
      const result = remapInline(copy.content, anchors);
      if (result.changed > 0) {
        copy.content = result.content;
        changed += result.changed;
      }
    }
    header[key] = copy;
  }
  if (typeof header.template === 'string') {
    const next = nearestHeaderTemplate(anchors.accent, anchors.ink);
    if (next !== header.template) {
      header.template = next;
      changed += 1;
    }
  }
  if (Array.isArray(header.text_tag_list)) {
    for (const tag of header.text_tag_list) {
      if (!isRecord(tag) || typeof tag.color !== 'string') continue;
      const next = remapTextTag(tag.color, anchors);
      if (next !== tag.color) {
        tag.color = next;
        changed += 1;
      }
    }
  }
  if (typeof header.background_color === 'string') {
    const next = remapHeaderBackground(header.background_color, anchors);
    if (next !== header.background_color) {
      header.background_color = next;
      changed += 1;
    }
  }
  return changed;
}

/**
 * 回写所有枚举-only 字段。返回新卡片和改动数量。
 */
export function remapEnumColors(card: unknown, anchors: RecolorAnchors): EnumRemapResult {
  if (!isRecord(card)) return { card: {}, changed: 0 };
  const next = structuredClone(card);
  let changed = 0;

  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (!isRecord(value)) return value;

    const node: JsonObject = { ...value };

    if (isRecord(node.icon) && typeof node.icon.color === 'string') {
      const after = remapIcon(node.icon.color, anchors);
      if (after !== node.icon.color) {
        node.icon = { ...node.icon, color: after };
        changed += 1;
      }
    }
    if (isRecord(node.ud_icon) && isRecord(node.ud_icon.style)
      && typeof node.ud_icon.style.color === 'string') {
      const after = remapIcon(node.ud_icon.style.color, anchors);
      if (after !== node.ud_icon.style.color) {
        node.ud_icon = {
          ...node.ud_icon,
          style: { ...node.ud_icon.style, color: after },
        };
        changed += 1;
      }
    }

    if (typeof node.fill_color === 'string') {
      const after = remapFillColor(node.fill_color, anchors);
      if (after !== node.fill_color) {
        node.fill_color = after;
        changed += 1;
      }
    }
    if (typeof node.text_color === 'string') {
      const after = remapTextColor(node.text_color, anchors);
      if (after !== node.text_color) {
        node.text_color = after;
        changed += 1;
      }
    }

    if (typeof node.background_style === 'string') {
      const customTags = node.tag === 'column'
        || node.tag === 'column_set'
        || node.tag === 'interactive_container';
      if (!customTags && backgroundPair(node.background_style)) {
        const after = remapHeaderBackground(node.background_style, anchors);
        if (after !== node.background_style) {
          node.background_style = after;
          changed += 1;
        }
      }
    }

    if (typeof node.border_color === 'string' && node.tag !== 'interactive_container') {
      if (borderPair(node.border_color)) {
        const after = nearestOfficialByChroma(anchors.muted, true);
        if (after !== node.border_color) {
          node.border_color = after;
          changed += 1;
        }
      }
    }

    if (node.tag === 'table' && isRecord(node.header_style)) {
      const headerStyle = { ...node.header_style };
      if (typeof headerStyle.text_color === 'string') {
        const after = nearestTableTextColor(anchors.ink);
        if (after !== headerStyle.text_color) {
          headerStyle.text_color = after;
          changed += 1;
        }
      }
      if (typeof headerStyle.background_style === 'string') {
        const after = nearestTableBackground(anchors.panel, anchors.canvas);
        if (after !== headerStyle.background_style) {
          headerStyle.background_style = after;
          changed += 1;
        }
      }
      node.header_style = headerStyle;
    }

    if (typeof node.content === 'string') {
      const result = remapInline(node.content, anchors);
      if (result.changed > 0) {
        node.content = result.content;
        changed += result.changed;
      }
    }

    if (Array.isArray(node.elements)) node.elements = node.elements.map(walk);
    if (Array.isArray(node.columns)) node.columns = node.columns.map(walk);
    if (Array.isArray(node.items)) node.items = node.items.map(walk);
    if (isRecord(node.property)) {
      const property = { ...node.property };
      if (typeof property.content === 'string') {
        const result = remapInline(property.content, anchors);
        if (result.changed > 0) {
          property.content = result.content;
          changed += result.changed;
        }
      }
      if (Array.isArray(property.elements)) property.elements = property.elements.map(walk);
      if (Array.isArray(property.columns)) property.columns = property.columns.map(walk);
      if (Array.isArray(property.items)) property.items = property.items.map(walk);
      node.property = property;
    }

    if (isRecord(node.header)) {
      const header = { ...node.header };
      changed += remapHeader(header, anchors);
      node.header = header;
    }

    return node;
  };

  if (isRecord(next.body)) {
    const body = { ...next.body };
    for (const key of ['elements', 'columns'] as const) {
      if (Array.isArray(body[key])) body[key] = body[key].map(walk);
    }
    next.body = body;
  }
  if (isRecord(next.header)) {
    const header = { ...next.header };
    changed += remapHeader(header, anchors);
    next.header = header;
  }

  return { card: next, changed };
}
