import { z } from 'zod';

import { BehaviorsSchema } from '../common/behavior.js';
import { ConfirmSchema } from '../common/confirm.js';
import {
  ElementIdSchema,
  InteractiveWidthSchema,
  SpacingValueSchema,
} from '../common/enums.js';
import { IconSchema } from '../common/icon.js';
import { TipsTextSchema } from '../common/text.js';


/**
 * 按钮组件（button）。
 * 表单内使用时需配置 name 与 form_action_type。
 *
 * behaviors：表单外必填（open_url / callback）；进入 form 后可省略（FeishuCardSchema 上下文校验）。
 * 不要用 1.0 的 multi_url / 顶层 value。
 */
export const ButtonSchema = z
  .object({
    tag: z.literal('button').describe('组件标签，固定为 button'),
    /** 交互行为；表单外必填，form 内可省略 */
    behaviors: BehaviorsSchema.optional().describe(
      '表单外必填（open_url / callback）；进入 form 后可省略。禁止用 multi_url 或顶层 value',
    ),
    element_id: ElementIdSchema.optional().describe('组件唯一标识'),
    margin: SpacingValueSchema.optional().describe('组件外边距'),
    type: z
      .enum([
        'default',
        'primary',
        'danger',
        'text',
        'primary_text',
        'danger_text',
        'primary_filled',
        'danger_filled',
        'laser',
      ])
      .optional()
      .describe(
        '按钮样式类型，默认 default。主操作优先 primary_filled；次按钮用 default / primary',
      ),
    size: z
      .enum(['tiny', 'small', 'medium', 'large'])
      .optional()
      .describe('按钮尺寸，默认 medium'),
    width: InteractiveWidthSchema.optional().describe(
      '按钮宽度。并排满宽均分时用 fill（列须 width=weighted）；内容自适应时不写 width（列须 width=auto）。禁止 weighted 列包默认宽按钮',
    ),
    text: z
      .object({
        tag: z.literal('plain_text').describe('文本类型标签，固定为 plain_text'),
        content: z
          .string()
          .max(100)
          .describe('按钮文案，最多 100 字符；应直接说明动作'),
      })
      .optional()
      .describe('按钮文案'),
    icon: IconSchema.optional().describe('按钮前缀图标'),
    hover_tips: TipsTextSchema.optional().describe('悬浮提示'),
    disabled: z.boolean().optional().describe('是否禁用按钮，默认 false'),
    disabled_tips: TipsTextSchema.optional().describe('禁用时的悬浮提示'),
    confirm: ConfirmSchema.optional().describe('二次确认弹窗配置'),
    /** 表单内必填：表单项标识，卡片内唯一 */
    name: z
      .string()
      .optional()
      .describe('表单内必填：表单项标识，卡片内唯一'),
    /** 表单内提交/重置按钮必填 */
    form_action_type: z
      .enum(['submit', 'reset'])
      .optional()
      .describe('表单内提交/重置按钮必填：submit / reset'),
    required: z
      .boolean()
      .optional()
      .describe('是否必填（表单场景），默认 false'),
    /** @deprecated 历史回传字段；JSON 2.0 请用 behaviors */
    value: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('历史回传字段，已废弃；JSON 2.0 请用 behaviors'),
    /** @deprecated 历史交互类型字段 */
    action_type: z
      .enum(['link', 'request', 'multi', 'form_submit', 'form_reset'])
      .optional()
      .describe('历史交互类型字段，已废弃'),
  })
  .describe(
    '按钮组件（button）。单按钮可直接放 body.elements；并排时列宽与按钮 width 必须整行配套一致',
  );

export type Button = z.infer<typeof ButtonSchema>;

/**
 * 输入框组件（input）。
 */
