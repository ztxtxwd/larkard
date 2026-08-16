import { z } from 'zod';

import { HeaderTemplateSchema, SpacingValueSchema } from './common/enums.js';
import { IconSchema } from './common/icon.js';
import { TextObjectSchema, TextTagSchema } from './common/text.js';

/**
 * 卡片标题（header）。
 * 位于卡片根级，不进入 body.elements。
 */
export const HeaderSchema = z
  .object({
    title: TextObjectSchema.describe(
      '卡片主标题；若仅配置副标题则实际展示为主标题效果',
    ),
    subtitle: TextObjectSchema.optional().describe('卡片副标题，最多一行'),
    text_tag_list: z
      .array(TextTagSchema)
      .max(3)
      .optional()
      .describe(
        '标题后缀标签，最多 3 个；与 i18n_text_tag_list 同时配置时优先生效多语言配置',
      ),
    i18n_text_tag_list: z
      .record(z.string(), z.array(TextTagSchema).max(3))
      .optional()
      .describe('多语言标题后缀标签，每个语言最多 3 个'),
    template: HeaderTemplateSchema.optional().describe(
      '标题主题色，默认 default；主题色宜集中在 header.template，勿满屏铺色',
    ),
    icon: IconSchema.optional().describe('标题前缀图标'),
    padding: SpacingValueSchema.optional().describe('标题内边距，默认 12px'),
  })
  .describe('卡片标题区（header），位于根级，不进入 body.elements');

export type Header = z.infer<typeof HeaderSchema>;
