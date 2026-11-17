import { z } from 'zod';
import { FEISHU_EMOJI_TOKENS } from '../../content/emoji/index.js';

/**
 * 飞书表情（emoji_type）枚举。
 * 在富文本中写作 `:KEY:`，例如 `:DONE:`、`:THUMBSUP:`。
 * 数据源：`larkard/emoji` 的官方 token 清单。
 */
export const FeishuEmojiTokenSchema = z
  .enum(FEISHU_EMOJI_TOKENS)
  .describe('飞书表情 key（emoji_type），富文本中写作 :KEY:');

export type FeishuEmojiToken = z.infer<typeof FeishuEmojiTokenSchema>;

export { FEISHU_EMOJI_TOKENS } from '../../content/emoji/index.js';
