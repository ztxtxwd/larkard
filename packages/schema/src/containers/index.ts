import { z } from 'zod';

import { BehaviorsSchema } from '../common/behavior.js';
import { ConfirmSchema } from '../common/confirm.js';
import {
  ColorSchema,
  DirectionSchema,
  ElementIdSchema,
  HorizontalAlignSchema,
  SpacingTokenSchema,
  SpacingValueSchema,
  VerticalAlignSchema,
} from '../common/enums.js';
import { IconSchema } from '../common/icon.js';
import { MarkdownTextObjectSchema, TipsTextSchema } from '../common/text.js';
import { MultiUrlSchema } from '../common/url.js';
import { getElementSchema } from '../element-ref.js';

/** 飞书回读 custom_background_style：#RRGGBBAA 或 rgba 字符串 */
const CustomBackgroundStyleSchema = z
  .object({
    light_mode: z.string().describe('浅色主题颜色（#RRGGBBAA 或 rgba）'),
    dark_mode: z.string().describe('深色主题颜色（#RRGGBBAA 或 rgba）'),
  })
  .describe('列背景自定义色（飞书存储/回读形态）');

/** 列/分栏点击跳转 */
const ColumnActionSchema = z
  .object({
    multi_url: MultiUrlSchema.optional().describe('点击跳转的多端链接'),
  })
  .describe('列/分栏点击跳转配置');

/**
 * 分栏中的列（column）。仅嵌套在 column_set 内，不进入 body Element 联合。
 */
export const ColumnSchema = z
  .object({
    tag: z.literal('column').describe('组件标签，固定为 column'),
    element_id: ElementIdSchema.optional().describe('组件唯一标识'),
    background_style: z
      .string()
      .optional()
      .describe(
        '列背景样式/颜色。并排指标/KPI 列默认 grey-50；勿逐列换彩虹色。彩色 -50 仅作少量点缀',
      ),
    /** 飞书存储/回读时展开自定义 RGBA 的 hex 形态；编写时优先 background_style + config.style.color */
    custom_background_style: CustomBackgroundStyleSchema.optional().describe(
      '列背景自定义色（飞书回读形态，#RRGGBBAA 或 rgba）。编写卡片时用 background_style 引用 config.style.color 的 cus-N',
    ),
    /** auto / weighted / [16,600]px */
    width: z
      .string()
      .optional()
      .describe(
        '列宽：auto / weighted / [16,600]px。并排按钮须与按钮 width 配套：① 满宽均分 → weighted + weight:1，按钮 width:fill；② 内容自适应 → auto，按钮不写 width。图标行：auto 放图标 + weighted 放文本',
      ),
    /** width 为 weighted 时的权重，1–5 */
    weight: z
      .number()
      .int()
      .min(1)
      .max(5)
      .optional()
      .describe('width 为 weighted 时的权重，取值 1–5；等宽并排常用 1'),
    horizontal_spacing: SpacingTokenSchema.optional().describe(
      '列内子组件水平间距',
    ),
    horizontal_align: HorizontalAlignSchema.optional().describe(
      '列内子组件水平对齐',
    ),
    vertical_align: VerticalAlignSchema.optional().describe(
      '列内子组件垂直对齐；图标+文本行推荐 center',
    ),
    vertical_spacing: SpacingTokenSchema.optional().describe(
      '列内子组件垂直间距',
    ),
    direction: DirectionSchema.optional().describe('列内子组件排列方向'),
    padding: SpacingValueSchema.optional().describe(
      '列内边距；并排指标列默认 "8px 12px 8px 12px"',
    ),
    margin: SpacingValueSchema.optional().describe('列外边距'),
    action: ColumnActionSchema.optional().describe('列点击跳转配置'),
    /** 列内嵌组件；不支持 form、table */
    elements: z
      .lazy(() => z.array(getElementSchema()))
      .optional()
      .describe(
        '列内嵌组件列表；不支持 form、table（二者必须在 body.elements 根级）、交互容器（interactive_container）',
      ),
  })
  .describe(
    '分栏中的列（column）。KPI 列默认 background_style=grey-50 + padding；按钮宽度必须与列宽模式配套',
  );

export type Column = z.infer<typeof ColumnSchema>;

/**
 * 分栏组件（column_set）。
 */
