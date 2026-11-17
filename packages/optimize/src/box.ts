/** CSS 简写 / 间距 token 解析。只接受 px 与飞书间距枚举，百分比和 auto 视为“算不出来”。 */
import type { JsonObject } from './types.js';

export interface Box {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const ZERO_BOX: Box = { top: 0, right: 0, bottom: 0, left: 0 };

export function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 单个长度：数字按 px；`"12px"`；其它（百分比 / auto / em）返回 undefined。 */
export function lengthPx(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const match = /^(-?\d+(?:\.\d+)?)(?:px)?$/i.exec(value.trim());
    if (match) return Number(match[1]);
  }
  return undefined;
}

/**
 * `padding` / `margin` 的 1–4 值简写。
 *
 * 空串返回全 0；任一分量不是 px（例如 `"8%"`、`"auto"`）则整块返回 undefined——
 * 调用方据此跳过该组，而不是按 0 算出一个可能裁字的高度。
 */
export function parseBox(value: unknown): Box | undefined {
  if (value == null) return ZERO_BOX;
  if (typeof value === 'number') {
    const n = lengthPx(value);
    return n == null ? undefined : { top: n, right: n, bottom: n, left: n };
  }
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!text) return ZERO_BOX;
  const parts = text.split(/\s+/);
  if (parts.length > 4) return undefined;
  const nums: number[] = [];
  for (const part of parts) {
    const n = lengthPx(part);
    if (n == null) return undefined;
    nums.push(n);
  }
  const [top, right = top, bottom = top, left = right] = nums;
  return { top: top!, right, bottom, left };
}

/** 飞书 horizontal_spacing / vertical_spacing 枚举（对齐 renderer 的两张表）。 */
const HORIZONTAL_SPACING: Record<string, number> = { small: 4, default: 8, large: 12 };
const VERTICAL_SPACING: Record<string, number> = { default: 8, medium: 12, large: 16 };

/** 横向间距（列间距 / 容器子项水平间距）。缺省 8px。 */
export function horizontalSpacingPx(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const named = HORIZONTAL_SPACING[value.trim()];
    if (named != null) return named;
    const px = lengthPx(value);
    if (px != null) return px;
  }
  return HORIZONTAL_SPACING.default!;
}

/** 纵向间距（容器子项纵向间距）。缺省 8px；容器未写时另按 CSS 的 4px 处理。 */
export function verticalSpacingPx(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const named = VERTICAL_SPACING[value.trim()];
    if (named != null) return named;
    const px = lengthPx(value);
    if (px != null) return px;
  }
  return VERTICAL_SPACING.default!;
}

/** `background_style` 是否真的带底色（default / none / transparent / 空串不算）。 */
export function hasBackground(el: JsonObject): boolean {
  const raw = el.background_style ?? el.backgroundStyle
    ?? (el.property as JsonObject | undefined)?.background_style
    ?? (el.property as JsonObject | undefined)?.backgroundStyle;
  if (typeof raw !== 'string') return false;
  const text = raw.trim().toLowerCase();
  return text !== '' && text !== 'default' && text !== 'none' && text !== 'transparent';
}

/** 元素自身是否写了非 auto 的高度。 */
export function hasFixedHeight(el: JsonObject): boolean {
  const raw = el.height;
  if (raw == null || raw === '') return false;
  if (typeof raw === 'string' && /^\s*(auto|default)\s*$/i.test(raw)) return false;
  return true;
}

/** 目标容器是否横向排列（横向时等宽等高都不成立）。 */
export function isHorizontal(el: JsonObject): boolean {
  return el.direction === 'horizontal'
    || (el.property as JsonObject | undefined)?.direction === 'horizontal';
}
