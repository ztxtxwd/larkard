import { z } from 'zod';

import { PlainTextObjectSchema } from './text.js';

/**
 * 二次确认弹窗配置。
 */
export const ConfirmSchema = z
  .object({
    title: PlainTextObjectSchema.describe('二次确认弹窗标题'),
    text: PlainTextObjectSchema.describe('二次确认弹窗正文'),
  })
  .describe('二次确认弹窗配置');

export type Confirm = z.infer<typeof ConfirmSchema>;
