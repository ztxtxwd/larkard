import { wrapMarkdownContentWithFontColor } from './expand-dsl-colors.js';

/**
 * 飞书存储卡片时会将 config.style.color 的 cus-N 展开为 custom_background_style（#RRGGBBAA），
 * 并丢弃 config.style 与 markdown 内联字色。回读底稿后须 normalize，否则 modify 再发会丢色。
 * 公开 DSL 用 content 内 <font color='cus-N'> 表达字色（飞书发送接口不接受 markdown.font_color）。
 *
 * 原则：RAW↔DSL 双向无损（见 AGENTS.md）。显式字色/背景色只做 alias 登记，不得合并进语义 token。
 */

export type CustomColorEntry = { light_mode: string; dark_mode: string };

export type ColorRegistry = {
  entries: Record<string, CustomColorEntry>;
  /** 背景/边框等同色复用 cus-bg-N，与文字 cus-text-N 分表，避免串 alias */
  bgKeyToAlias: Map<string, string>;
  textKeyToAlias: Map<string, string>;
  bgSeq: number;
  textSeq: number;
};

export function createColorRegistry(): ColorRegistry {
  return { entries: {}, bgKeyToAlias: new Map(), textKeyToAlias: new Map(), bgSeq: 0, textSeq: 0 };
}

export function colorEntryKey(entry: CustomColorEntry): string {
  return `${entry.light_mode}|${entry.dark_mode}`;
}

export function registerColorEntry(
  registry: ColorRegistry,
  entry: CustomColorEntry,
  prefix: 'cus-bg' | 'cus-text',
): string {
  const key = colorEntryKey(entry);
  const map = prefix === 'cus-bg' ? registry.bgKeyToAlias : registry.textKeyToAlias;
  const existing = map.get(key);
  if (existing) return existing;
  const alias = prefix === 'cus-bg'
    ? `cus-bg-${registry.bgSeq++}`
    : `cus-text-${registry.textSeq++}`;
  registry.entries[alias] = entry;
  map.set(key, alias);
  return alias;
}

