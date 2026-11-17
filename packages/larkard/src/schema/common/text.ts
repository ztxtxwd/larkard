import { z } from 'zod';

import {
  ColorSchema,
  ElementIdSchema,
  I18nStringMapSchema,
  SpacingValueSchema,
  TextSizeSchema,
  TextTagColorSchema,
} from './enums.js';
import { IconSchema } from './icon.js';

/**
 * 纯文本对象（plain_text）。
 * 多用于按钮文案、占位符、二次确认等。
 */
export const PlainTextObjectSchema = z
  .object({
    tag: z.literal('plain_text').describe('文本类型标签，固定为 plain_text'),
    content: z.string().describe('文本内容'),
    element_id: ElementIdSchema.optional().describe(
      '元素唯一标识，流式更新等场景用于定位该文本元素',
    ),
  })
  .describe('纯文本对象（tag = plain_text）');

export type PlainTextObject = z.infer<typeof PlainTextObjectSchema>;

/**
 * 支持 plain_text / lark_md 的文本对象。
 * 常用于标题、普通文本组件内嵌文本等。
 */
export const TextObjectSchema = z
  .object({
    tag: z
      .enum(['plain_text', 'lark_md'])
      .describe('文本类型：plain_text（纯文本）或 lark_md（有限 Markdown）'),
    content: z.string().optional().describe('文本内容'),
    element_id: ElementIdSchema.optional().describe('元素唯一标识'),
  })
  .describe('文本对象（plain_text / lark_md）');

export type TextObject = z.infer<typeof TextObjectSchema>;

/**
 * 折叠面板标题文本对象。
 * 官方 `CollapsiblePanelHeaderTitle` 是 LarkMd / Markdown 组件 / PlainText 三者的
 * 联合，故 tag 同时接受 plain_text / lark_md / markdown，并保留这三种形态各自
 * 文档化的排版字段（text_align / text_size / text_color / lines / margin / icon 等）。
 * 不保留这些可选字段会让 `parse()` 静默丢字段。
 */
export const MarkdownTextObjectSchema = z
  .object({
    tag: z
      .enum(['plain_text', 'lark_md', 'markdown'])
      .describe('文本类型：plain_text / lark_md / markdown'),
    content: z.string().optional().describe('文本内容'),
    element_id: ElementIdSchema.optional().describe('元素唯一标识'),
    icon: IconSchema.optional().describe('标题文案的前置图标'),
    i18n: I18nStringMapSchema.optional().describe('多语言文案映射'),
    enable_streaming: z
      .boolean()
      .optional()
      .describe('是否开启流式更新（逐字输出）'),
    text_align: z
      .enum(['left', 'center', 'right'])
      .optional()
      .describe('文本对齐方式，默认 left'),
    text_size: TextSizeSchema.optional().describe('字号，默认 normal'),
    text_color: ColorSchema.optional().describe('文本颜色，默认 default'),
    text_lines: z.number().int().optional().describe('文本最大行数'),
    lines: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('最大显示行数，超出省略'),
    margin: SpacingValueSchema.optional().describe('文本外边距'),
  })
  .describe('折叠面板等场景的标题文本对象（plain_text / lark_md / markdown）');

export type MarkdownTextObject = z.infer<typeof MarkdownTextObjectSchema>;

/**
 * 带样式的文本块（普通文本组件 text 字段）。
 */
export const StyledTextObjectSchema = z
  .object({
    tag: z
      .enum(['plain_text', 'lark_md'])
      .describe('文本类型：plain_text 或 lark_md'),
    content: z.string().describe('文本内容'),
    element_id: ElementIdSchema.optional().describe('元素唯一标识'),
    text_size: TextSizeSchema.optional().describe(
      '字号，默认 normal；官方枚举、10px–40px 或自定义 text_size key',
    ),
    text_color: ColorSchema.optional().describe(
      '文本颜色，默认 default；仅 plain_text 生效',
    ),
    text_align: z
      .enum(['left', 'center', 'right'])
      .optional()
      .describe('文本对齐方式，默认 left'),
    lines: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('最大显示行数，超出省略'),
  })
  .describe('带样式的文本块（普通文本组件的 text 字段）');

export type StyledTextObject = z.infer<typeof StyledTextObjectSchema>;

/**
 * 标题后缀标签 text_tag。
 */
export const TextTagSchema = z
  .object({
    tag: z.literal('text_tag').describe('后缀标签标识，固定为 text_tag'),
    element_id: ElementIdSchema.optional().describe('元素唯一标识'),
    text: PlainTextObjectSchema.optional().describe('标签文案'),
    color: TextTagColorSchema.optional().describe('标签颜色，默认 blue'),
  })
  .describe('标题后缀标签（最多展示 3 个）');

export type TextTag = z.infer<typeof TextTagSchema>;

/** tips / hover / disabled 提示文案 */
export const TipsTextSchema = z
  .object({
    tag: z.literal('plain_text').describe('提示文案类型，固定为 plain_text'),
    content: z.string().describe('提示文案内容'),
  })
  .describe('悬浮/禁用等场景的提示文案');

export type TipsText = z.infer<typeof TipsTextSchema>;
