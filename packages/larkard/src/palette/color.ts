/**
 * 取色/换色的底层色彩工具：sRGB ↔ OKLab/OKLCH、WCAG 对比度、格式转换。
 *
 * 这一层只做纯计算，不碰卡片结构，也不依赖 DOM。将来整体迁到 larkard 时
 * 可以原样搬走（对应计划里的 `larkard/palette/color.ts`）。
 *
 * OKLab 公式来自 Björn Ottosson：
 * https://bottosson.github.io/posts/oklab/
 */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  /** 0..1 */
  a: number;
}

export interface Oklab {
  /** 0..1 */
  l: number;
  a: number;
  b: number;
}

export interface Oklch {
  /** 0..1 */
  l: number;
  /** 0..~0.4，实际很少超过 0.37 */
  c: number;
  /** 0..360 */
  h: number;
}

const HEX = /^#?([0-9a-f]{3,8})$/i;
const RGB_FUNCTION =
  /^rgba?\(\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampChannel(value: number): number {
  return clamp(Math.round(value), 0, 255);
}

function clampAlpha(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return clamp(Math.round(value * 100) / 100, 0, 1);
}

function parseChannel(raw: string): number {
  if (raw.endsWith('%')) return (Number.parseFloat(raw) / 100) * 255;
  return Number.parseFloat(raw);
}

function parseAlpha(raw: string | undefined): number {
  if (raw === undefined) return 1;
  if (raw.endsWith('%')) return Number.parseFloat(raw) / 100;
  return Number.parseFloat(raw);
}

/**
 * 解析卡片里常见的颜色写法：`#rgb` / `#rgba` / `#rrggbb` / `#rrggbbaa`、
 * `rgb(...)` / `rgba(...)`（含百分比通道）。解析失败返回 null。
 */
export function parseColor(input: string | null | undefined): Rgba | null {
  const raw = (input ?? '').trim();
  if (!raw || raw === 'transparent') return raw === 'transparent' ? { r: 0, g: 0, b: 0, a: 0 } : null;

  const hex = HEX.exec(raw);
  if (hex) {
    let value = hex[1]!.toLowerCase();
    if (value.length === 3 || value.length === 4) {
      value = value
        .split('')
        .map((char) => char + char)
        .join('');
    }
    if (value.length !== 6 && value.length !== 8) return null;
    const r = Number.parseInt(value.slice(0, 2), 16);
    const g = Number.parseInt(value.slice(2, 4), 16);
    const b = Number.parseInt(value.slice(4, 6), 16);
    const a = value.length === 8 ? Number.parseInt(value.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a: clampAlpha(a) };
  }

  const match = RGB_FUNCTION.exec(raw);
  if (!match) return null;
  return {
    r: clampChannel(parseChannel(match[1]!)),
    g: clampChannel(parseChannel(match[2]!)),
    b: clampChannel(parseChannel(match[3]!)),
    a: clampAlpha(parseAlpha(match[4])),
  };
}

/** 卡片 DSL 里统一写不带空格的 `rgba(r,g,b,a)`。 */
export function formatRgba(color: Rgba): string {
  return `rgba(${clampChannel(color.r)},${clampChannel(color.g)},${clampChannel(color.b)},${clampAlpha(color.a)})`;
}

function toLinear(channel: number): number {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function fromLinear(channel: number): number {
  return channel <= 0.0031308
    ? channel * 12.92
    : 1.055 * channel ** (1 / 2.4) - 0.055;
}

/** sRGB → OKLab。alpha 不参与。 */
export function rgbaToOklab(color: Rgba): Oklab {
  const r = toLinear(color.r);
  const g = toLinear(color.g);
  const b = toLinear(color.b);

  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    l: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

/** OKLab → sRGB。超出色域的通道直接 clamp。 */
export function oklabToRgba(lab: Oklab, alpha = 1): Rgba {
  const l_ = lab.l + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const m_ = lab.l - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const s_ = lab.l - 0.0894841775 * lab.a - 1.291485548 * lab.b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const b = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return {
    r: clampChannel(fromLinear(r) * 255),
    g: clampChannel(fromLinear(g) * 255),
    b: clampChannel(fromLinear(b) * 255),
    a: clampAlpha(alpha),
  };
}

export function rgbaToOklch(color: Rgba): Oklch {
  const lab = rgbaToOklab(color);
  const c = Math.hypot(lab.a, lab.b);
  const h = c < 1e-7 ? 0 : ((Math.atan2(lab.b, lab.a) * 180) / Math.PI + 360) % 360;
  return { l: lab.l, c, h };
}

export function oklchToRgba(color: Oklch, alpha = 1): Rgba {
  const h = (color.h * Math.PI) / 180;
  const a = Math.cos(h) * color.c;
  const b = Math.sin(h) * color.c;
  return oklabToRgba({ l: color.l, a, b }, alpha);
}

/** 把半透明前景合成到背景上，用于计算实际可读对比度。 */
export function compositeOver(top: Rgba, bottom: Rgba): Rgba {
  const alpha = top.a + bottom.a * (1 - top.a);
  if (alpha <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: clampChannel((top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / alpha),
    g: clampChannel((top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / alpha),
    b: clampChannel((top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / alpha),
    a: clampAlpha(alpha),
  };
}

/** WCAG 2.x 相对亮度。 */
export function relativeLuminance(color: Rgba): number {
  const r = toLinear(color.r);
  const g = toLinear(color.g);
  const b = toLinear(color.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x 对比度，范围 1..21。 */
export function contrastRatio(a: Rgba, b: Rgba): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** OKLab 空间里的欧氏距离，用于近似感知色差。 */
export function deltaE(a: Rgba, b: Rgba): number {
  const x = rgbaToOklab(a);
  const y = rgbaToOklab(b);
  return Math.hypot(x.l - y.l, x.a - y.a, x.b - y.b);
}

export function hueDistance(a: number, b: number): number {
  const diff = Math.abs(((a - b) % 360 + 360) % 360);
  return Math.min(diff, 360 - diff);
}

/** 按 OKLab 线性插值，t=0 返回 a，t=1 返回 b。 */
export function mixColor(a: Rgba, b: Rgba, t: number): Rgba {
  const x = rgbaToOklab(a);
  const y = rgbaToOklab(b);
  return oklabToRgba({
    l: x.l + (y.l - x.l) * t,
    a: x.a + (y.a - x.a) * t,
    b: x.b + (y.b - x.b) * t,
  }, a.a + (b.a - a.a) * t);
}

/** 只改 OKLCH 的 L，保留色相/彩度。 */
export function withLightness(color: Rgba, lightness: number): Rgba {
  const oklch = rgbaToOklch(color);
  return oklchToRgba({ l: clamp(lightness, 0, 1), c: oklch.c, h: oklch.h }, color.a);
}

/** 彩度封顶，避免从霓虹图里取出无法承载文字的强调色。 */
export function capChroma(color: Rgba, maxChroma: number): Rgba {
  const oklch = rgbaToOklch(color);
  if (oklch.c <= maxChroma) return color;
  return oklchToRgba({ l: oklch.l, c: maxChroma, h: oklch.h }, color.a);
}

/**
 * 把前景色调整到与背景至少满足 `min` 对比度。
 *
 * `direction` 不传时按背景亮度决定：浅底往深走、深底往浅走。
 * 调整只改 OKLCH 的 L，保留品牌色相；实在达不到才退回纯黑/纯白。
 */
export function ensureContrast(
  foreground: Rgba,
  background: Rgba,
  min: number,
  direction?: 'lighter' | 'darker',
): Rgba {
  if (contrastRatio(foreground, background) >= min) return foreground;

  const oklch = rgbaToOklch(foreground);
  const black: Rgba = { r: 0, g: 0, b: 0, a: 1 };
  const white: Rgba = { r: 255, g: 255, b: 255, a: 1 };
  // 中间调背景（比如饱和度较高的蓝）黑/白哪边对比更高并不总由 L>0.5 决定，
  // 直接比较两个极端，避免“选了黑字但白字才够 4.5”的情况。
  const dir = direction
    ?? (contrastRatio(black, background) >= contrastRatio(white, background) ? 'darker' : 'lighter');

  for (let step = 1; step <= 100; step += 1) {
    const l = dir === 'darker'
      ? Math.max(0, oklch.l - step * 0.01)
      : Math.min(1, oklch.l + step * 0.01);
    const candidate = oklchToRgba({ l, c: oklch.c, h: oklch.h }, foreground.a);
    if (contrastRatio(candidate, background) >= min) return candidate;
  }

  return dir === 'darker'
    ? { r: 0, g: 0, b: 0, a: foreground.a }
    : { r: 255, g: 255, b: 255, a: foreground.a };
}

/** 目标色相附近最近的图片强调色色相。 */
export function nearestHue(hues: readonly number[], target: number, fallback: number): number {
  if (hues.length === 0) return fallback;
  let best = hues[0]!;
  let bestDistance = hueDistance(best, target);
  for (const hue of hues.slice(1)) {
    const distance = hueDistance(hue, target);
    if (distance < bestDistance) {
      best = hue;
      bestDistance = distance;
    }
  }
  return best;
}

/** 判断是否为近中性色（灰/米/黑白）。 */
export function isNeutral(color: Rgba, maxChroma = 0.04): boolean {
  return rgbaToOklch(color).c <= maxChroma;
}
