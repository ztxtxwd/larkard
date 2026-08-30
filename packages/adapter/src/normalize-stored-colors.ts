/**
 * 飞书存储卡片时会将 config.style.color 的 cus-N 展开为 custom_background_style（#RRGGBBAA），
 * 并丢弃 config.style 与 markdown.font_color。回读底稿后须 normalize，否则 modify 再发会丢色。
 */

export type CustomColorEntry = { light_mode: string; dark_mode: string };

export type ColorRegistry = {
  entries: Record<string, CustomColorEntry>;
  keyToAlias: Map<string, string>;
  bgSeq: number;
  textSeq: number;
};

export function createColorRegistry(): ColorRegistry {
  return { entries: {}, keyToAlias: new Map(), bgSeq: 0, textSeq: 0 };
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
  const existing = registry.keyToAlias.get(key);
  if (existing) return existing;
  const alias = prefix === 'cus-bg'
    ? `cus-bg-${registry.bgSeq++}`
    : `cus-text-${registry.textSeq++}`;
  registry.entries[alias] = entry;
  registry.keyToAlias.set(key, alias);
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

function readCustomBackgroundStyle(
  node: Record<string, unknown>,
): CustomColorEntry | undefined {
  const raw = node.custom_background_style;
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const lightRaw = typeof o.light_mode === 'string' ? o.light_mode : undefined;
  const darkRaw = typeof o.dark_mode === 'string' ? o.dark_mode : undefined;
  if (!lightRaw || !darkRaw) return undefined;
  const light = lightRaw.startsWith('#') ? hexColorToRgba(lightRaw) : lightRaw;
  const dark = darkRaw.startsWith('#') ? hexColorToRgba(darkRaw) : darkRaw;
  if (!light || !dark) return undefined;
  return { light_mode: light, dark_mode: dark };
}

/**
 * 将飞书回读的 custom_background_style 还原为可再次发送的 background_style cus-N + config.style.color。
 * 若 markdown 缺少 font_color，按 text_size / 加粗内容补 cus-accent / cus-muted（飞书回读会丢 font_color）。
 * rawToDsl 可传入已登记的文字自定义色（preRegistered），与背景色一并写入 config.style.color。
 */
export function normalizeStoredCardColors(
  dsl: Record<string, unknown>,
  preRegistered?: ColorRegistry,
): void {
  const colorEntries: Record<string, CustomColorEntry> = { ...(preRegistered?.entries ?? {}) };
  const keyToAlias = new Map<string, string>(preRegistered?.keyToAlias ?? []);
  let bgSeq = preRegistered?.bgSeq ?? 0;
  let textSeq = preRegistered?.textSeq ?? 0;

  const ensureAlias = (prefix: string, entry: CustomColorEntry): string => {
    const existing = keyToAlias.get(colorEntryKey(entry));
    if (existing) return existing;
    const alias = prefix === 'cus-bg' ? `cus-bg-${bgSeq++}` : `cus-text-${textSeq++}`;
    colorEntries[alias] = entry;
    keyToAlias.set(colorEntryKey(entry), alias);
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

    if (obj.tag === 'markdown' && typeof obj.content === 'string') {
      normalizeMarkdownInlineHexColors(obj, ensureAlias);
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

  const aliasRenames = new Map<string, string>();
  for (const to of ['cus-accent', 'cus-muted'] as const) {
    for (const [from, target] of unifyMatchingAlias(colorEntries, 'cus-text', to)) {
      aliasRenames.set(from, target);
    }
  }
  remapColorReferences(dsl.body, aliasRenames);

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

  const applyDefaultFontColors = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) applyDefaultFontColors(child);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    if (obj.tag === 'markdown' && obj.font_color === undefined) {
      const size = obj.text_size;
      const content = typeof obj.content === 'string' ? obj.content : '';
      if (size === 'small') obj.font_color = 'cus-muted';
      else if (size === 'heading' || content.includes('**')) obj.font_color = 'cus-accent';
    }
    for (const value of Object.values(obj)) applyDefaultFontColors(value);
  };
  applyDefaultFontColors(dsl.body);
}

function unifyMatchingAlias(
  entries: Record<string, CustomColorEntry>,
  fromPrefix: string,
  to: string,
): Map<string, string> {
  const renames = new Map<string, string>();
  const target = entries[to];
  if (!target) return renames;
  for (const alias of Object.keys(entries)) {
    if (alias === to) continue;
    if (!alias.startsWith(`${fromPrefix}-`) && alias !== fromPrefix) continue;
    const entry = entries[alias]!;
    const matches = to === 'cus-accent' || to === 'cus-muted'
      ? entry.light_mode === target.light_mode
      : colorEntryKey(entry) === colorEntryKey(target);
    if (matches) {
      renames.set(alias, to);
      delete entries[alias];
    }
  }
  return renames;
}

function remapColorReferences(node: unknown, aliasRenames: Map<string, string>): void {
  const remap = (alias: string | undefined): string | undefined => {
    if (!alias) return alias;
    return aliasRenames.get(alias) ?? alias;
  };

  const walk = (n: unknown): void => {
    if (Array.isArray(n)) { for (const c of n) walk(c); return; }
    if (!n || typeof n !== 'object') return;
    const obj = n as Record<string, unknown>;
    if (typeof obj.font_color === 'string') obj.font_color = remap(obj.font_color);
    if (typeof obj.content === 'string' && obj.content.includes('<font')) {
      obj.content = obj.content.replace(
        /<font color=['"]([^'"]+)['"]>/g,
        (_m, color: string) => {
          const next = remap(color);
          return next ? `<font color='${next}'>` : _m;
        },
      );
    }
    for (const value of Object.values(obj)) walk(value);
  };
  walk(node);
}

/** Safety net: hoist or replace inline #hex / rgba in markdown content. */
function normalizeMarkdownInlineHexColors(
  obj: Record<string, unknown>,
  ensureAlias: (prefix: string, entry: CustomColorEntry) => string,
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
  if (single) {
    const entry = hexColor(single[1]!);
    if (entry) {
      const alias = ensureAlias('cus-text', entry);
      if (obj.font_color === undefined) obj.font_color = alias;
      obj.content = single[2]!;
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