export const InputSchema = z
  .object({
    tag: z.literal('input').describe('组件标签，固定为 input'),
    element_id: ElementIdSchema.optional().describe('组件唯一标识'),
    margin: SpacingValueSchema.optional().describe('组件外边距'),
    name: z
      .string()
      .optional()
      .describe('表单项标识，卡片内唯一；表单内使用时必填'),
    required: z.boolean().optional().describe('是否必填，默认 false'),
    disabled: z.boolean().optional().describe('是否禁用，默认 false'),
    disabled_tips: TipsTextSchema.optional().describe('禁用时的悬浮提示'),
    placeholder: TipsTextSchema.optional().describe('占位提示文案'),
    default_value: z.string().optional().describe('输入框默认值'),
    width: InteractiveWidthSchema.optional().describe('输入框宽度'),
    behaviors: BehaviorsSchema.optional().describe('交互行为列表'),
    max_length: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('最大输入长度，取值 1–1000，默认 1000'),
    input_type: z
      .enum(['text', 'multiline_text', 'password'])
      .optional()
      .describe('输入类型：text / multiline_text / password，默认 text'),
    show_icon: z
      .boolean()
      .optional()
      .describe('是否展示前缀图标（password 类型），默认 true'),
    rows: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('多行输入的默认行数'),
    auto_resize: z
      .boolean()
      .optional()
      .describe('多行输入是否随内容自动增高'),
    max_rows: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('多行输入自动增高的最大行数'),
    label: TipsTextSchema.optional().describe('输入框标签文案'),
    label_position: z
      .enum(['top', 'left'])
      .optional()
      .describe('标签位置：top / left，默认 top'),
    /** @deprecated 历史回传字段 */
    value: z
      .union([z.string(), z.record(z.string(), z.unknown())])
      .optional()
      .describe('历史回传字段，已废弃'),
    confirm: ConfirmSchema.optional().describe('二次确认弹窗配置'),
  })
  .describe('输入框组件（input），如果需要checkbox，请使用checker组件');

export type Input = z.infer<typeof InputSchema>;

/**
 * 折叠按钮组（overflow）。
 */
export const OverflowSchema = z
  .object({
    tag: z.literal('overflow').describe('组件标签，固定为 overflow'),
    options: z
      .array(
        z
          .object({
            text: TipsTextSchema.optional().describe('选项文案'),
            multi_url: z
              .object({
                url: z.string().optional().describe('默认跳转链接'),
                pc_url: z.string().optional().describe('PC 端跳转链接'),
                ios_url: z.string().optional().describe('iOS 端跳转链接'),
                android_url: z
                  .string()
                  .optional()
                  .describe('Android 端跳转链接'),
              })
              .optional()
              .describe('选项多端跳转链接'),
            value: z.string().optional().describe('选项回传值'),
          })
          .describe('折叠按钮组选项'),
      )
      .describe('折叠按钮组选项列表'),
    element_id: ElementIdSchema.optional().describe('组件唯一标识'),
    margin: SpacingValueSchema.optional().describe('组件外边距'),
    width: InteractiveWidthSchema.optional().describe('组件宽度'),
    name: z
      .string()
      .optional()
      .describe('表单项标识，卡片内唯一；表单内使用时必填'),
    required: z.boolean().optional().describe('是否必填，默认 false'),
    disabled: z.boolean().optional().describe('是否禁用，默认 false'),
    disabled_tips: TipsTextSchema.optional().describe('禁用时的悬浮提示'),
    text: TipsTextSchema.optional().describe('折叠按钮组触发器文案'),
    behaviors: BehaviorsSchema.optional().describe('交互行为列表'),
    confirm: ConfirmSchema.optional().describe('二次确认弹窗配置'),
    value: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('历史回传字段'),
  })
  .describe('折叠按钮组（overflow）');

export type Overflow = z.infer<typeof OverflowSchema>;

const SelectOptionSchema = z
  .object({
    text: z
      .object({
        tag: z.literal('plain_text').describe('文本类型标签，固定为 plain_text'),
        content: z.string().describe('选项文案'),
      })
      .describe('选项展示文案'),
    value: z.string().describe('选项回传值'),
    icon: IconSchema.optional().describe('选项前缀图标'),
  })
  .describe('下拉选择选项');

/**
 * 下拉选择 - 单选（select_static）。
 */
export const SelectStaticSchema = z
  .object({
    tag: z.literal('select_static').describe('组件标签，固定为 select_static'),
    behaviors: BehaviorsSchema.optional().describe(
      '表单外必填；进入 form 后可省略（交互随 submit 提交）',
    ),
    element_id: ElementIdSchema.optional().describe('组件唯一标识'),
    margin: SpacingValueSchema.optional().describe('组件外边距'),
    type: z
      .enum(['default', 'text'])
      .optional()
      .describe('边框样式：default（带边框）/ text（无边框），默认 default'),
    name: z
      .string()
      .optional()
      .describe('表单项标识，卡片内唯一；表单内使用时必填'),
    required: z.boolean().optional().describe('是否必填，默认 false'),
    disabled: z.boolean().optional().describe('是否禁用，默认 false'),
    disabled_tips: TipsTextSchema.optional().describe('禁用时的悬浮提示'),
    initial_option: z
      .string()
      .optional()
      .describe('默认选中项的 value'),
    initial_index: z
      .number()
      .int()
      .optional()
      .describe('默认选中项的下标（从 0 开始）'),
    placeholder: TipsTextSchema.optional().describe('占位提示文案'),
    width: InteractiveWidthSchema.optional().describe('组件宽度'),
    options: z.array(SelectOptionSchema).optional().describe('选项列表'),
    confirm: ConfirmSchema.optional().describe('二次确认弹窗配置'),
    value: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('历史回传字段'),
  })
  .describe('下拉选择 - 单选（select_static）');

