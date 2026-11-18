/**
 * 换色前的物化：
 *
 * 1. 把「支持自定义色、但当前写的是官方枚举/字面量」的字段改写成 cus-* token；
 * 2. 把按钮转换成 interactive_container（按钮本身没有自定义颜色字段），
 *    并用 cus-button-* 承载它的底色/文字色；
 * 3. 顺手标记卡片里是否还有「只能走官方枚举」的颜色字段，交给 enum 回写阶段。
 *
 * 物化只改颜色承载方式，不改视觉语义；目标色仍由后续合成算法决定。
 */

import { parseColor, rgbaToOklch } from './color.js';
import {
  backgroundPair,
  borderPair,
  officialPair,
  textPair,
  type OfficialPair,
} from './official.js';

type JsonObject = Record<string, unknown>;

export interface MaterializeResult {
  card: JsonObject;
  addedTokens: string[];
  convertedButtons: number;
  /** 卡片里还有只能映射到官方枚举的颜色字段。 */
  hasEnumColors: boolean;
  warnings: string[];
}

type ColorMap = Record<string, unknown>;

/** 支持 custom_background_style / background_style 引用 config.style.color 的容器。 */
const CUSTOM_BG_TAGS = new Set(['column', 'column_set', 'interactive_container']);

/** 没有显式字色时的正文默认色：N900 / 深色模式 grey-900。 */
const DEFAULT_TEXT_PAIR: OfficialPair = { light: '#1F2329', dark: '#EBEBEB' };

const BUTTON_SIZES: Record<string, { height: number; padding: number; text: string }> = {
  tiny: { height: 24, padding: 10, text: 'notation' },
  small: { height: 28, padding: 12, text: 'notation' },
  medium: { height: 32, padding: 16, text: 'normal' },
  large: { height: 40, padding: 20, text: 'large' },
};

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRegistered(colors: ColorMap, value: unknown): boolean {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(colors, value);
}

class TokenAllocator {
  private readonly used: Set<string>;

  constructor(colors: ColorMap) {
    this.used = new Set(Object.keys(colors));
  }

  next(prefix: string): string {
    for (let index = 1; ; index += 1) {
      const name = `${prefix}-${index}`;
      if (!this.used.has(name)) {
        this.used.add(name);
        return name;
      }
    }
  }
}

function addToken(colors: ColorMap, name: string, pair: OfficialPair): void {
  colors[name] = { light_mode: pair.light, dark_mode: pair.dark };
}

/**
 * 存量 custom token 里偶尔会直接写官方色名（`light_mode: "blue"`）。
 * 先归一成 hex/rgba，后面的 inventory / 合成才能读到。
 */
function normalizeExistingColors(colors: ColorMap): void {
  for (const [name, value] of Object.entries(colors)) {
    if (typeof value === 'string') {
      const pair = officialPair(value);
      if (pair) colors[name] = { light_mode: pair.light, dark_mode: pair.dark };
      continue;
    }
    if (!isRecord(value)) continue;
    const light = typeof value.light_mode === 'string' ? value.light_mode
      : typeof value.lightMode === 'string' ? value.lightMode : undefined;
    const dark = typeof value.dark_mode === 'string' ? value.dark_mode
      : typeof value.darkMode === 'string' ? value.darkMode : undefined;
    const lightPair = light ? officialPair(light) : null;
    const darkPair = dark ? officialPair(dark) : null;
    const nextLight = light && parseColor(light) ? light : lightPair?.light;
    const nextDark = dark && parseColor(dark) ? dark : darkPair?.dark;
    if (nextLight && nextDark) {
      if (nextLight !== light || nextDark !== dark) {
        colors[name] = { light_mode: nextLight, dark_mode: nextDark };
      }
    }
  }
}

/** 飞书存储形态的 {light_mode,dark_mode} → 颜色对。 */
function customPair(value: unknown): OfficialPair | null {
  if (!isRecord(value)) return null;
  const light = typeof value.light_mode === 'string' ? value.light_mode
    : typeof value.lightMode === 'string' ? value.lightMode : undefined;
  const dark = typeof value.dark_mode === 'string' ? value.dark_mode
    : typeof value.darkMode === 'string' ? value.darkMode : undefined;
  if (!light && !dark) return null;
  return { light: light ?? dark!, dark: dark ?? light! };
}

