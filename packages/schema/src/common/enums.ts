import { z } from 'zod';

/**
 * 卡片内组件/元素的唯一标识。
 * 仅允许字母、数字、下划线，必须以字母开头，不超过 20 字符。
 */
export const ElementIdSchema = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_]{0,19}$/, {
    error: 'element_id 必须以字母开头，仅含字母/数字/下划线，且不超过 20 字符',
  })
  .describe(
    '操作组件/元素的唯一标识。卡片内全局唯一；仅允许字母、数字、下划线，必须以字母开头，不超过 20 字符',
  );

export type ElementId = z.infer<typeof ElementIdSchema>;

/** 外边距/内边距字符串，如 `"10px"` / `"4px 0"` / `"4px 0 4px 0"` */
export const SpacingValueSchema = z
  .string()
  .describe(
    '边距值。支持单值（如 10px）、双值（如 4px 0）或四值（上右下左）；单位一般为 px',
  );

export type SpacingValue = z.infer<typeof SpacingValueSchema>;

/** 间距枚举或自定义 px 值 */
export const SpacingTokenSchema = z
  .union([
    z.literal('small').describe('小间距，4px'),
    z.literal('medium').describe('中等间距，8px'),
    z.literal('large').describe('大间距，12px'),
    z.literal('extra_large').describe('超大间距，16px'),
    z.string().describe('自定义间距，取值范围通常为 [0,99]px'),
  ])
  .describe('组件间距：small / medium / large / extra_large，或自定义 px');

export type SpacingToken = z.infer<typeof SpacingTokenSchema>;

/** 水平对齐 */
export const HorizontalAlignSchema = z
  .enum(['left', 'center', 'right'])
  .describe('水平对齐方式：left / center / right');

export type HorizontalAlign = z.infer<typeof HorizontalAlignSchema>;

/** 垂直对齐 */
export const VerticalAlignSchema = z
  .enum(['top', 'center', 'bottom'])
  .describe('垂直对齐方式：top / center / bottom');

export type VerticalAlign = z.infer<typeof VerticalAlignSchema>;

/** 容器内组件排列方向 */
export const DirectionSchema = z
  .enum(['vertical', 'horizontal'])
  .describe('子组件排列方向：vertical（垂直）/ horizontal（水平）');

export type Direction = z.infer<typeof DirectionSchema>;

/**
 * 颜色值：官方枚举名、自定义 style.color key，或 rgba 语法。
 */
export const ColorSchema = z
  .string()
  .describe(
    '颜色值。可为官方颜色枚举、config.style.color 自定义 key，或 rgba(...) 语法',
  );

export type Color = z.infer<typeof ColorSchema>;

/** 标题主题色 template */
export const HeaderTemplateSchema = z
  .enum([
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
  ])
  .describe('标题主题色 template，默认 default');

export type HeaderTemplate = z.infer<typeof HeaderTemplateSchema>;

/** 文本标签颜色 */
export const TextTagColorSchema = z
  .enum([
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
  ])
  .describe('标题后缀标签颜色，默认 blue');

export type TextTagColor = z.infer<typeof TextTagColorSchema>;

/**
 * 字号：官方枚举、10px–40px，或 config.style.text_size 自定义 key。
 * 详细定义见 markdown/text-size（此处保持同语义，避免 common ↔ markdown 循环依赖）。
 */
export const TextSizeSchema = z
  .union([
    z.enum([
      'heading-0',
      'heading-1',
      'heading-2',
      'heading-3',
      'heading-4',
      'heading',
      'normal',
      'notation',
      'xxxx-large',
      'xxx-large',
      'xx-large',
      'x-large',
      'large',
      'medium',
      'small',
      'x-small',
    ]),
    z.string().regex(/^(1[0-9]|2[0-9]|3[0-9]|40)px$/, {
      error: '像素字号须为 10px–40px，例如 "14px"、"28px"',
    }),
    z
      .string()
      .min(1)
      .refine((value) => !/^\d+px$/.test(value), {
        message: '像素字号请使用 10px–40px；其它 px 值不合法',
      }),
  ])
  .describe(
    '文本大小：官方枚举、10px–40px 像素值，或 config.style.text_size 自定义 key',
  );

export type TextSize = z.infer<typeof TextSizeSchema>;

/** 交互控件常见宽度：default / fill / 自定义 px */
export const InteractiveWidthSchema = z
  .string()
  .describe(
    '交互控件宽度：default / fill，或自定义如 120px（通常 ≥100px）。并排按钮满宽均分用 fill（配套列 width=weighted）；内容自适应则省略本字段（配套列 width=auto）',
  );

export type InteractiveWidth = z.infer<typeof InteractiveWidthSchema>;

/** 下拉选择边框类型 */
export const SelectBorderTypeSchema = z
  .enum(['default', 'text'])
  .describe('下拉选择边框样式：default（带边框）/ text（无边框）');

export type SelectBorderType = z.infer<typeof SelectBorderTypeSchema>;

/** 多语言字符串映射 */
export const I18nStringMapSchema = z
  .record(z.string(), z.string())
  .describe('多语言文案映射，key 为语种（如 zh_cn、en_us），value 为对应文案');

export type I18nStringMap = z.infer<typeof I18nStringMapSchema>;

/** 卡片宽度模式 */
export const WidthModeSchema = z
  .enum(['default', 'compact', 'fill'])
  .describe(
    '卡片宽度模式：default（约 600px 上限）/ compact（400px）/ fill（撑满聊天窗口）',
  );

export type WidthMode = z.infer<typeof WidthModeSchema>;
