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
 * 客户端内部枚举 ActionRequest。开放平台发消息接口不接受这个 type
 * （200621 unknown behavior type），发出去的卡片请用 callback。
 */
export const ActionRequestBehaviorSchema = z
  .object({
    type: z.literal('action_request').describe(
      '客户端内部交互类型。im/v1/messages 不接受，发消息请用 callback',
    ),
    value: z
      .record(z.string(), z.unknown())
      .describe('回传给服务端的自定义数据对象；用简洁业务字段即可'),
  })
  .describe('请求服务端动作交互（type = action_request）');

export type ActionRequestBehavior = z.infer<
  typeof ActionRequestBehaviorSchema
>;

/**
 * 客户端消息交互（客户端 ActionType.ClientMessage）。
 * 客户端仅按 type === "client_message" 分派并过滤，其载荷字段结构无法从
 * 客户端提取物中确证，这里用宽松结构：value 透传 + 允许额外字段，避免误拒合法卡片。
 */
export const ClientMessageBehaviorSchema = z
  .object({
    type: z.literal('client_message').describe(
      '交互类型，固定为 client_message',
    ),
    value: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('客户端消息载荷；字段结构以客户端实际为准，按 value 透传'),
  })
  .passthrough()
  .describe('客户端消息交互（type = client_message）；载荷字段以客户端实际为准');

export type ClientMessageBehavior = z.infer<typeof ClientMessageBehaviorSchema>;

/**
 * 回传交互。开放平台发消息（im/v1/messages）的卡片 JSON 使用这个 type。
 *
 * value 通常为 object；服务端也接受字符串载荷（发 `value: "str_value"` 的
 * 卡片可以发出），读回时服务端会回显该字符串，因此这里两者都收。
 */
export const CallbackBehaviorSchema = z
  .object({
    type: z.literal('callback').describe('交互类型，固定为 callback'),
    value: z
      .union([z.record(z.string(), z.unknown()), z.string()])
      .describe('回传给服务端的自定义数据；通常为对象，也接受字符串载荷'),
  })
  .describe('请求回调交互（type = callback）');

export type CallbackBehavior = z.infer<typeof CallbackBehaviorSchema>;

/**
 * 组件交互行为。使用 type 作为判别字段。
 * 发消息用 open_url / callback。action_request、client_message 是客户端内部枚举，解析时仍接受。
 */
export const BehaviorSchema = z
  .discriminatedUnion('type', [
    OpenUrlBehaviorSchema,
    ActionRequestBehaviorSchema,
    ClientMessageBehaviorSchema,
    CallbackBehaviorSchema,
  ])
  .describe(
    '组件交互行为：open_url（打开链接）/ callback（请求服务端动作）；action_request、client_message 为客户端内部枚举',
  );

export type Behavior = z.infer<typeof BehaviorSchema>;

/** behaviors 数组 */
export const BehaviorsSchema = z
  .array(BehaviorSchema)
  .describe('组件交互行为列表；可同时配置跳转与回调');

export type Behaviors = z.infer<typeof BehaviorsSchema>;