export type SelectStatic = z.infer<typeof SelectStaticSchema>;

/**
 * 下拉选择 - 多选（multi_select_static）。必须放在表单容器内。
 */
export const MultiSelectStaticSchema = z
  .object({
    tag: z
      .literal('multi_select_static')
      .describe('组件标签，固定为 multi_select_static'),
    name: z.string().describe('表单项标识，卡片内唯一'),
    behaviors: BehaviorsSchema.optional().describe(
      '表单外必填；进入 form 后可省略（交互随 submit 提交）',
    ),
    element_id: ElementIdSchema.optional().describe('组件唯一标识'),
    margin: SpacingValueSchema.optional().describe('组件外边距'),
    type: z
      .enum(['default', 'text'])
      .optional()
      .describe('边框样式：default（带边框）/ text（无边框），默认 default'),
    required: z.boolean().optional().describe('是否必填，默认 false'),
    disabled: z.boolean().optional().describe('是否禁用，默认 false'),
    disabled_tips: TipsTextSchema.optional().describe('禁用时的悬浮提示'),
    placeholder: TipsTextSchema.optional().describe('占位提示文案'),
    width: InteractiveWidthSchema.optional().describe('组件宽度'),
    selected_values: z
      .array(z.string())
      .optional()
      .describe('默认选中的选项 value 列表'),
    options: z.array(SelectOptionSchema).optional().describe('选项列表'),
    confirm: ConfirmSchema.optional().describe('二次确认弹窗配置'),
    value: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('历史回传字段'),
  })
  .describe('下拉选择 - 多选（multi_select_static）');

export type MultiSelectStatic = z.infer<typeof MultiSelectStaticSchema>;

/**
 * 人员选择 - 单选（select_person）。
 */
export const SelectPersonSchema = z
  .object({
    tag: z.literal('select_person').describe('组件标签，固定为 select_person'),
    behaviors: BehaviorsSchema.optional().describe(
      '表单外必填；进入 form 后可省略（交互随 submit 提交）',
    ),
    element_id: ElementIdSchema.optional().describe('组件唯一标识'),
    margin: SpacingValueSchema.optional().describe('组件外边距'),
    type: z
      .enum(['default', 'text'])
      .optional()
      .describe('边框样式：default（带边框）/ text（无边框），默认 default'),
    name: z
      .string()
      .optional()
      .describe('表单项标识，卡片内唯一；表单内使用时必填'),
    required: z.boolean().optional().describe('是否必填，默认 false'),
    disabled: z.boolean().optional().describe('是否禁用，默认 false'),
    disabled_tips: TipsTextSchema.optional().describe('禁用时的悬浮提示'),
    initial_option: z
      .string()
      .optional()
      .describe('默认选中人员的 ID'),
    initial_user: z
      .string()
      .optional()
      .describe('默认选中人员（历史字段，等同 initial_option）'),
    placeholder: TipsTextSchema.optional().describe('占位提示文案'),
    width: InteractiveWidthSchema.optional().describe('组件宽度'),
    options: z
      .array(
        z
          .object({
            value: z
              .string()
              .optional()
              .describe('可选人员 ID；省略则候选范围为全部人员'),
          })
          .describe('人员候选选项'),
      )
      .optional()
      .describe('可选人员候选列表；省略则不限制候选范围'),
    confirm: ConfirmSchema.optional().describe('二次确认弹窗配置'),
    value: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('历史回传字段'),
  })
  .describe('人员选择 - 单选（select_person）');

export type SelectPerson = z.infer<typeof SelectPersonSchema>;

/**
 * 人员选择 - 多选（multi_select_person）。必须放在表单容器内。
 */