/** 文字 token 的名字直接编码角色，避免后面的“按对比度猜 ink/muted”把彩色文字压成正文色。 */
function addTextToken(
  allocator: TokenAllocator,
  colors: ColorMap,
  pair: OfficialPair,
): string {
  const rgba = parseColor(pair.light);
  const oklch = rgba ? rgbaToOklch(rgba) : null;
  const chroma = oklch?.c ?? 0;
  const lightness = oklch?.l ?? 0.5;
  const prefix = chroma >= 0.05
    ? 'cus-accent-text'
    : lightness < 0.35 || lightness > 0.75
      ? 'cus-ink'
      : 'cus-muted';
  const name = allocator.next(prefix);
  addToken(colors, name, pair);
  return name;
}

function plainText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(plainText).join('');
  if (!isRecord(value)) return '';
  if (typeof value.content === 'string') return value.content;
  if (Array.isArray(value.elements)) return plainText(value.elements);
  return '';
}

function escapeMarkdownText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function convertButton(
  button: JsonObject,
  inForm: boolean,
  allocator: TokenAllocator,
  colors: ColorMap,
): JsonObject | null {
  if (inForm || button.form_action_type !== undefined || button.name !== undefined) return null;
  const type = typeof button.type === 'string' ? button.type : 'default';
  // danger 系列保留语义色，不转成图片配色。form 内的按钮也不能转（会丢提交语义）。
  if (type.startsWith('danger')) return null;

  const isDefault = type === 'default';
  const textFamily = type === 'text' || type === 'primary_text';
  const background = textFamily ? null : isDefault ? backgroundPair('grey-50') : officialPair('blue');
  const textColor = textFamily
    ? (type === 'primary_text' ? officialPair('blue') : textPair('grey-900'))
    : isDefault ? textPair('grey-900') : { light: '#FFFFFF', dark: '#FFFFFF' };
  const border = isDefault ? borderPair('grey') : null;
  if ((!textFamily && !background) || !textColor) return null;

  let backgroundName: string | undefined;
  if (background) {
    backgroundName = allocator.next('cus-button');
    addToken(colors, backgroundName, background);
  }
  // 文字按钮保留“无底色”外观：用强调文字 token，而不是硬塞一个填充底色。
  const textName = textFamily
    ? addTextToken(allocator, colors, textColor)
    : allocator.next('cus-button-text');
  if (!textFamily) addToken(colors, textName, textColor);

  let borderName: string | undefined;
  if (border) {
    borderName = allocator.next('cus-border');
    addToken(colors, borderName, border);
  }

  const sizeKey = typeof button.size === 'string' ? button.size : 'medium';
  const size = BUTTON_SIZES[sizeKey] ?? BUTTON_SIZES.medium!;
  const label = plainText(button.text).trim();
  const content = `<font color='${textName}'>${escapeMarkdownText(label)}</font>`;
  const markdown: JsonObject = {
    tag: 'markdown',
    content,
    text_align: 'center',
    text_size: size.text,
  };
  if (isRecord(button.icon)) {
    // 图标跟随按钮文字色，不保留原按钮图标色：否则换成图片强调色后图标会和
    // 底色撞色。standard_icon 的 color 拿掉后由父级 markdown 文字色继承。
    const icon = { ...button.icon };
    delete icon.color;
    markdown.icon = icon;
  }

  const width = typeof button.width === 'string'
    ? button.width
    : textFamily ? 'fill' : 'auto';

  const container: JsonObject = {
    tag: 'interactive_container',
    elements: [markdown],
    width,
    height: `${size.height}px`,
    padding: `0px ${size.padding}px 0px ${size.padding}px`,
    corner_radius: '6px',
    horizontal_align: 'center',
    vertical_align: 'center',
    ...(backgroundName ? { background_style: backgroundName } : {}),
    has_border: Boolean(borderName),
    ...(borderName ? { border_color: borderName } : {}),
  };

  for (const key of [
    'behaviors',
    'hover_tips',
    'disabled_tips',
    'confirm',
    'margin',
    'element_id',
  ]) {
    if (button[key] !== undefined) container[key] = button[key];
  }
  if (button.disabled === true) container.disabled = true;

  return container;
}