export const ColumnSetSchema = z
  .object({
    tag: z.literal('column_set').describe('组件标签，固定为 column_set'),
    columns: z.array(ColumnSchema).describe('分栏中的列列表'),
    element_id: ElementIdSchema.optional().describe('组件唯一标识'),
    margin: SpacingValueSchema.optional().describe('组件外边距'),
    horizontal_spacing: SpacingTokenSchema.optional().describe('列间距'),
    horizontal_align: HorizontalAlignSchema.optional().describe(
      '分栏内列的水平对齐',
    ),
    flex_mode: z
      .enum(['none', 'stretch', 'flow', 'bisect', 'trisect'])
      .optional()
      .describe(
        '窄屏自适应模式：none / stretch / flow / bisect / trisect，默认 none',
      ),
    background_style: z.string().optional().describe('分栏背景样式/颜色'),
    action: ColumnActionSchema.optional().describe('分栏点击跳转配置'),
  })
  .describe(
    '分栏组件（column_set）。并排信息等宽排列；图标行用 auto+weighted 两列且 vertical_align=center',
  );

export type ColumnSet = z.infer<typeof ColumnSetSchema>;

/**
 * 表单容器（form）。
 * 仅可出现在卡片 body 根级；禁止包进 column / interactive_container 等容器。
 * 内部必须包含 form_action_type 为 submit 的按钮。
 */
export const FormSchema = z
  .object({
    tag: z.literal('form').describe('组件标签，固定为 form'),
    /** 表单标识，卡片内唯一 */
    name: z.string().describe('表单标识，卡片内唯一'),
    elements: z
      .lazy(() => z.array(getElementSchema()))
      .describe('表单内嵌组件列表'),
    element_id: ElementIdSchema.optional().describe('组件唯一标识'),
    direction: DirectionSchema.optional().describe('表单内子组件排列方向'),
    margin: SpacingValueSchema.optional().describe('组件外边距'),
    padding: SpacingValueSchema.optional().describe('组件内边距'),
    horizontal_spacing: SpacingTokenSchema.optional().describe(
      '表单内子组件水平间距',
    ),
    horizontal_align: HorizontalAlignSchema.optional().describe(
      '表单内子组件水平对齐',
    ),
    vertical_align: VerticalAlignSchema.optional().describe(
      '表单内子组件垂直对齐',
    ),
    vertical_spacing: SpacingTokenSchema.optional().describe(
      '表单内子组件垂直间距',
    ),
  })
  .describe(
    '表单容器（form）：必须在 body.elements 根级，禁止包进 column / interactive_container；内需含 submit 按钮',
  );

export type Form = z.infer<typeof FormSchema>;

/**
 * 交互容器（interactive_container）。
 * 仅用于整块可点击、营销通栏、并排 KPI 等明确需要弱卡片感的场景；默认不要给每个文案块套带边框容器。
 */
export const InteractiveContainerSchema = z
  .object({
    tag: z
      .literal('interactive_container')
      .describe('组件标签，固定为 interactive_container'),
    behaviors: BehaviorsSchema.optional().describe(
      '表单外必填。纯展示弱卡片感时设 disabled:true 且不要依赖点击；真正可点才配 behaviors',
    ),
    elements: z
      .lazy(() => z.array(getElementSchema()))
      .describe('容器内嵌组件列表；不支持 form、table'),
    width: z.string().optional().describe('容器宽度'),
    height: z.string().optional().describe('容器高度'),
    element_id: ElementIdSchema.optional().describe('组件唯一标识'),
    margin: SpacingValueSchema.optional().describe('组件外边距'),
    direction: DirectionSchema.optional().describe('容器内子组件排列方向'),
    horizontal_spacing: SpacingTokenSchema.optional().describe(
      '容器内子组件水平间距',
    ),
    horizontal_align: HorizontalAlignSchema.optional().describe(
      '容器内子组件水平对齐',
    ),
    vertical_spacing: SpacingTokenSchema.optional().describe(
      '容器内子组件垂直间距',
    ),
    vertical_align: VerticalAlignSchema.optional().describe(
      '容器内子组件垂直对齐',
    ),
    background_style: z
      .string()
      .optional()
      .describe(
        '容器背景样式/颜色。弱分组可用 grey-50/grey-100；勿大面积色系-50+色系-100 边框铺内容区',
      ),
    has_border: z
      .boolean()
      .optional()
      .describe('是否展示边框，默认 false；默认不要开边框墙'),
    border_color: ColorSchema.optional().describe('边框颜色'),
    corner_radius: z.string().optional().describe('圆角半径'),
    padding: SpacingValueSchema.optional().describe('组件内边距'),
    hover_tips: TipsTextSchema.optional().describe('悬浮提示'),
    disabled: z
      .boolean()
      .optional()
      .describe(
        '是否禁用交互，默认 false。纯展示容器写 true 且不配有效点击行为',
      ),
    disabled_tips: TipsTextSchema.optional().describe('禁用时的悬浮提示'),
    confirm: ConfirmSchema.optional().describe('二次确认弹窗配置'),
  })
  .describe(
    '交互容器（interactive_container）：仅用于整块可点击/营销通栏/并排 KPI 等；默认 has_border=false，勿给每个文案块套带边框容器',
  );

