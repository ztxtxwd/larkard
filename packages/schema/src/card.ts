import { z } from 'zod';

import { CardLinkSchema } from './common/url.js';
import { BodySchema, ConfigSchema } from './config.js';
import { HeaderSchema } from './header.js';

// 确保 ElementSchema 完成注册（供 Body / 容器 lazy 引用）
import './element.js';

/**
 * 飞书卡片 JSON 2.0 根 Schema。
 *
 * - 需显式声明 `schema: "2.0"` 才能使用 2.0 能力
 * - 空对象 `{}` 在开放平台语义上合法（空白卡片），本 Schema 同样允许
 *
 * @see https://open.feishu.cn/document/feishu-cards/card-json-v2-structure
 */
export const FeishuCardSchema = z
  .object({
    schema: z
      .literal('2.0')
      .optional()
      .describe(
        '卡片 JSON 结构版本。使用 2.0 能力时必须显式声明为 "2.0"；省略时平台按 1.0 处理',
      ),
    config: ConfigSchema.optional().describe(
      '全局行为配置；JSON 2.0 下 update_multi 只能为 true 或不写',
    ),
    card_link: CardLinkSchema.optional().describe('卡片整体点击跳转链接'),
    header: HeaderSchema.optional().describe(
      '标题区；主题色集中在 header.template、图标、小标签、关键数值与按钮',
    ),
    body: BodySchema.optional().describe('正文区'),
  })
  .describe(
    '飞书卡片 JSON 2.0 根结构。生成时须 schema:"2.0"；不要臆造 image_key / open_id；人员展示与 @ 通知语义勿混用',
  );

export type FeishuCard = z.infer<typeof FeishuCardSchema>;

/**
 * 强制要求 schema 为 2.0 的变体（推荐业务侧使用）。
 */
export const FeishuCardV2Schema = FeishuCardSchema.required({
  schema: true,
})
  .extend({
    schema: z.literal('2.0').describe('卡片 JSON 结构版本，固定为 "2.0"'),
  })
  .describe(
    '飞书卡片 JSON 2.0（强制 schema = "2.0"）。工具 generate_feishu_card 的参数应使用此完整卡片对象',
  );

export type FeishuCardV2 = z.infer<typeof FeishuCardV2Schema>;
