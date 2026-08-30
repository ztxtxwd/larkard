/**
 * Feishu RAW editor fields for theme-aware custom colors:
 *   customBackgroundStyle / custom_background_style  → column backgrounds
 *   textStyle.customColor / textStyle.custom_color     → inline text color
 *
 * Public DSL uses config.style.color aliases (cus-N) for backgrounds after
 * normalizeStoredCardColors; inline text accepts enum names or #RRGGBBAA in
 * `<font color='…'>`. These helpers pick the light-mode value for projection
 * and rendering (dark mode follows Feishu client theme — out of scope here).
 */

export type ThemeColorPair = {
  light_mode?: string;
  lightMode?: string;
  dark_mode?: string;
  darkMode?: string;
};

export function readThemeColorLight(pair: unknown): string | undefined {
  if (!pair || typeof pair !== 'object') return undefined;
  const o = pair as ThemeColorPair;
  const raw = o.light_mode ?? o.lightMode;
  if (typeof raw !== 'string') return undefined;
  const v = raw.trim();
  return v || undefined;
}

/** Enum `color` wins; else fall back to customColor light hex/rgba. */
export function resolveTextStyleColor(textStyle: unknown): string | undefined {
  if (!textStyle || typeof textStyle !== 'object') return undefined;
  const ts = textStyle as Record<string, unknown>;
  const enumColor = typeof ts.color === 'string' ? ts.color.trim() : undefined;
  if (enumColor && enumColor !== 'default') return enumColor;
  const custom = ts.custom_color ?? ts.customColor;
  return readThemeColorLight(custom);
}

/** Light hex/rgba from column (or container) custom background, if any. */
export function resolveCustomBackgroundLight(property: unknown): string | undefined {
  if (!property || typeof property !== 'object') return undefined;
  const p = property as Record<string, unknown>;
  const custom = p.custom_background_style ?? p.customBackgroundStyle;
  return readThemeColorLight(custom);
}
