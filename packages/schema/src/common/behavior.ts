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
 * 请求服务端动作交互（客户端 ActionType.ActionRequest）。
 * 客户端运行时按 e.type === "action_request" 分派；value 为回传服务端的自定义数据对象。
 */
export const ActionRequestBehaviorSchema = z
  .object({
    type: z.literal('action_request').describe(
      '交互类型，固定为 action_request',
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
 * 回传交互（旧 wire 写法）。
 * @deprecated 客户端 ActionType 枚举为 action_request / client_message / open_url，
 * 带引号 "callback" 在客户端 chunk 中 0 命中。是否存在 wire JSON callback →
 * 内部 action_request 的归一化层无法从压缩代码确证，故保留兼容，新卡片请改用
 * action_request。
 *
 * value 需为 object；开放平台 SDK 仅支持 object。
 */
export const CallbackBehaviorSchema = z
  .object({
    type: z.literal('callback').describe(
      '交互类型，固定为 callback（@deprecated，新卡片请用 action_request）',
    ),
    value: z
      .record(z.string(), z.unknown())
      .describe('回传给服务端的自定义数据对象；用简洁业务字段即可'),
  })
  .describe(
    '请求回调交互（type = callback，@deprecated；新卡片请用 action_request）',
  );

export type CallbackBehavior = z.infer<typeof CallbackBehaviorSchema>;

/**
 * 组件交互行为。使用 type 作为判别字段。
 * 客户端 ActionType 共三种：action_request / client_message / open_url；
 * callback 为旧 wire 写法，保留兼容（归一化层不可见，先不拒绝）。
 */
export const BehaviorSchema = z
  .discriminatedUnion('type', [
    OpenUrlBehaviorSchema,
    ActionRequestBehaviorSchema,
    ClientMessageBehaviorSchema,
    CallbackBehaviorSchema,
  ])
  .describe(
    '组件交互行为：open_url（打开链接）/ action_request（请求服务端动作）/ client_message（客户端消息）；callback 为旧写法，兼容保留',
  );

export type Behavior = z.infer<typeof BehaviorSchema>;

/** behaviors 数组 */
export const BehaviorsSchema = z
  .array(BehaviorSchema)
  .describe('组件交互行为列表；可同时配置跳转与回调');

export type Behaviors = z.infer<typeof BehaviorsSchema>;
