/**
 * 读取卡片里 `config.style.color` 的自定义色 token，并根据「名字 + 使用位置」
 * 推断每个 token 在卡片里的角色。
 *
 * 设计原则：名字只作为提示，最终以实际使用位置（背景 / 文字 / 描边）为准。
 * 这样既能覆盖 custom-visual 的 `cv_*`，也能覆盖编辑器/存量卡的 `cus-*`
 * 以及任意业务 token 名。
 */

import {
  contrastRatio,
  formatRgba,
  parseColor,
  rgbaToOklch,
  type Rgba,
} from './color.js';

export type TokenRole =
  | 'canvas'
  | 'body'
  | 'panel'
  | 'highlight'
  | 'icon_surface'
  | 'ink'
  | 'muted'
  | 'accent_text'
  | 'on_surface'
  | 'accent'
  | 'accent_2'
  | 'button'
  | 'button_text'
  | 'border'
  | 'unknown';

export interface TokenUsage {
  /** 作为 background_style 使用时的嵌套深度；0 通常就是 root shell。 */
  backgrounds: number[];
  /** 作为文字色使用时的父级背景 token。 */
  texts: Array<{ background?: string }>;
  /** 作为 border_color 使用时的深度。 */
  borders: number[];
}

export interface CardColorToken {
  name: string;
  light_mode: string;
  dark_mode: string;
  light: Rgba;
  dark: Rgba;
  role: TokenRole;
  usage: TokenUsage;
  /** 同色 token 的等价类编号；同组换色后仍保持同色。 */
  group: number;
}

export interface CardColorInventory {
  tokens: CardColorToken[];
  byName: Map<string, CardColorToken>;
  /** 整卡最外层的底色 token；为空时合成阶段会退化到第一个表面色。 */
  canvasName: string | null;
  groups: string[][];
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): JsonRecord | null {
  return isRecord(value) ? value : null;
}

function emptyUsage(): TokenUsage {
  return { backgrounds: [], texts: [], borders: [] };
}

function readThemeString(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  return undefined;
}

function readPair(raw: unknown): { light: string; dark: string } | null {
  if (typeof raw === 'string') {
    const value = raw.trim();
    return value ? { light: value, dark: value } : null;
  }
  const record = asRecord(raw);
  if (!record) return null;
  const light = readThemeString(record.light_mode) ?? readThemeString(record.lightMode);
  const dark = readThemeString(record.dark_mode) ?? readThemeString(record.darkMode);
  if (!light && !dark) return null;
  return { light: light ?? dark!, dark: dark ?? light! };
}