export const MultiSelectPersonSchema = z
  .object({
    tag: z
      .literal('multi_select_person')
      .describe('组件标签，固定为 multi_select_person'),
    name: z.string().describe('表单项标识，卡片内唯一'),
    behaviors: BehaviorsSchema.optional().describe(
      '表单外必填；进入 form 后可省略（交互随 submit 提交）',
    ),
    element_id: ElementIdSchema.optional().describe('组件唯一标识'),
    margin: SpacingValueSchema.optional().describe('组件外边距'),
    type: z
      .enum(['default', 'text'])
      .optional()
      .describe('边框样式：default（带边框）/ text（无边框），默认 default'),
    required: z.boolean().optional().describe('是否必填，默认 false'),
    disabled: z.boolean().optional().describe('是否禁用，默认 false'),
    disabled_tips: TipsTextSchema.optional().describe('禁用时的悬浮提示'),
    placeholder: TipsTextSchema.optional().describe('占位提示文案'),
    width: InteractiveWidthSchema.optional().describe('组件宽度'),
    selected_values: z
      .array(z.string())
      .optional()
      .describe('默认选中的人员 ID 列表'),
    options: z
      .array(
        z
          .object({
            value: z
              .string()
              .optional()
              .describe('可选人员 ID；省略则候选范围为全部人员'),
          })
          .describe('人员候选选项'),
      )
      .optional()
      .describe('可选人员候选列表；省略则不限制候选范围'),
    confirm: ConfirmSchema.optional().describe('二次确认弹窗配置'),
    value: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('历史回传字段'),
  })
  .describe('人员选择 - 多选（multi_select_person）');

export type MultiSelectPerson = z.infer<typeof MultiSelectPersonSchema>;

/**
 * 日期选择器（date_picker）。
 */
export const DatePickerSchema = z
  .object({
    tag: z.literal('date_picker').describe('组件标签，固定为 date_picker'),
    behaviors: BehaviorsSchema.optional().describe(
      '表单外必填；进入 form 后可省略（交互随 submit 提交）',
    ),
    element_id: ElementIdSchema.optional().describe('组件唯一标识'),
    margin: SpacingValueSchema.optional().describe('组件外边距'),
    name: z
      .string()
      .optional()
      .describe('表单项标识，卡片内唯一；表单内使用时必填'),
    required: z.boolean().optional().describe('是否必填，默认 false'),
    disabled: z.boolean().optional().describe('是否禁用，默认 false'),
    disabled_tips: TipsTextSchema.optional().describe('禁用时的悬浮提示'),
    width: InteractiveWidthSchema.optional().describe('组件宽度'),
    /** yyyy-MM-dd */
    initial_date: z
      .string()
      .optional()
      .describe('默认选中日期，格式 yyyy-MM-dd'),
    initial_datetime: z
      .string()
      .optional()
      .describe('兼容字段：默认日期时间'),
    initial_time: z
      .string()
      .optional()
      .describe('兼容字段：默认时间'),
    placeholder: TipsTextSchema.optional().describe('占位提示文案'),
    confirm: ConfirmSchema.optional().describe('二次确认弹窗配置'),
    /** @deprecated 历史回传字段 */
    value: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('历史回传字段，已废弃'),
  })
  .describe('日期选择器（date_picker）');

export type DatePicker = z.infer<typeof DatePickerSchema>;

/**
 * 日期选择器别名（picker_date）。与 date_picker 字段相同，官方 schema 并存。
 */
export const PickerDateSchema = z
  .object({
    tag: z.literal('picker_date').describe('组件标签，固定为 picker_date'),
    behaviors: BehaviorsSchema.optional().describe(
      '表单外必填；进入 form 后可省略（交互随 submit 提交）',
    ),
    element_id: ElementIdSchema.optional().describe('组件唯一标识'),
    margin: SpacingValueSchema.optional().describe('组件外边距'),
    name: z
      .string()
      .optional()
      .describe('表单项标识，卡片内唯一；表单内使用时必填'),
    required: z.boolean().optional().describe('是否必填，默认 false'),
    disabled: z.boolean().optional().describe('是否禁用，默认 false'),
    disabled_tips: TipsTextSchema.optional().describe('禁用时的悬浮提示'),
    width: InteractiveWidthSchema.optional().describe('组件宽度'),
    initial_date: z
      .string()
      .optional()
      .describe('默认选中日期，格式 yyyy-MM-dd'),
    initial_datetime: z
      .string()
      .optional()
      .describe('兼容字段：默认日期时间'),
    initial_time: z
      .string()
      .optional()
      .describe('兼容字段：默认时间'),
    placeholder: TipsTextSchema.optional().describe('占位提示文案'),
    confirm: ConfirmSchema.optional().describe('二次确认弹窗配置'),
    value: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('历史回传字段'),
  })
  .describe(
    '日期选择器（picker_date）。与 date_picker 等价的官方别名；新卡片优先写 date_picker',
  );

