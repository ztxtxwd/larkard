import { z } from 'zod';

import { ICON_TOKENS } from './icon-tokens.list.js';

/**
 * 飞书卡片图标库 token 枚举。
 *
 * 全量有效值维护在同目录 `icon-tokens.list.ts`（当前 1167 个，线性 / 面性 / 彩色）。
 * 本文件只把它包成 zod schema，不单独增删 token：能通过校验的 token 与清单严格一一对应，
 * 避免出现「枚举收多了（臆造 token 也能过）」或「枚举收少了（真机能渲染却被判非法）」。
 */
export const IconTokenSchema = z
  .enum(ICON_TOKENS)
  .describe('飞书图标库 token，如 add_outlined、chat-forbidden_filled');

export type IconToken = z.infer<typeof IconTokenSchema>;

export { ICON_TOKENS } from './icon-tokens.list.js';
