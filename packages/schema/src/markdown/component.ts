import { z } from 'zod';

import {
  ColorSchema,
  ElementIdSchema,
  HorizontalAlignSchema,
  SpacingValueSchema,
} from '../common/enums.js';
import { IconSchema, UdIconSchema } from '../common/icon.js';
import { MultiUrlSchema } from '../common/url.js';
import { MarkdownTextSizeSchema } from './text-size.js';

/**
 * 历史差异化跳转映射（JSON 1.0 / 旧语法）。
 * JSON 2.0 已不推荐；请优先使用 `<link>` 标签。
 */
export const MarkdownHrefSchema = z
  .record(z.string(), MultiUrlSchema)
  .describe(
    '差异化跳转映射（旧语法）。content 中使用 [文案]($key) 引用；JSON 2.0 建议改用 <link>',
  );

export type MarkdownHref = z.infer<typeof MarkdownHrefSchema>;

/**
 * 富文本（Markdown）组件。
 *
 * `content` 支持 CommonMark 标准语法（除 HTMLBlock）以及飞书扩展标签：
 * `<at>` / `<person>` / `<link>` / `<text_tag>` / `<number_tag>` /
 * `<local_datetime>` / `<font>` / `<a>` / `<audio>` / `<br>` / `<hr>` 等。
 *
 * 推荐使用 `markdown()` 构建器生成 content。
 *
 * @see https://open.feishu.cn/document/feishu-cards/card-json-v2-components/content-components/rich-text
 */
export const MarkdownSchema = z
  .object({
    tag: z.literal('markdown').describe('组件标签，固定为 markdown'),
    content: z
      .string()
      .describe(
        "Markdown 文本。分区标题默认写成 **分区名**（勿用 # 标题、勿默认色条丨）。字段标签用 <font color='grey'>；短标识用 <text_tag>。仅展示人员用 <person>，要通知用 <at>；二者勿包进 <font>。支持 at/person/link/text_tag/number_tag/local_datetime/font/audio 等",
      ),
    element_id: ElementIdSchema.optional().describe('组件唯一标识'),
    margin: SpacingValueSchema.optional().describe('组件外边距，默认 0'),
    text_align: HorizontalAlignSchema.optional().describe(
      '文本对齐方式，默认 left',
    ),
    text_size: MarkdownTextSizeSchema.optional().describe(
      '文本大小，默认 normal；可为官方枚举或自定义 text_size key。标签/辅助说明可用 notation，数值可用 heading',
    ),
    text_lines: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('最大显示行数，超出省略'),
    enable_streaming: z
      .boolean()
      .optional()
      .describe('是否参与流式输出渲染，默认 false'),
    font_color: ColorSchema.optional().describe(
      '整段 Markdown 文字颜色；可为官方颜色枚举或 config.style.color 自定义 key（如 cus-accent）。内联 <font color> 仍走 content 语法',
    ),
    icon: IconSchema.optional().describe(
      '文本前缀图标；与文内 emoji 二选一，不要叠用。图标颜色应与描述的状态文字一致',
    ),
    ud_icon: UdIconSchema.optional().describe(
      '历史前缀图标（ud_icon）；与 icon 同时存在时以 icon 为准',
    ),
    href: MarkdownHrefSchema.optional().describe(
      '旧版差异化跳转映射；JSON 2.0 建议使用 <link> 替代',
    ),
  })
  .describe(
    '富文本（Markdown）组件。正文默认直接放在 body.elements；分区用 **加粗** 小标题起头',
  );

export type Markdown = z.infer<typeof MarkdownSchema>;