function compareName(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function ensureUsage(map: Map<string, TokenUsage>, name: string): TokenUsage {
  let usage = map.get(name);
  if (!usage) {
    usage = emptyUsage();
    map.set(name, usage);
  }
  return usage;
}

/** 遍历 body/header，记录每个 token 被用作背景、文字色、描边的位置。 */
function collectUsage(
  root: unknown,
  names: Set<string>,
): Map<string, TokenUsage> {
  const usage = new Map<string, TokenUsage>();

  const walkChildren = (
    value: unknown,
    depth: number,
    background: string | undefined,
  ): void => {
    if (Array.isArray(value)) {
      for (const item of value) walkNode(item, depth, background);
    }
  };

  const walkNode = (
    value: unknown,
    depth: number,
    background: string | undefined,
  ): void => {
    if (Array.isArray(value)) {
      walkChildren(value, depth, background);
      return;
    }
    const node = asRecord(value);
    if (!node) return;
    const property = asRecord(node.property);

    let current = background;
    const backgroundStyle = node.background_style
      ?? property?.background_style
      ?? node.background_color
      ?? property?.background_color;
    if (typeof backgroundStyle === 'string' && names.has(backgroundStyle)) {
      ensureUsage(usage, backgroundStyle).backgrounds.push(depth);
      current = backgroundStyle;
    }

    const borderColor = node.border_color
      ?? property?.border_color
      ?? (isRecord(node.border) && typeof node.border.color === 'string' ? node.border.color : undefined);
    if (typeof borderColor === 'string' && names.has(borderColor)) {
      ensureUsage(usage, borderColor).borders.push(depth);
    }

    const fontColor = typeof node.font_color === 'string' ? node.font_color
      : typeof property?.font_color === 'string' ? property.font_color : undefined;
    if (fontColor && names.has(fontColor)) {
      ensureUsage(usage, fontColor).texts.push({ background: current });
    }

    for (const textStyle of [
      asRecord(node.textStyle),
      asRecord(node.text_style),
      asRecord(property?.textStyle),
      asRecord(property?.text_style),
    ]) {
      const textColor = textStyle && typeof textStyle.color === 'string' ? textStyle.color : undefined;
      if (textColor && names.has(textColor)) {
        ensureUsage(usage, textColor).texts.push({ background: current });
      }
    }

    const content = typeof node.content === 'string'
      ? node.content
      : typeof property?.content === 'string' ? property.content : undefined;
    if (content) {
      for (const match of content.matchAll(/<font\s+color\s*=\s*['"]([^'"]+)['"]/gi)) {
        const name = match[1];
        if (name && names.has(name)) {
          ensureUsage(usage, name).texts.push({ background: current });
        }
      }
    }

    // 子节点：elements / columns / items / property.elements / property.items。
    walkChildren(node.elements, depth + 1, current);
    walkChildren(node.columns, depth + 1, current);
    walkChildren(node.items, depth + 1, current);
    if (property) {
      walkChildren(property.elements, depth + 1, current);
      walkChildren(property.columns, depth + 1, current);
      walkChildren(property.items, depth + 1, current);
    }
  };

  const card = asRecord(root);
  const body = card ? asRecord(card.body) : null;
  if (body) {
    // body 自己的 elements 是顶层；root shell 记 depth 0。
    const bodyProperty = asRecord(body.property);
    const bodyBackground = body.background_style ?? bodyProperty?.background_style;
    let background: string | undefined;
    if (typeof bodyBackground === 'string' && names.has(bodyBackground)) {
      ensureUsage(usage, bodyBackground).backgrounds.push(0);
      background = bodyBackground;
    }
    walkChildren(body.elements, 0, background);
    walkChildren(body.columns, 0, background);
  }
  const header = card ? asRecord(card.header) : null;
  if (header) walkNode(header, 0, undefined);

  return usage;
}

/** 去掉 token 前缀，得到用于角色判断的短名。 */
export function normalizeTokenName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/^cv[_-]/, '')
    .replace(/^cus[_-]/, '')
    .replace(/^mm[_-]/, '')
    .replace(/^mk[_-]/, '')
    .replace(/-/g, '_');
}

const EXACT_ROLE: Record<string, TokenRole> = {
  canvas: 'canvas',
  body: 'body',
  panel: 'panel',
  surface: 'panel',
  ink: 'ink',
  text: 'ink',
  muted: 'muted',
  accent: 'accent',
  accent_2: 'accent_2',
  button: 'button',
  button_text: 'button_text',
  button_secondary: 'panel',
  button_secondary_text: 'on_surface',
  border: 'border',
  icon_surface: 'icon_surface',
  sage: 'highlight',
  blush: 'highlight',
};

/**
 * 名字提示。返回 `text_or_muted` 表示需要结合对比度再定 ink/muted。
 */
