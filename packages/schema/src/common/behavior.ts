import { z } from 'zod';

/**
 * 打开链接交互。
 * @see https://open.feishu.cn/document/feishu-cards/configuring-card-interactions
 */
export const OpenUrlBehaviorSchema = z
  .object({
    type: z.literal('open_url').describe('交互类型，固定为 open_url'),
    default_url: z
      .string()
      .describe(
        '兜底跳转地址；无真实链接时可用示例 https://open.feishu.cn',
      ),
    android_url: z.string().optional().describe('Android 端跳转地址'),
    ios_url: z.string().optional().describe('iOS 端跳转地址'),
    pc_url: z.string().optional().describe('PC 端跳转地址'),
  })
  .describe('打开链接交互（type = open_url）');

export type OpenUrlBehavior = z.infer<typeof OpenUrlBehaviorSchema>;

/**
 * 回传交互（请求回调）。
 * value 需为 object；开放平台 SDK 仅支持 object。
 */
export const CallbackBehaviorSchema = z
  .object({
    type: z.literal('callback').describe('交互类型，固定为 callback'),
    value: z
      .record(z.string(), z.unknown())
      .describe('回传给服务端的自定义数据对象；用简洁业务字段即可'),
  })
  .describe('请求回调交互（type = callback）');

export type CallbackBehavior = z.infer<typeof CallbackBehaviorSchema>;

/**
 * 组件交互行为。使用 type 作为判别字段。
 */
export const BehaviorSchema = z
  .discriminatedUnion('type', [OpenUrlBehaviorSchema, CallbackBehaviorSchema])
  .describe('组件交互行为：open_url（打开链接）或 callback（回传回调），没有别的可能');

export type Behavior = z.infer<typeof BehaviorSchema>;

/** behaviors 数组 */
export const BehaviorsSchema = z
  .array(BehaviorSchema)
  .describe('组件交互行为列表；可同时配置跳转与回调');

export type Behaviors = z.infer<typeof BehaviorsSchema>;
