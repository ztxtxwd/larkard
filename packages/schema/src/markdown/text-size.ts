import { z } from 'zod';

/**
 * 富文本 / 普通文本组件的官方字号枚举。
 */
export const MarkdownTextSizeEnumSchema = z
  .enum([
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
  ])
  .describe(
    '官方字号枚举。heading-* / normal / notation，或 xxxx-large … x-small（约 10–30px）',
  );

export type MarkdownTextSizeEnum = z.infer<typeof MarkdownTextSizeEnumSchema>;

/**
 * 自定义像素字号。支持 10px–40px（覆盖官方最小 x-small 到略大于 heading-0）。
 */
export const MarkdownTextSizePixelSchema = z
  .string()
  .regex(/^(1[0-9]|2[0-9]|3[0-9]|40)px$/, {
    error: '像素字号须为 10px–40px，例如 "14px"、"28px"',
  })
  .describe('自定义像素字号，支持 10px–40px');

export type MarkdownTextSizePixel = z.infer<typeof MarkdownTextSizePixelSchema>;

/**
 * config.style.text_size 中声明的自定义 key（如 cus-0）。
 * 不以纯数字 px 形式书写，避免与像素字号混淆。
 */
export const MarkdownTextSizeCustomKeySchema = z
  .string()
  .min(1)
  .refine((value) => !/^\d+px$/.test(value), {
    message: '像素字号请使用 10px–40px；其它 px 值不合法',
  })
  .describe('config.style.text_size 自定义 key，如 cus-0');

export type MarkdownTextSizeCustomKey = z.infer<
  typeof MarkdownTextSizeCustomKeySchema
>;

/**
 * 组件 text_size：
 * 1. 官方枚举
 * 2. 像素值 10px–40px
 * 3. config.style.text_size 自定义 key
 */
export const MarkdownTextSizeSchema = z
  .union([
    MarkdownTextSizeEnumSchema,
    MarkdownTextSizePixelSchema,
    MarkdownTextSizeCustomKeySchema,
  ])
  .describe(
    '文本大小：官方枚举、10px–40px 像素值，或 config.style.text_size 自定义 key',
  );

export type MarkdownTextSize = z.infer<typeof MarkdownTextSizeSchema>;
