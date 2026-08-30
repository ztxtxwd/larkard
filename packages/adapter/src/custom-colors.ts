/**
 * Feishu RAW editor fields for theme-aware custom colors:
 *   customBackgroundStyle / custom_background_style  → column backgrounds
 *   textStyle.customColor / textStyle.custom_color     → inline text color
 *
 * Public DSL stores custom colors in config.style.color (cus-accent / cus-bg-N …)
 * and references them via <font color> in markdown content / background_style — not inline #hex.
 */

import type { CustomColorEntry } from './normalize-stored-colors.js';
import { hexColorToRgba } from './normalize-stored-colors.js';

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

export function readThemeColorDark(pair: unknown): string | undefined {
  if (!pair || typeof pair !== 'object') return undefined;
  const o = pair as ThemeColorPair;
  const raw = o.dark_mode ?? o.darkMode;
  if (typeof raw !== 'string') return undefined;
  const v = raw.trim();
  return v || undefined;
}

export function isCustomHexColor(color: string): boolean {
  const v = color.trim();
  return v.startsWith('#') || /^rgba?\(/i.test(v);
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

/** When text color comes from customColor (not enum), return the full light/dark pair. */
export function resolveTextStyleCustomColorPair(textStyle: unknown): ThemeColorPair | undefined {
  if (!textStyle || typeof textStyle !== 'object') return undefined;
  const ts = textStyle as Record<string, unknown>;
  const enumColor = typeof ts.color === 'string' ? ts.color.trim() : undefined;
  if (enumColor && enumColor !== 'default') return undefined;
  const custom = ts.custom_color ?? ts.customColor;
  if (!custom || typeof custom !== 'object') return undefined;
  return custom as ThemeColorPair;
}

export function themePairToColorEntry(pair: ThemeColorPair): CustomColorEntry | undefined {
  const lightRaw = readThemeColorLight(pair);
  const darkRaw = readThemeColorDark(pair);
  if (!lightRaw || !darkRaw) return undefined;
  const light = lightRaw.startsWith('#') ? hexColorToRgba(lightRaw) : lightRaw;
  const dark = darkRaw.startsWith('#') ? hexColorToRgba(darkRaw) : darkRaw;
  if (!light || !dark) return undefined;
  return { light_mode: light, dark_mode: dark };
}

/** Light hex/rgba from column (or container) custom background, if any. */
export function resolveCustomBackgroundLight(property: unknown): string | undefined {
  if (!property || typeof property !== 'object') return undefined;
  const p = property as Record<string, unknown>;
  const custom = p.custom_background_style ?? p.customBackgroundStyle;
  return readThemeColorLight(custom);
}
