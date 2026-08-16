import { z } from 'zod';

/**
 * 多端跳转链接。
 * url 与三端链接至少配置一类；若不填 url，则 android_url / ios_url / pc_url 均需填写。
 * 禁用某端可配置为 `lark://msgcard/unsupported_action`。
 */
export const MultiUrlSchema = z
  .object({
    url: z
      .string()
      .optional()
      .describe('默认跳转链接；若同时配置各端链接，优先使用 url'),
    pc_url: z.string().optional().describe('PC 端跳转链接'),
    ios_url: z.string().optional().describe('iOS 端跳转链接'),
    android_url: z.string().optional().describe('Android 端跳转链接'),
  })
  .superRefine((data, ctx) => {
    const hasUrl = Boolean(data.url);
    const hasAllPlatform =
      Boolean(data.pc_url) && Boolean(data.ios_url) && Boolean(data.android_url);
    if (!hasUrl && !hasAllPlatform) {
      ctx.addIssue({
        code: 'custom',
        message:
          'url 与各端链接至少填一类；若不填 url，则必须完整填写 android_url、ios_url、pc_url',
      });
    }
  })
  .describe(
    '多端跳转链接。url 与三端链接至少填一类；禁用某端可设为 lark://msgcard/unsupported_action',
  );

export type MultiUrl = z.infer<typeof MultiUrlSchema>;

/** 卡片整体点击跳转链接（结构同 MultiUrl） */
export const CardLinkSchema = MultiUrlSchema.describe(
  '卡片整体点击跳转链接（card_link）',
);

export type CardLink = z.infer<typeof CardLinkSchema>;