export type InteractiveContainer = z.infer<typeof InteractiveContainerSchema>;

const CollapsiblePanelHeaderSchema = z
  .object({
    title: MarkdownTextObjectSchema.optional().describe('面板标题'),
    background_color: ColorSchema.optional().describe('标题区背景色'),
    /** fill / auto / auto_when_fold */
    width: z
      .string()
      .optional()
      .describe('标题区宽度：fill / auto / auto_when_fold'),
    vertical_align: VerticalAlignSchema.optional().describe(
      '标题区内垂直对齐',
    ),
    padding: SpacingValueSchema.optional().describe('标题区内边距'),
    icon: IconSchema.optional().describe(
      '展开/折叠图标；推荐 down-bold_outlined，置右',
    ),
    icon_position: z
      .enum(['left', 'right', 'follow_text'])
      .optional()
      .describe('图标位置：left / right / follow_text；推荐 right'),
    icon_expanded_angle: z
      .union([
        z.literal(-180).describe('展开态图标旋转 -180°'),
        z.literal(-90).describe('展开态图标旋转 -90°'),
        z.literal(90).describe('展开态图标旋转 90°'),
        z.literal(180).describe('展开态图标旋转 180°'),
      ])
      .optional()
      .describe('展开状态下图标旋转角度；推荐 -180'),
    /** JSON 示例中出现，字段表未正式列出 */
    position: z
      .string()
      .optional()
      .describe('标题位置（示例字段，字段表未正式列出）'),
  })
  .describe(
    '折叠面板标题区；推荐 icon=down-bold_outlined、icon_position=right、icon_expanded_angle=-180',
  );

/**
 * 折叠面板（collapsible_panel）。
 */
export const CollapsiblePanelSchema = z
  .object({
    tag: z
      .literal('collapsible_panel')
      .describe('组件标签，固定为 collapsible_panel'),
    header: CollapsiblePanelHeaderSchema.describe('折叠面板标题区'),
    expanded: z
      .boolean()
      .optional()
      .describe('是否默认展开，默认 false'),
    element_id: ElementIdSchema.optional().describe('组件唯一标识'),
    margin: SpacingValueSchema.optional().describe('组件外边距'),
    direction: DirectionSchema.optional().describe('面板内子组件排列方向'),
    horizontal_spacing: SpacingTokenSchema.optional().describe(
      '面板内子组件水平间距',
    ),
    horizontal_align: HorizontalAlignSchema.optional().describe(
      '面板内子组件水平对齐',
    ),
    vertical_spacing: SpacingTokenSchema.optional().describe(
      '面板内子组件垂直间距',
    ),
    vertical_align: VerticalAlignSchema.optional().describe(
      '面板内子组件垂直对齐',
    ),
    padding: SpacingValueSchema.optional().describe('面板内边距'),
    background_color: ColorSchema.optional().describe(
      '面板背景色；推荐 bg-white / white',
    ),
    border: z
      .object({
        color: ColorSchema.optional().describe('边框颜色；推荐 grey-200'),
        corner_radius: z.string().optional().describe('边框圆角；推荐 8px'),
      })
      .optional()
      .describe('面板边框样式；推荐 { color: "grey-200", corner_radius: "8px" }'),
    elements: z
      .lazy(() => z.array(getElementSchema()))
      .optional()
      .describe('面板折叠区域内嵌组件列表'),
  })
  .describe(
    '折叠面板（collapsible_panel）。推荐：白底 + grey-200/8px 边框 + 右侧 down-bold_outlined + icon_expanded_angle=-180',
  );

export type CollapsiblePanel = z.infer<typeof CollapsiblePanelSchema>;
