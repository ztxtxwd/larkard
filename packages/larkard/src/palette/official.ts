/**
 * 飞书官方颜色枚举工具。
 *
 * 卡片的颜色字段分两类：
 * - 支持 `config.style.color` 自定义 token 的字段：可以把官方枚举/字面量物化成
 *   cus-* token，再交给换色算法；
 * - 只接受官方枚举的字段（icon.color / text_tag / header.template / number_tag…）：
 *   只能把目标色映射到最接近的官方枚举。
 *
 * 本文件只负责第二类和“官方枚举 → light/dark 颜色对”的解析。颜色对来自
 * `content/official-colors.ts`，保证深色模式也有值。
 */

import {
  deltaE,
  parseColor,
  rgbaToOklch,
  type Rgba,
} from './color.js';
import { COLOR_VALUES } from '../content/official-colors.js';

export interface OfficialPair {
  light: string;
  dark: string;
}

const WHITE: OfficialPair = { light: '#FFFFFF', dark: '#FFFFFF' };
const BLACK: OfficialPair = { light: '#000000', dark: '#000000' };
const BG_WHITE: OfficialPair = { light: '#FFFFFF', dark: '#1A1A1A' };

/** 字母色阶 → 完整色族名，用于把 B600 这类 token 反查到 official pair。 */
const FAMILY_LETTER: Record<string, string> = {
  B: 'blue',
  C: 'carmine',
  G: 'green',
  I: 'indigo',
  L: 'lime',
  O: 'orange',
  P: 'purple',
  R: 'red',
  S: 'yellow',
  T: 'turquoise',
  V: 'violet',
  W: 'wathet',
  Y: 'yellow',
  N: 'grey',
};

export const TEXT_TAG_FAMILIES = [
  'neutral',
  'blue',
  'turquoise',
  'lime',
  'orange',
  'violet',
  'indigo',
  'wathet',
  'green',
  'yellow',
  'red',
  'purple',
  'carmine',
] as const;

export const HEADER_TEMPLATES = [
  'blue',
  'wathet',
  'turquoise',
  'green',
  'yellow',
  'orange',
  'red',
  'carmine',
  'violet',
  'purple',
  'indigo',
  'grey',
  'default',
] as const;

const ALL_OFFICIAL = Object.keys(COLOR_VALUES);
const GREY_OFFICIAL = ALL_OFFICIAL.filter((key) => key.startsWith('grey'));
const COLORED_OFFICIAL = ALL_OFFICIAL.filter((key) => !key.startsWith('grey'));

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function letterPair(value: string): OfficialPair | null {
  const match = /^([bcgiloprstvwyn])(\d{2,3})$/i.exec(value.trim());
  if (!match) return null;
  const family = FAMILY_LETTER[match[1]!.toUpperCase()];
  const shade = match[2]!;
  if (!family) return null;
  const pair = COLOR_VALUES[`${family}-${shade}`];
  return pair ? { light: pair.light, dark: pair.dark } : null;
}

/** 官方枚举 / 裸色阶 / 字面量 → light/dark 颜色对；无法解析返回 null。 */
export function officialPair(value: string | undefined): OfficialPair | null {
  const raw = normalizeName(value ?? '');
  if (!raw || raw === 'default' || raw === 'none' || raw === 'transparent') return null;

  if (raw === 'white' || raw === 'static-white') return WHITE;
  if (raw === 'black') return BLACK;
  if (raw === 'bg-white' || raw === 'bg-body') return BG_WHITE;

  const direct = COLOR_VALUES[raw];
  if (direct) return { light: direct.light, dark: direct.dark };

  const letter = letterPair(raw);
  if (letter) return letter;

  if (raw.startsWith('#') || raw.startsWith('rgb')) {
    return { light: value!.trim(), dark: value!.trim() };
  }
  return null;
}

/** 背景字段语义：grey → N50（不是正文的 N600），bg-white/white → 白/深灰。 */
export function backgroundPair(value: string | undefined): OfficialPair | null {
  const raw = normalizeName(value ?? '');
  if (raw === 'grey' || raw === 'gray' || raw === '1') {
    const pair = COLOR_VALUES['grey-50'];
    return pair ? { light: pair.light, dark: pair.dark } : null;
  }
  return officialPair(value);
}

/** 描边字段语义：grey → N350 附近（这里取 grey-300 近似）。 */
export function borderPair(value: string | undefined): OfficialPair | null {
  const raw = normalizeName(value ?? '');
  if (raw === 'grey' || raw === 'gray') {
    const pair = COLOR_VALUES['grey-300'];
    return pair ? { light: pair.light, dark: pair.dark } : null;
  }
  return officialPair(value);
}

