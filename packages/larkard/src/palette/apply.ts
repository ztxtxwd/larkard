/**
 * 把合成好的 token 色值写回卡片 DSL。
 *
 * 只改 `config.style.color` 里已有 token 的 `light_mode` / `dark_mode`，
 * 不重写任何 `background_style` / `<font color>` 引用：larkard 的 adapter
 * 在渲染/发送时会按 registry 解析这些别名。
 */

import type { ThemeColorPair } from './synthesize.js';

export interface ChangedColor {
  name: string;
  before: string;
  after: string;
}

export interface ApplyResult {
  card: Record<string, unknown>;
  changed: ChangedColor[];
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readColorString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!isRecord(value)) return '';
  const light = value.light_mode ?? value.lightMode;
  return typeof light === 'string' ? light : '';
}

/**
 * 在克隆上写回颜色；调用方拿到的永远是新对象，方便进撤销栈。
 */
export function applyThemePalette(
  card: unknown,
  colors: Record<string, ThemeColorPair>,
): ApplyResult {
  if (!isRecord(card)) {
    return { card: {}, changed: [] };
  }

  const next = structuredClone(card);
  const config = isRecord(next.config) ? next.config : (next.config = {});
  const style = isRecord(config.style) ? config.style : (config.style = {});
  const existing = isRecord(style.color) ? style.color : (style.color = {});

  const changed: ChangedColor[] = [];
  for (const [name, pair] of Object.entries(colors)) {
    if (!Object.prototype.hasOwnProperty.call(existing, name)) continue;
    const before = readColorString(existing[name]);
    if (before === pair.light_mode) {
      const darkBefore = isRecord(existing[name]) ? existing[name].dark_mode : undefined;
      if (darkBefore === pair.dark_mode) continue;
    }
    existing[name] = {
      light_mode: pair.light_mode,
      dark_mode: pair.dark_mode,
    };
    changed.push({ name, before, after: pair.light_mode });
  }

  return { card: next, changed };
}