export function hexColorToRgba(hex: string): string | undefined {
  const h = hex.trim().replace(/^#/, '');
  if (h.length === 8) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const a = Math.round((parseInt(h.slice(6, 8), 16) / 255) * 100) / 100;
    return `rgba(${r},${g},${b},${a})`;
  }
  if (h.length === 6) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},1)`;
  }
  return undefined;
}

function readThemeColorPair(raw: unknown): CustomColorEntry | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const lightRaw = typeof o.light_mode === 'string' ? o.light_mode
    : typeof o.lightMode === 'string' ? o.lightMode
    : undefined;
  const darkRaw = typeof o.dark_mode === 'string' ? o.dark_mode
    : typeof o.darkMode === 'string' ? o.darkMode
    : undefined;
  if (!lightRaw || !darkRaw) return undefined;
  const light = lightRaw.startsWith('#') ? hexColorToRgba(lightRaw) : lightRaw;
  const dark = darkRaw.startsWith('#') ? hexColorToRgba(darkRaw) : darkRaw;
  if (!light || !dark) return undefined;
  return { light_mode: light, dark_mode: dark };
}

function readCustomBackgroundStyle(node: Record<string, unknown>): CustomColorEntry | undefined {
  return readThemeColorPair(node.custom_background_style);
}

function readCustomBorderColor(node: Record<string, unknown>): CustomColorEntry | undefined {
  return readThemeColorPair(node.custom_border_color ?? node.customBorderColor);
}

/** 卡片已带 config.style.color 时灌入 registry，避免 cus-bg-N 序号与已有 token 冲突。 */
function seedRegistryFromConfigStyle(
  dsl: Record<string, unknown>,
  colorEntries: Record<string, CustomColorEntry>,
  bgKeyToAlias: Map<string, string>,
  textKeyToAlias: Map<string, string>,
): { bgSeq: number; textSeq: number } {
  let bgSeq = 0;
  let textSeq = 0;
  const config = dsl.config;
  if (!config || typeof config !== 'object') return { bgSeq, textSeq };
  const style = (config as Record<string, unknown>).style;
  if (!style || typeof style !== 'object') return { bgSeq, textSeq };
  const colors = (style as Record<string, unknown>).color;
  if (!colors || typeof colors !== 'object') return { bgSeq, textSeq };

  for (const [alias, entry] of Object.entries(colors as Record<string, unknown>)) {
    if (!entry || typeof entry !== 'object') continue;
    const pair = entry as Record<string, unknown>;
    if (typeof pair.light_mode !== 'string' || typeof pair.dark_mode !== 'string') continue;
    const themePair: CustomColorEntry = { light_mode: pair.light_mode, dark_mode: pair.dark_mode };
    colorEntries[alias] = themePair;
    const key = colorEntryKey(themePair);
    if (alias.startsWith('cus-text')) {
      textKeyToAlias.set(key, alias);
      const n = /^cus-text-(\d+)$/.exec(alias);
      if (n) textSeq = Math.max(textSeq, Number(n[1]) + 1);
    } else {
      bgKeyToAlias.set(key, alias);
      const n = /^cus-bg-(\d+)$/.exec(alias);
      if (n) bgSeq = Math.max(bgSeq, Number(n[1]) + 1);
    }
  }
  return { bgSeq, textSeq };
}

/**
 * 将飞书回读的 custom_background_style 还原为可再次发送的 background_style cus-N + config.style.color。
 * 若 markdown 缺少内联字色，按 text_size / 加粗内容补 <font color='cus-accent'|'cus-muted'>（飞书回读会丢字色）。
 * rawToDsl 可传入已登记的文字自定义色（preRegistered），与背景色一并写入 config.style.color。
 */
export function normalizeStoredCardColors(
  dsl: Record<string, unknown>,
  preRegistered?: ColorRegistry,
): void {
  const colorEntries: Record<string, CustomColorEntry> = { ...(preRegistered?.entries ?? {}) };
  const bgKeyToAlias = new Map<string, string>(preRegistered?.bgKeyToAlias ?? []);
  const textKeyToAlias = new Map<string, string>(preRegistered?.textKeyToAlias ?? []);
  let bgSeq = preRegistered?.bgSeq ?? 0;
  let textSeq = preRegistered?.textSeq ?? 0;

  if (!preRegistered) {
    const seeded = seedRegistryFromConfigStyle(dsl, colorEntries, bgKeyToAlias, textKeyToAlias);
    bgSeq = Math.max(bgSeq, seeded.bgSeq);
    textSeq = Math.max(textSeq, seeded.textSeq);
  }

  const ensureAlias = (prefix: 'cus-bg' | 'cus-text', entry: CustomColorEntry): string => {
    const map = prefix === 'cus-bg' ? bgKeyToAlias : textKeyToAlias;
    const existing = map.get(colorEntryKey(entry));
    if (existing) return existing;
    const alias = prefix === 'cus-bg' ? `cus-bg-${bgSeq++}` : `cus-text-${textSeq++}`;
    colorEntries[alias] = entry;
    map.set(colorEntryKey(entry), alias);
    return alias;
  };

  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;

    if (obj.tag === 'column') {
      const custom = readCustomBackgroundStyle(obj);
      if (custom) {
        obj.background_style = ensureAlias('cus-bg', custom);
        delete obj.custom_background_style;
      }
    }

    if (obj.tag === 'interactive_container') {
      const customBg = readCustomBackgroundStyle(obj);
      if (customBg) {
        obj.background_style = ensureAlias('cus-bg', customBg);
        delete obj.custom_background_style;
      }
      const border = readCustomBorderColor(obj);
      if (border) {
        obj.border_color = ensureAlias('cus-bg', border);
        delete obj.custom_border_color;
        delete obj.customBorderColor;
      }
    }

    if (obj.tag === 'markdown' && typeof obj.content === 'string') {
      normalizeMarkdownInlineHexColors(obj, ensureAlias, !!preRegistered);
    }

    for (const value of Object.values(obj)) walk(value);
  };
  walk(dsl.body);

  if (Object.keys(colorEntries).length === 0) return;

  const firstBgKey = Object.keys(colorEntries).find((k) => k.startsWith('cus-bg-'));
  const firstBg = firstBgKey ? colorEntries[firstBgKey] : undefined;
  if (firstBg) {
    const m = firstBg.light_mode.match(/^rgba\((\d+),(\d+),(\d+),/);
    if (m) {
      colorEntries['cus-accent'] = {
        light_mode: `rgba(${m[1]},${m[2]},${m[3]},1)`,
        dark_mode: firstBg.dark_mode.replace(/,\s*[\d.]+\)$/, ',1)'),
      };
    }
  }
  colorEntries['cus-muted'] ??= {
    light_mode: 'rgba(100,106,115,1)',
    dark_mode: 'rgba(166,166,166,1)',
  };

  // 无损原则：显式 cus-text-* 不得并进 cus-accent / cus-muted 等语义别名。
  // RAW textStyle.customColor 与背景同 hex（深底浅字）是合法设计，必须原样保留。

  const config =
    dsl.config && typeof dsl.config === 'object' ? (dsl.config as Record<string, unknown>) : {};
  dsl.config = config;
  const style =
    config.style && typeof config.style === 'object'
      ? (config.style as Record<string, unknown>)
      : {};
  config.style = style;
  const existing =
    style.color && typeof style.color === 'object'
      ? (style.color as Record<string, unknown>)
      : {};
  style.color = { ...colorEntries, ...existing };

  if (!colorEntries['cus-accent']) return;

  if (!preRegistered) {
    const applyDefaultFontColors = (node: unknown): void => {
      if (Array.isArray(node)) {
        for (const child of node) applyDefaultFontColors(child);
        return;
      }
      if (!node || typeof node !== 'object') return;
      const obj = node as Record<string, unknown>;
      if (obj.tag === 'markdown' && typeof obj.content === 'string') {
        delete obj.font_color;
        const content = obj.content;
        if (!/<font\s+color=/i.test(content)) {
          const size = obj.text_size;
          if (size === 'small') {
            obj.content = wrapMarkdownContentWithFontColor(content, 'cus-muted');
          } else if (size === 'heading' || content.includes('**')) {
            obj.content = wrapMarkdownContentWithFontColor(content, 'cus-accent');
          }
        }
      }
      for (const value of Object.values(obj)) applyDefaultFontColors(value);
    };
    applyDefaultFontColors(dsl.body);
  }
}

/** Safety net: hoist or replace inline #hex / rgba in markdown content. */
function normalizeMarkdownInlineHexColors(
  obj: Record<string, unknown>,
  ensureAlias: (prefix: 'cus-bg' | 'cus-text', entry: CustomColorEntry) => string,
  keepFontTags = false,
): void {
  const content = obj.content as string;
  const hexColor = (raw: string): CustomColorEntry | undefined => {
    const v = raw.trim();
    if (v.startsWith('#')) {
      const rgba = hexColorToRgba(v);
      return rgba ? { light_mode: rgba, dark_mode: rgba } : undefined;
    }
    if (/^rgba?\(/i.test(v)) return { light_mode: v, dark_mode: v };
    return undefined;
  };

  const single = content.match(/^<font color=['"]([^'"]+)['"]\s*>([\s\S]*)<\/font>$/);
  if (single && !keepFontTags) {
    const entry = hexColor(single[1]!);
    if (entry) {
      const alias = ensureAlias('cus-text', entry);
      delete obj.font_color;
      obj.content = `<font color='${alias}'>${single[2]!}</font>`;
      return;
    }
  }

  obj.content = content.replace(/<font color=['"]([^'"]+)['"]>/g, (match, raw: string) => {
    const entry = hexColor(raw);
    if (!entry) return match;
    const alias = ensureAlias('cus-text', entry);
    return `<font color='${alias}'>`;
  });
}