/** 正文文字语义：orange → O400，grey → N600，white → 白。 */
export function textPair(value: string | undefined): OfficialPair | null {
  const raw = normalizeName(value ?? '');
  if (raw === 'orange') {
    const pair = COLOR_VALUES['orange-400'];
    return pair ? { light: pair.light, dark: pair.dark } : null;
  }
  if (raw === 'grey' || raw === 'gray') {
    const pair = COLOR_VALUES['grey-600'];
    return pair ? { light: pair.light, dark: pair.dark } : null;
  }
  return officialPair(value);
}

/** 图标颜色语义：蓝绿橙红等走 500 档，其余走 600 档。 */
export function iconPair(value: string | undefined): OfficialPair | null {
  const raw = normalizeName(value ?? '');
  const fiveHundred: Record<string, string> = {
    blue: 'blue-500',
    green: 'green-500',
    orange: 'orange-500',
    red: 'red-500',
  };
  const key = fiveHundred[raw];
  if (key) {
    const pair = COLOR_VALUES[key];
    return pair ? { light: pair.light, dark: pair.dark } : null;
  }
  return officialPair(value);
}

function pairToRgba(pair: OfficialPair | null): Rgba | null {
  return pair ? parseColor(pair.light) : null;
}

/** 目标色 → 最接近的官方枚举，按 OKLab 距离。候选为空时回退 blue。 */
export function nearestOfficialColor(
  target: Rgba,
  candidates: readonly string[] = ALL_OFFICIAL,
): string {
  let best = candidates[0] ?? 'blue';
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const rgba = pairToRgba(officialPair(candidate));
    if (!rgba) continue;
    const distance = deltaE(target, rgba);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

/** 目标色 → 最接近的官方色，可限定只选灰阶或只选彩色。 */
export function nearestOfficialByChroma(target: Rgba, preferGrey: boolean): string {
  const candidates = preferGrey ? GREY_OFFICIAL : COLORED_OFFICIAL;
  return nearestOfficialColor(target, candidates);
}

function familyColor(family: string): Rgba | null {
  if (family === 'neutral') return pairToRgba(COLOR_VALUES['grey-600'] ?? null);
  return pairToRgba(officialPair(family));
}

/** 目标色 → 最接近的色族名（用于 text_tag / header.template）。 */
export function nearestFamily(
  target: Rgba,
  families: readonly string[],
): string {
  let best = families[0] ?? 'blue';
  let bestDistance = Infinity;
  for (const family of families) {
    const rgba = familyColor(family);
    if (!rgba) continue;
    const distance = deltaE(target, rgba);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = family;
    }
  }
  return best;
}

/** text_tag 允许的 13 个色族；源色是灰色时固定 neutral。 */
export function nearestTextTagColor(source: Rgba, targetAccent: Rgba): string {
  if (rgbaToOklch(source).c < 0.04 || rgbaToOklch(targetAccent).c < 0.04) return 'neutral';
  return nearestFamily(targetAccent, TEXT_TAG_FAMILIES);
}

/** header.template：目标色接近中性时优先 default/grey，否则挑最接近的色族。 */
export function nearestHeaderTemplate(targetAccent: Rgba, targetInk: Rgba): string {
  // 灰度图片不硬造彩色标题；浅色卡默认白底，深色卡用灰色 header 避免白块。
  if (rgbaToOklch(targetAccent).c < 0.04 && rgbaToOklch(targetInk).c < 0.04) {
    return rgbaToOklch(targetInk).l > 0.5 ? 'grey' : 'default';
  }
  const candidates = [...HEADER_TEMPLATES];
  let best = 'default';
  let bestDistance = Infinity;
  for (const template of candidates) {
    const rgba = template === 'default'
      ? parseColor('#FFFFFF')
      : template === 'grey'
        ? pairToRgba(COLOR_VALUES['grey-500'] ?? null)
        : familyColor(template);
    if (!rgba) continue;
    // 模板是标题底色，用比强调色更亮的锚点去比；同时混一点墨色，避免所有
    // 深色图都被判成 grey。
    const distance = Math.min(deltaE(targetAccent, rgba), deltaE(targetInk, rgba));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = template;
    }
  }
  return best;
}

/** 表格表头文字只有 default / grey 两个档：接近 N600 选 grey，否则 default。 */
export function nearestTableTextColor(target: Rgba): 'default' | 'grey' {
  const grey = pairToRgba(COLOR_VALUES['grey-600'] ?? null);
  if (!grey) return 'default';
  return deltaE(target, grey) < 0.12 ? 'grey' : 'default';
}

/** 表格表头背景只有 none / grey 两个档。 */
export function nearestTableBackground(target: Rgba, canvas: Rgba): 'none' | 'grey' {
  return deltaE(target, canvas) < 0.08 ? 'none' : 'grey';
}

/** 供 UI/调试使用：官方枚举的浅色 hex。 */
export function officialLight(value: string): string | undefined {
  return officialPair(value)?.light;
}
