import { z } from 'zod';

import {
  DirectionSchema,
  HorizontalAlignSchema,
  I18nStringMapSchema,
  SpacingTokenSchema,
  SpacingValueSchema,
  TextSizeSchema,
  VerticalAlignSchema,
  WidthModeSchema,
} from './common/enums.js';
import { getElementSchema } from './element-ref.js';

/**
 * 流式更新频率/步长的分端配置。
 */
const StreamingPlatformNumberSchema = z
  .object({
    default: z.number().optional().describe('默认端数值'),
    android: z.number().optional().describe('Android 端数值'),
    ios: z.number().optional().describe('iOS 端数值'),
    pc: z.number().optional().describe('PC 端数值'),
  })
  .describe('按端区分的数值配置（default / android / ios / pc）');

/**
 * 流式更新配置。
 */
export const StreamingConfigSchema = z
  .object({
    print_frequency_ms: StreamingPlatformNumberSchema.optional().describe(
      '流式更新打印频率，单位 ms',
    ),
    print_step: StreamingPlatformNumberSchema.optional().describe(
      '流式更新每次打印的字符数',
    ),
    print_strategy: z
      .enum(['fast', 'delay'])
      .optional()
      .describe('流式更新策略：fast / delay'),
  })
  .describe('流式更新相关配置（streaming_config）');

export type StreamingConfig = z.infer<typeof StreamingConfigSchema>;

/**
 * 卡片摘要（聊天栏预览文案）。
 */
export const SummarySchema = z
  .object({
    content: z
      .string()
      .optional()
      .describe('摘要文案；开启流式更新时默认为「生成中」'),
    i18n_content: I18nStringMapSchema.optional().describe('摘要多语言配置'),
  })
  .describe('卡片摘要信息，展示在客户端聊天栏消息预览中');

export type Summary = z.infer<typeof SummarySchema>;

/**
 * 自定义字号（分别配置 PC / Mobile，并可选 default 兜底）。
 * 各端取值可为官方枚举或 10px–40px。
 */
export const CustomTextSizeSchema = z
  .object({
    default: TextSizeSchema.optional().describe(
      '旧版客户端无法差异化配置时的兜底字号',
    ),
    pc: TextSizeSchema.describe('桌面端字号（官方枚举或 10px–40px）'),
    mobile: TextSizeSchema.describe('移动端字号（官方枚举或 10px–40px）'),
  })
  .describe('自定义字号（PC / Mobile / 可选 default）');

export type CustomTextSize = z.infer<typeof CustomTextSizeSchema>;

/**
 * 自定义颜色（浅色/深色主题 RGBA）。
 */
export const CustomColorSchema = z
  .object({
    light_mode: z.string().describe('浅色主题下的 RGBA 颜色'),
    dark_mode: z.string().describe('深色主题下的 RGBA 颜色'),
  })
  .describe('自定义颜色（浅色 / 深色主题）');

export type CustomColor = z.infer<typeof CustomColorSchema>;

/**
 * 卡片全局行为配置（config）。
 */
export const ConfigSchema = z
  .object({
    streaming_mode: z
      .boolean()
      .optional()
      .describe('是否处于流式更新模式，默认 false'),
    streaming_config: StreamingConfigSchema.optional().describe('流式更新配置'),
    summary: SummarySchema.optional().describe('卡片摘要信息'),
    locales: z
      .array(z.string())
      .optional()
      .describe('指定生效语言列表；配置后仅列表内语言生效'),
    enable_forward: z
      .boolean()
      .optional()
      .describe('是否允许转发卡片，默认 true'),
    update_multi: z
      .boolean()
      .optional()
      .describe(
        '是否为共享卡片，默认 true。JSON 2.0 只能为 true（或不写）；禁止写 false',
      ),
    width_mode: WidthModeSchema.optional().describe('卡片宽度模式'),
    use_custom_translation: z
      .boolean()
      .optional()
      .describe('是否使用自定义翻译数据，默认 false'),
    enable_forward_interaction: z
      .boolean()
      .optional()
      .describe('转发后的卡片是否仍支持回传交互，默认 false'),
    style: z
      .object({
        text_size: z
          .record(z.string(), CustomTextSizeSchema)
          .optional()
          .describe('自定义字号映射，可在组件中引用对应 key'),
        color: z
          .record(z.string(), CustomColorSchema)
          .optional()
          .describe('自定义颜色映射，可在组件中引用对应 key'),
      })
      .optional()
      .describe('自定义字号与颜色样式'),
  })
  .describe('卡片全局行为配置（config）');

export type Config = z.infer<typeof ConfigSchema>;

/**
 * 卡片正文（body）。
 */
export const BodySchema = z
  .object({
    elements: z
      .lazy(() => z.array(getElementSchema()))
      .describe(
        '正文组件列表。默认直接放 markdown / column_set / hr / form / table / img / chart / button；form 与 table 必须在此根级。层次靠字重、留白、浅灰弱底与偶尔一条 hr，不靠满屏色块或边框墙',
      ),
    direction: DirectionSchema.optional().describe(
      '正文内组件排列方向，默认 vertical',
    ),
    padding: SpacingValueSchema.optional().describe('正文内边距'),
    horizontal_spacing: SpacingTokenSchema.optional().describe('正文水平间距'),
    horizontal_align: HorizontalAlignSchema.optional().describe(
      '正文水平对齐，默认 left',
    ),
    vertical_spacing: SpacingTokenSchema.optional().describe('正文垂直间距'),
    vertical_align: VerticalAlignSchema.optional().describe(
      '正文垂直对齐，默认 top',
    ),
  })
  .describe(
    '卡片正文（body）。白底可读；form/table 仅允许出现在 elements 根级',
  );

export type Body = z.infer<typeof BodySchema>;
