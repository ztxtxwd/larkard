/**
 * 客户端横向 / 纵向间距枚举。
 *
 * 两套枚举不同，不能混用：
 * - 纵向 vertical：{ default: 8, medium: 12, large: 16 }，没有 small / extra_large
 * - 横向 horizontal：{ small: 4, default: 8, large: 12 }，没有 medium / extra_large
 *
 * 注意：纵向的 `default: 8` 是**容器子项**的缺省间距。正文 `body` 省略
 * `vertical_spacing` 时客户端用 12px（`.universal-card-body { row-gap: 12px }`），
 * 见 `BODY_DEFAULT_VERTICAL_SPACING_PX`。
 *
 * 来源：客户端反推 #16/D6。renderer、optimize、store、core 的 device 规则
 * 都从这里取值，避免同一条真机规则各写一份数字。
 */

/** 纵向间距（正文纵向排列 / 容器子项纵向间距）。 */
export const VERTICAL_SPACING_PX: Record<string, number> = {
  default: 8,
  medium: 12,
  large: 16,
};

/** 横向间距（分栏列间距 / 容器子项水平间距）。 */
export const HORIZONTAL_SPACING_PX: Record<string, number> = {
  small: 4,
  default: 8,
  large: 12,
};

/** 未写 / 未知值时的缺省间距。 */
export const DEFAULT_SPACING_PX = 8;

/**
 * 正文 `body` 省略 `vertical_spacing` 时的默认纵向间距。
 *
 * 来源：客户端样式 `.universal-card-body { row-gap: 12px }`（旧间距模式 16px）。
 * 8px 只适用于 `column_set` / 嵌套容器，不能拿来兜底 body。
 */
export const BODY_DEFAULT_VERTICAL_SPACING_PX = 12;

export type SpacingDirection = 'horizontal' | 'vertical';

/**
 * 间距值 → px。
 *
 * 接受枚举名、数字（按 px）与 `"12px"`；其它值返回 undefined，由调用方决定
 * 是回退默认值还是跳过。
 */
export function parseSpacingPx(
  value: unknown,
  direction: SpacingDirection,
): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  const table = direction === 'vertical' ? VERTICAL_SPACING_PX : HORIZONTAL_SPACING_PX;
  if (table[text] != null) return table[text];
  const matched = /^(-?\d+(?:\.\d+)?)(?:px)?$/.exec(text);
  return matched ? Number(matched[1]) : undefined;
}

/** 间距值 → px，未知值回退缺省 8px。 */
export function spacingPx(value: unknown, direction: SpacingDirection): number {
  return parseSpacingPx(value, direction) ?? DEFAULT_SPACING_PX;
}

/**
 * DSL 间距字段接受的非 px token（schema 的并集口径）。
 *
 * 注意这是「字段能不能写」的校验集合，不是客户端像素映射；`default`
 * 只对 `column_set.horizontal_spacing` 特殊放行，不在这个集合里。
 */
export const DSL_SPACING_TOKENS: ReadonlySet<string> = new Set([
  'small',
  'medium',
  'large',
  'extra_large',
]);