export type PickerDate = z.infer<typeof PickerDateSchema>;

/**
 * 时间选择器（picker_time）。
 */
export const PickerTimeSchema = z
  .object({
    tag: z.literal('picker_time').describe('组件标签，固定为 picker_time'),
    behaviors: BehaviorsSchema.optional().describe(
      '表单外必填；进入 form 后可省略（交互随 submit 提交）',
    ),
    element_id: ElementIdSchema.optional().describe('组件唯一标识'),
    margin: SpacingValueSchema.optional().describe('组件外边距'),
    name: z
      .string()
      .optional()
      .describe('表单项标识，卡片内唯一；表单内使用时必填'),
    required: z.boolean().optional().describe('是否必填，默认 false'),
    disabled: z.boolean().optional().describe('是否禁用，默认 false'),
    disabled_tips: TipsTextSchema.optional().describe('禁用时的悬浮提示'),
    /** HH:mm */
    initial_time: z
      .string()
      .optional()
      .describe('默认选中时间，格式 HH:mm'),
    initial_date: z
      .string()
      .optional()
      .describe('兼容字段：默认日期'),
    initial_datetime: z
      .string()
      .optional()
      .describe('兼容字段：默认日期时间'),
    placeholder: TipsTextSchema.optional().describe('占位提示文案'),
    width: InteractiveWidthSchema.optional().describe('组件宽度'),
    confirm: ConfirmSchema.optional().describe('二次确认弹窗配置'),
    value: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('历史回传字段'),
  })
  .describe('时间选择器（picker_time）');

export type PickerTime = z.infer<typeof PickerTimeSchema>;

/**
 * 日期时间选择器（picker_datetime）。
 */
export const PickerDatetimeSchema = z
  .object({
    tag: z
      .literal('picker_datetime')
      .describe('组件标签，固定为 picker_datetime'),
    behaviors: BehaviorsSchema.optional().describe(
      '表单外必填；进入 form 后可省略（交互随 submit 提交）',
    ),
    element_id: ElementIdSchema.optional().describe('组件唯一标识'),
    margin: SpacingValueSchema.optional().describe('组件外边距'),
    name: z
      .string()
      .optional()
      .describe('表单项标识，卡片内唯一；表单内使用时必填'),
    required: z.boolean().optional().describe('是否必填，默认 false'),
    disabled: z.boolean().optional().describe('是否禁用，默认 false'),
    disabled_tips: TipsTextSchema.optional().describe('禁用时的悬浮提示'),
    /** yyyy-MM-dd HH:mm */
    initial_datetime: z
      .string()
      .optional()
      .describe('默认选中日期时间，格式 yyyy-MM-dd HH:mm'),
    initial_date: z
      .string()
      .optional()
      .describe('兼容字段：默认日期'),
    initial_time: z
      .string()
      .optional()
      .describe('兼容字段：默认时间'),
    placeholder: TipsTextSchema.optional().describe('占位提示文案'),
    width: InteractiveWidthSchema.optional().describe('组件宽度'),
    confirm: ConfirmSchema.optional().describe('二次确认弹窗配置'),
    value: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('历史回传字段'),
  })
  .describe('日期时间选择器（picker_datetime）');

export type PickerDatetime = z.infer<typeof PickerDatetimeSchema>;

/**
 * 多图选择（select_img）。
 * multi_select 为 true 时必须放在表单容器内。
 */
