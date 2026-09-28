import { z } from 'zod';

import { ColorSchema } from './enums.js';
import { IconTokenSchema } from './icon-tokens.js';

export { IconTokenSchema } from './icon-tokens.js';
export type { IconToken } from './icon-tokens.js';

/** 标准图标库图标 */
export const StandardIconSchema = z
  .object({
    tag: z.literal('standard_icon').describe('图标类型，固定为 standard_icon'),
    token: IconTokenSchema.optional().describe(
      '图标库 token 枚举（必须命中枚举值）。常用：member_outlined（人员，无 user_outlined）、safe_outlined（安全）、info_outlined、warning_outlined、done_outlined；图表相关可用 insert-chart_outlined / sheet-line_outlined / sheet-histogram_outlined / sheet-pie_outlined / data-sheet_outlined / score_outlined / report_outlined / hot_outlined。禁止臆造 token',
    ),
    color: ColorSchema.optional().describe(
      '图标颜色；对 outlined/filled 图标生效。应与描述的状态文字颜色一致',
    ),
    size: z
      .string()
      .optional()
      .describe('图标尺寸，如 "10px 10px"（部分组件支持）'),
  })
  .describe('标准图标库图标');

export type StandardIcon = z.infer<typeof StandardIconSchema>;

/** 自定义图片图标 */
export const CustomIconSchema = z
  .object({
    tag: z.literal('custom_icon').describe('图标类型，固定为 custom_icon'),
    img_key: z
      .string()
      .optional()
      .describe('自定义图标的图片 key（上传图片接口返回）'),
    size: z.string().optional().describe('图标尺寸，如 "10px 10px"'),
  })
  .describe('自定义图片图标');

export type CustomIcon = z.infer<typeof CustomIconSchema>;

/**
 * 前缀图标。使用 tag 判别标准图标与自定义图标。
 */
export const IconSchema = z
  .discriminatedUnion('tag', [StandardIconSchema, CustomIconSchema])
  .describe('前缀图标：standard_icon（图标库）或 custom_icon（自定义图片）');

export type Icon = z.infer<typeof IconSchema>;

/**
 * 历史人员列表前缀图标（ud_icon）。
 * 与 icon 同时存在时以 icon 为准。
 */
export const UdIconSchema = z
  .object({
    tag: z
      .literal('ud_icon')
      .optional()
      .describe('图标类型，固定为 ud_icon（可省略）'),
    token: IconTokenSchema.optional().describe('图标库 token 枚举'),
    style: z
      .object({
        color: ColorSchema.optional().describe('图标颜色'),
      })
      .optional()
      .describe('图标样式'),
    element_id: z.string().optional().describe('元素唯一标识'),
    margin: z.string().optional().describe('外边距'),
  })
  .describe('历史人员列表前缀图标（ud_icon）；与 icon 同时存在时以 icon 为准');

export type UdIcon = z.infer<typeof UdIconSchema>;
