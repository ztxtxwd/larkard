import { z } from 'zod';

import { PlainTextObjectSchema } from './text.js';

/**
 * 音视频组件降级配置。
 * - `"drop"`：丢弃组件
 * - 对象：自定义降级文案
 * - 省略：使用系统默认降级文案
 */
export const FallbackSchema = z
  .union([
    z.literal('drop').describe('客户端不支持时丢弃该组件'),
    z
      .object({
        tag: z
          .literal('fallback_text')
          .describe('降级类型，固定为 fallback_text'),
        text: PlainTextObjectSchema.describe('自定义降级文案'),
      })
      .describe('自定义降级文案对象'),
  ])
  .describe(
    '音视频降级配置：drop 丢弃组件，或 fallback_text 自定义文案；省略则用系统默认文案',
  );

export type Fallback = z.infer<typeof FallbackSchema>;
