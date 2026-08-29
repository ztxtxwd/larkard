/**
 * 飞书存储卡片时会将 config.style.color 的 cus-N 展开为 custom_background_style（#RRGGBBAA），
 * 并丢弃 config.style 与 markdown.font_color。回读底稿后须 normalize，否则 modify 再发会丢色。
 */

export type CustomColorEntry = { light_mode: string; dark_mode: string };

function hexColorToRgba(hex: string): string | undefined {
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
 */
export function normalizeStoredCardColors(dsl: Record<string, unknown>): void {
  const colorEntries: Record<string, CustomColorEntry> = {};
  const styleKey = (entry: CustomColorEntry) => `${entry.light_mode}|${entry.dark_mode}`;
  const keyToAlias = new Map<string, string>();
  let bgSeq = 0;

  const ensureAlias = (prefix: string, entry: CustomColorEntry): string => {
    const existing = keyToAlias.get(styleKey(entry));
    if (existing) return existing;
    const alias = `${prefix}-${bgSeq++}`;
    colorEntries[alias] = entry;
    keyToAlias.set(styleKey(entry), alias);
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

    for (const value of Object.values(obj)) walk(value);
  };
  walk(dsl.body);

  if (Object.keys(colorEntries).length === 0) return;

  const firstBg = colorEntries['cus-bg-0'] ?? Object.values(colorEntries)[0];
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