export const SelectImgSchema = z
  .object({
    tag: z.literal('select_img').describe('组件标签，固定为 select_img'),
    options: z
      .array(
        z
          .object({
            img_key: z.string().describe('图片 key（上传图片接口返回）'),
            value: z.string().optional().describe('选项回传值'),
            disabled: z
              .boolean()
              .optional()
              .describe('是否禁用该选项，默认 false'),
            disabled_tips: TipsTextSchema.optional().describe(
              '禁用时的悬浮提示',
            ),
            hover_tips: TipsTextSchema.optional().describe('悬浮提示'),
          })
          .describe('多图选择选项'),
      )
      .describe('可选图片列表'),
    behaviors: BehaviorsSchema.optional().describe(
      '表单外必填；进入 form 后可省略（交互随 submit 提交）',
    ),
    element_id: ElementIdSchema.optional().describe('组件唯一标识'),
    margin: SpacingValueSchema.optional().describe('组件外边距'),
    multi_select: z
      .boolean()
      .optional()
      .describe('是否多选；为 true 时必须放在表单容器内，默认 false'),
    layout: z
      .enum(['stretch', 'bisect', 'trisect'])
      .optional()
      .describe('图片排布：stretch / bisect / trisect，默认 bisect'),
    style: z
      .enum(['default', 'laser'])
      .optional()
      .describe('选择器样式：default / laser，默认 default'),
    width: InteractiveWidthSchema.optional().describe('组件宽度'),
    name: z
      .string()
      .optional()
      .describe('表单项标识，卡片内唯一；表单内使用时必填'),
    required: z.boolean().optional().describe('是否必填，默认 false'),
    can_preview: z
      .boolean()
      .optional()
      .describe('点击后是否支持大图预览，默认 true'),
    aspect_ratio: z
      .enum(['1:1', '16:9', '4:3'])
      .optional()
      .describe('图片宽高比，默认 1:1'),
    selected_values: z
      .array(z.string())
      .optional()
      .describe('默认选中的选项 value 列表'),
    disabled: z.boolean().optional().describe('是否禁用整个组件，默认 false'),
    disabled_tips: TipsTextSchema.optional().describe('禁用时的悬浮提示'),
    value: z
      .union([z.string(), z.record(z.string(), z.unknown())])
      .optional()
      .describe('历史回传字段或默认选中值'),
    confirm: ConfirmSchema.optional().describe('二次确认弹窗配置'),
  })
  .describe('多图选择（select_img）');

export type SelectImg = z.infer<typeof SelectImgSchema>;

/**
 * 勾选器（checker）。
 */
export const CheckerSchema = z
  .object({
    tag: z.literal('checker').describe('组件标签，固定为 checker'),
    element_id: ElementIdSchema.optional().describe('组件唯一标识'),
    margin: SpacingValueSchema.optional().describe('组件外边距'),
    name: z.string().optional().describe('勾选器标识'),
    required: z.boolean().optional().describe('是否必填，默认 false'),
    checked: z.boolean().optional().describe('初始是否勾选，默认 false'),
    text: z
      .object({
        tag: z
          .enum(['plain_text', 'lark_md'])
          .describe('文本类型：plain_text 或 lark_md'),
        content: z.string().optional().describe('勾选器文案内容'),
        text_size: z
          .enum(['normal', 'heading', 'notation'])
          .optional()
          .describe('字号：normal / heading / notation'),
        text_color: z.string().optional().describe('文本颜色'),
        text_align: z
          .enum(['left', 'center', 'right'])
          .optional()
          .describe('文本对齐方式'),
      })
      .optional()
      .describe('勾选器文案配置'),
    overall_checkable: z
      .boolean()
      .optional()
      .describe('是否允许点击整行切换勾选，默认 true'),
    button_area: z
      .object({
        pc_display_rule: z
          .enum(['always', 'on_hover'])
          .optional()
          .describe('PC 端按钮展示规则：always / on_hover'),
        /** 最多 3 个按钮 */
        buttons: z
          .array(ButtonSchema)
          .max(3)
          .optional()
          .describe('右侧按钮列表，最多 3 个'),
      })
      .optional()
      .describe('右侧按钮区域'),
    checked_style: z
      .object({
        show_strikethrough: z
          .boolean()
          .optional()
          .describe('勾选后是否展示删除线，默认 true'),
        opacity: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe('勾选后的不透明度，取值 0–1'),
      })
      .optional()
      .describe('勾选后的样式'),
    padding: SpacingValueSchema.optional().describe('组件内边距'),
    confirm: ConfirmSchema.optional().describe('二次确认弹窗配置'),
    behaviors: BehaviorsSchema.optional().describe('交互行为列表'),
    hover_tips: TipsTextSchema.optional().describe('悬浮提示'),
    disabled: z.boolean().optional().describe('是否禁用，默认 false'),
    disabled_tips: TipsTextSchema.optional().describe('禁用时的悬浮提示'),
    value: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('历史回传字段'),
  })
  .describe('勾选器（checker）,一个单独的组件，和input没有关系');

export type Checker = z.infer<typeof CheckerSchema>;