function nameRole(name: string): TokenRole | 'text_or_muted' | null {
  const short = normalizeTokenName(name);
  if (!short) return null;
  if (short.startsWith('on_')) return 'on_surface';
  if (short.startsWith('highlight_')) return 'highlight';
  if (/^column_\d+$/.test(short)) return 'highlight';
  if (/^bg_\d+$/.test(short)) return 'panel';
  if (/^border_\d+$/.test(short)) return 'border';
  if (/^accent_text_\d+$/.test(short)) return 'accent_text';
  if (/^ink_\d+$/.test(short)) return 'ink';
  if (/^muted_\d+$/.test(short)) return 'muted';
  if (/^button_\d+$/.test(short)) return 'button';
  if (/^button_text_\d+$/.test(short)) return 'button_text';
  if (/^text_\d+$/.test(short)) return 'text_or_muted';
  if (short === 'secondary') return 'text_or_muted';
  return EXACT_ROLE[short] ?? null;
}

function usageContrast(name: string, tokens: Map<string, CardColorToken>, usage: TokenUsage): number {
  const token = tokens.get(name);
  if (!token) return 0;
  const backgroundName = usage.texts[0]?.background;
  const background = backgroundName ? tokens.get(backgroundName) : undefined;
  if (!background) return 0;
  return contrastRatio(token.light, background.light);
}

/**
 * 读取一张卡的色板并推断角色。没有 `config.style.color` 时返回空 inventory。
 */