/** 把一段 markdown 里的 <font color> 物化成 token，并返回是否还有枚举色标签。 */
function materializeMarkdownColors(
  content: string,
  allocator: TokenAllocator,
  colors: ColorMap,
): { content: string; hasEnumColors: boolean } {
  let hasEnumColors = /<(?:text_tag|number_tag|audio)\b[^>]*\b(?:color|background_color|font_color|fill_color)\s*=/i.test(content);

  const next = content.replace(
    /<font\s+color\s*=\s*(['"])([^'"]+)\1\s*>/gi,
    (match, quote: string, raw: string) => {
      if (isRegistered(colors, raw)) return match;
      const pair = textPair(raw);
      if (!pair) return match;
      const token = addTextToken(allocator, colors, pair);
      return `<font color=${quote}${token}${quote}>`;
    },
  );

  return { content: next, hasEnumColors };
}

/**
 * 在克隆上物化颜色与按钮。返回的 `card` 可以直接交给 `readCardColorInventory`。
 */
export function materializeCardColors(card: unknown): MaterializeResult {
  const addedTokens: string[] = [];
  const warnings: string[] = [];
  let convertedButtons = 0;
  let hasEnumColors = false;

  if (!isRecord(card)) {
    return { card: {}, addedTokens, convertedButtons, hasEnumColors, warnings: ['卡片不是对象'] };
  }

  const next = structuredClone(card);
  const config = isRecord(next.config) ? next.config : (next.config = {});
  const style = isRecord(config.style) ? config.style : (config.style = {});
  const colors = isRecord(style.color) ? style.color : (style.color = {});
  normalizeExistingColors(colors);
  const allocator = new TokenAllocator(colors);

  const addBackground = (value: string): string | null => {
    const pair = backgroundPair(value);
    if (!pair) return null;
    const name = allocator.next('cus-bg');
    addToken(colors, name, pair);
    return name;
  };

  const addBorder = (value: string): string | null => {
    const pair = borderPair(value);
    if (!pair) return null;
    const name = allocator.next('cus-border');
    addToken(colors, name, pair);
    return name;
  };

  const addText = (value: string): string | null => {
    const pair = textPair(value);
    if (!pair) return null;
    return addTextToken(allocator, colors, pair);
  };

  const processTextObject = (value: unknown): unknown => {
    if (!isRecord(value)) return value;
    const text = { ...value };
    if (typeof text.text_color === 'string') hasEnumColors = true;
    if (typeof text.content === 'string') {
      const result = materializeMarkdownColors(text.content, allocator, colors);
      if (result.content !== text.content) text.content = result.content;
      if (result.hasEnumColors) hasEnumColors = true;
    }
    if (isRecord(text.icon) && typeof text.icon.color === 'string') hasEnumColors = true;
    return text;
  };

  const walkNode = (
    value: unknown,
    inForm: boolean,
    inheritedBackground: string | undefined,
  ): unknown => {
    if (Array.isArray(value)) {
      return value.map((item) => walkNode(item, inForm, inheritedBackground));
    }
    if (!isRecord(value)) return value;

    let node: JsonObject = { ...value };
    const tag = typeof node.tag === 'string' ? node.tag : '';
    const nodeInForm = inForm || tag === 'form';
    let nodeBackground = inheritedBackground;

    if (tag === 'button') {
      const converted = convertButton(node, inForm, allocator, colors);
      if (converted) {
        convertedButtons += 1;
        const markdown = Array.isArray(converted.elements) ? converted.elements[0] : undefined;
        if (isRecord(markdown) && isRecord(markdown.icon)
          && typeof markdown.icon.color === 'string') {
          hasEnumColors = true;
        }
        return converted;
      }
    }

    // 飞书回读形态：custom_background_style / custom_border_color 先收回 token。
    const customBackground = customPair(node.custom_background_style);
    if (customBackground) {
      const name = allocator.next('cus-bg');
      addToken(colors, name, customBackground);
      node.background_style = name;
      delete node.custom_background_style;
      nodeBackground = name;
    }
    if (tag === 'interactive_container') {
      const customBorder = customPair(node.custom_border_color);
      if (customBorder) {
        const name = allocator.next('cus-border');
        addToken(colors, name, customBorder);
        node.border_color = name;
        delete node.custom_border_color;
      }
    }

    // 支持自定义色的背景字段 → cus-bg token。
    if (typeof node.background_style === 'string' && CUSTOM_BG_TAGS.has(tag)) {
      const raw = node.background_style;
      if (!isRegistered(colors, raw)) {
        const token = addBackground(raw);
        if (token) {
          node.background_style = token;
          nodeBackground = token;
        }
      } else {
        nodeBackground = raw;
      }
    } else if (typeof node.background_style === 'string' && tag) {
      // audio 等只支持枚举的背景字段：标记给 enum 回写。
      if (!isRegistered(colors, node.background_style) && backgroundPair(node.background_style)) {
        hasEnumColors = true;
      }
    }

    if (typeof node.border_color === 'string') {
      if (tag === 'interactive_container') {
        if (!isRegistered(colors, node.border_color)) {
          const token = addBorder(node.border_color);
          if (token) node.border_color = token;
        }
      } else if (borderPair(node.border_color)) {
        hasEnumColors = true;
      }
    }

    if (tag === 'collapsible_panel') {
      if (typeof node.background_color === 'string') {
        const raw = node.background_color;
        if (!isRegistered(colors, raw)) {
          const token = addBackground(raw);
          if (token) {
            node.background_color = token;
            nodeBackground = token;
          }
        } else {
          nodeBackground = raw;
        }
      }
      if (isRecord(node.border) && typeof node.border.color === 'string') {
        const border = { ...node.border };
        const raw = border.color as string;
        if (!isRegistered(colors, raw)) {
          const token = addBorder(raw);
          if (token) border.color = token;
        }
        node.border = border;
      }
    }

    if (typeof node.font_color === 'string') {
      const raw = node.font_color;
      if (!isRegistered(colors, raw)) {
        const token = addText(raw);
        if (token) node.font_color = token;
      }
    }

    const textStyle = isRecord(node.textStyle)
      ? { ...node.textStyle }
      : isRecord(node.text_style) ? { ...node.text_style } : null;
    if (textStyle) {
      const customText = customPair(textStyle.customColor ?? textStyle.custom_color);
      if (customText && typeof textStyle.color !== 'string') {
        const name = addTextToken(allocator, colors, customText);
        textStyle.color = name;
        delete textStyle.customColor;
        delete textStyle.custom_color;
      } else if (typeof textStyle.color === 'string') {
        const raw = textStyle.color;
        if (!isRegistered(colors, raw)) {
          const token = addText(raw);
          if (token) textStyle.color = token;
        }
      }
    }
    if (textStyle) {
      if (isRecord(node.textStyle)) node.textStyle = textStyle;
      else if (isRecord(node.text_style)) node.text_style = textStyle;
    }

    // 枚举-only 字段：只登记“还存在枚举色”，具体回写由 enums.ts 统一做。
    if (isRecord(node.icon) && typeof node.icon.color === 'string') hasEnumColors = true;
    if (isRecord(node.ud_icon)) {
      const ud = node.ud_icon;
      if (isRecord(ud.style) && typeof ud.style.color === 'string') hasEnumColors = true;
    }
    if (typeof node.fill_color === 'string') hasEnumColors = true;
    if (typeof node.text_color === 'string') hasEnumColors = true;

    if (tag === 'table' && isRecord(node.header_style)) {
      if (typeof node.header_style.text_color === 'string') hasEnumColors = true;
      if (typeof node.header_style.background_style === 'string') hasEnumColors = true;
    }

    if (typeof node.content === 'string') {
      const result = materializeMarkdownColors(node.content, allocator, colors);
      if (result.content !== node.content) node.content = result.content;
      if (result.hasEnumColors) hasEnumColors = true;
    }

    // 有底色的容器里，没显式字色的 markdown 补一个 ink token：图片把底色换深/换浅后，
    // 默认字色不会自动反转，必须显式参与对比度修复。内容里已有 <font> 时不强包，
    // 避免破坏局部字色。
    if (tag === 'markdown'
      && !node.font_color
      && nodeBackground
      && typeof node.content === 'string'
      && node.content.trim().length > 0
      // 这些内联标签自带颜色/语义，整段包 <font> 会改坏它们或渲染出标签原文。
      && !/<(?:font|text_tag|number_tag|audio|person|at|link)\b/i.test(node.content)) {
      node.font_color = addTextToken(allocator, colors, DEFAULT_TEXT_PAIR);
    }

    if (isRecord(node.header)) {
      const header = { ...node.header };
      for (const key of ['title', 'expanded_title', 'subtitle'] as const) {
        if (header[key] !== undefined) header[key] = processTextObject(header[key]);
      }
      if (typeof header.background_color === 'string') hasEnumColors = true;
      if (isRecord(header.icon) && typeof header.icon.color === 'string') hasEnumColors = true;
      node.header = header;
    }

    // 递归子节点。
    if (Array.isArray(node.elements)) node.elements = node.elements.map((item) => walkNode(item, nodeInForm, nodeBackground));
    if (Array.isArray(node.columns)) node.columns = node.columns.map((item) => walkNode(item, nodeInForm, nodeBackground));
    if (Array.isArray(node.items)) node.items = node.items.map((item) => walkNode(item, nodeInForm, nodeBackground));

    if (isRecord(node.property)) {
      const property = { ...node.property };
      const propertyTextStyle = isRecord(property.textStyle)
        ? { ...property.textStyle }
        : isRecord(property.text_style) ? { ...property.text_style } : null;
      if (propertyTextStyle && typeof propertyTextStyle.color === 'string') {
        const raw = propertyTextStyle.color;
        if (!isRegistered(colors, raw)) {
          const token = addText(raw);
          if (token) propertyTextStyle.color = token;
        }
      }
      if (propertyTextStyle) {
        if (isRecord(property.textStyle)) property.textStyle = propertyTextStyle;
        else if (isRecord(property.text_style)) property.text_style = propertyTextStyle;
      }
      if (typeof property.content === 'string') {
        const result = materializeMarkdownColors(property.content, allocator, colors);
        if (result.content !== property.content) property.content = result.content;
        if (result.hasEnumColors) hasEnumColors = true;
      }
      if (Array.isArray(property.elements)) {
        property.elements = property.elements.map((item) => walkNode(item, nodeInForm, nodeBackground));
      }
      if (Array.isArray(property.columns)) {
        property.columns = property.columns.map((item) => walkNode(item, nodeInForm, nodeBackground));
      }
      if (Array.isArray(property.items)) {
        property.items = property.items.map((item) => walkNode(item, nodeInForm, nodeBackground));
      }
      node.property = property;
    }

    return node;
  };

  if (isRecord(next.body)) {
    const body = { ...next.body };
    for (const key of ['elements', 'columns'] as const) {
      if (Array.isArray(body[key])) body[key] = body[key].map((item) => walkNode(item, false, undefined));
    }
    next.body = body;
  }

  if (isRecord(next.header)) {
    const header = walkNode(next.header, false, undefined);
    if (isRecord(header)) {
      for (const key of ['title', 'subtitle'] as const) {
        if (header[key] !== undefined) header[key] = processTextObject(header[key]);
      }
      next.header = header;
      if (typeof header.template === 'string') hasEnumColors = true;
      if (Array.isArray(header.text_tag_list)) {
        for (const tag of header.text_tag_list) {
          if (isRecord(tag) && typeof tag.color === 'string') hasEnumColors = true;
        }
      }
      if (typeof header.background_color === 'string') hasEnumColors = true;
    }
  }

  // 没有任何 token 的新增时，不要把空的 config.style.color 留给调用方。
  const originalHasColor = isRecord(card.config) && isRecord(card.config.style)
    && isRecord(card.config.style.color);
  if (!originalHasColor && Object.keys(colors).length === 0) {
    delete style.color;
    if (Object.keys(style).length === 0) delete config.style;
    if (Object.keys(config).length === 0) delete next.config;
  }

  // addedTokens 以最终 config.style.color 的差集为准：按钮转换和普通物化都走这一份。
  const originalColors = isRecord(card.config) && isRecord(card.config.style)
    && isRecord(card.config.style.color) ? card.config.style.color : {};
  const finalAdded = Object.keys(colors).filter((name) => !Object.prototype.hasOwnProperty.call(originalColors, name));

  return {
    card: next,
    addedTokens: finalAdded,
    convertedButtons,
    hasEnumColors,
    warnings,
  };
}