export function readCardColorInventory(card: unknown): CardColorInventory {
  const cardRecord = asRecord(card);
  const config = cardRecord ? asRecord(cardRecord.config) : null;
  const style = config ? asRecord(config.style) : null;
  const color = style ? asRecord(style.color) : null;

  const names = new Set<string>();
  const pairs = new Map<string, { light: string; dark: string }>();
  const parsed = new Map<string, { light: Rgba; dark: Rgba }>();

  if (color) {
    for (const [name, raw] of Object.entries(color)) {
      const pair = readPair(raw);
      if (!pair) continue;
      const light = parseColor(pair.light) ?? parseColor(pair.dark);
      const dark = parseColor(pair.dark) ?? parseColor(pair.light);
      if (!light || !dark) continue;
      names.add(name);
      pairs.set(name, pair);
      parsed.set(name, { light, dark });
    }
  }

  if (names.size === 0) {
    return { tokens: [], byName: new Map(), canvasName: null, groups: [] };
  }

  const usage = collectUsage(card, names);
  const tokens = new Map<string, CardColorToken>();

  for (const name of names) {
    const pair = pairs.get(name)!;
    const value = parsed.get(name)!;
    const token: CardColorToken = {
      name,
      light_mode: pair.light,
      dark_mode: pair.dark,
      light: value.light,
      dark: value.dark,
      role: 'unknown',
      usage: usage.get(name) ?? emptyUsage(),
      group: -1,
    };
    tokens.set(name, token);
  }

  // 先按名字给提示，再按使用位置纠偏。
  for (const token of tokens.values()) {
    const hint = nameRole(token.name);
    token.role = hint === 'text_or_muted' ? 'muted' : (hint ?? 'unknown');
  }

  // text_or_muted：按与父背景的对比度排序，最高的是 ink，其余 muted。
  const textCandidates = [...tokens.values()]
    .filter((token) => nameRole(token.name) === 'text_or_muted')
    .map((token) => ({ token, contrast: usageContrast(token.name, tokens, token.usage) }))
    .sort((a, b) => b.contrast - a.contrast || compareName(a.token.name, b.token.name));
  for (let index = 0; index < textCandidates.length; index += 1) {
    const item = textCandidates[index]!;
    item.token.role = index === 0 ? 'ink' : 'muted';
  }

  // 名字没给出角色时，按实际用途推断。
  for (const token of tokens.values()) {
    if (token.role !== 'unknown') continue;
    const { backgrounds, texts, borders } = token.usage;
    if (backgrounds.length > 0) {
      // 深度 0 且还没有 canvas 的候选，先标记 canvas；后面的 canvas 选择会再确认。
      token.role = backgrounds.includes(0)
        ? 'canvas'
        : rgbaToOklch(token.light).c >= 0.06
          ? 'highlight'
          : 'panel';
    } else if (texts.length > 0) {
      token.role = usageContrast(token.name, tokens, token.usage) >= 4.5 ? 'ink' : 'muted';
    } else if (borders.length > 0) {
      token.role = 'border';
    }
  }

  // 名字和用途冲突时纠偏：只当文字用的“背景色”实际是前景色；只当背景用的“文字色”实际是表面色。
  for (const token of tokens.values()) {
    const isSurface = token.role === 'canvas'
      || token.role === 'body'
      || token.role === 'panel'
      || token.role === 'highlight'
      || token.role === 'icon_surface'
      || token.role === 'accent'
      || token.role === 'accent_2'
      || token.role === 'button';
    const isForeground = token.role === 'ink'
      || token.role === 'muted'
      || token.role === 'accent_text'
      || token.role === 'on_surface'
      || token.role === 'button_text';

    if (isSurface && token.usage.texts.length > 0 && token.usage.backgrounds.length === 0) {
      token.role = 'on_surface';
    } else if (isForeground && token.usage.backgrounds.length > 0 && token.usage.texts.length === 0) {
      token.role = token.usage.backgrounds.includes(0) ? 'canvas' : 'panel';
    }
  }

  // 仍然 unknown 的 token：保持原色，不参与换色。
  // 只有在多个 token 争 canvas 时才需要挑一个；优先名字里就是 canvas 的。
  let canvasName: string | null = null;
  const namedCanvas = [...tokens.values()].find((token) => normalizeTokenName(token.name) === 'canvas');
  if (namedCanvas) {
    canvasName = namedCanvas.name;
  } else {
    const depthZero = [...tokens.values()]
      .filter((token) => token.usage.backgrounds.includes(0))
      .sort((a, b) => compareName(a.name, b.name));
    canvasName = depthZero[0]?.name ?? null;
  }
  if (!canvasName) {
    const body = [...tokens.values()].find((token) => token.role === 'body');
    canvasName = body?.name ?? null;
  }
  if (!canvasName) {
    const firstSurface = [...tokens.values()]
      .find((token) => token.role === 'canvas'
        || token.role === 'body'
        || token.role === 'panel'
        || token.role === 'highlight');
    canvasName = firstSurface?.name ?? null;
  }

  // 选中的 canvas 不一定叫 `canvas`（存量卡常是 cus-bg-0），把它的角色补正；
  // 其余通用 bg-N 按“相对 canvas 是否有明显色阶/彩度”分成高亮面或普通面板。
  if (canvasName) {
    const canvasToken = tokens.get(canvasName);
    if (canvasToken
      && (canvasToken.role === 'panel'
        || canvasToken.role === 'body'
        || canvasToken.role === 'highlight')) {
      canvasToken.role = 'canvas';
    }
    for (const token of tokens.values()) {
      if (token.name === canvasName || token.role !== 'panel') continue;
      if (!/^bg_\d+$/.test(normalizeTokenName(token.name))) continue;
      const chromatic = rgbaToOklch(token.light).c >= 0.06;
      const contrast = canvasToken
        ? contrastRatio(token.light, canvasToken.light)
        : 1;
      if (chromatic || contrast >= 3) token.role = 'highlight';
    }
  }

  // 等价类：解析后的颜色完全相同才归为一组。
  const groupKeys: string[] = [];
  const groupIndex = new Map<string, number>();
  for (const token of tokens.values()) {
    const key = `${formatRgba(token.light)}|${formatRgba(token.dark)}`;
    let index = groupIndex.get(key);
    if (index === undefined) {
      index = groupKeys.length;
      groupIndex.set(key, index);
      groupKeys.push(key);
    }
    token.group = index;
  }

  const groups: string[][] = groupKeys.map(() => []);
  for (const token of tokens.values()) groups[token.group]!.push(token.name);

  return {
    tokens: [...tokens.values()],
    byName: tokens,
    canvasName,
    groups,
  };
}
