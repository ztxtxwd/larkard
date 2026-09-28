import { z } from 'zod';

import {
  ColorSchema,
  ElementIdSchema,
  HorizontalAlignSchema,
  SpacingValueSchema,
  VerticalAlignSchema,
} from '../common/enums.js';
import { IconSchema, UdIconSchema } from '../common/icon.js';
import {
  StyledTextObjectSchema,
  TextObjectSchema,
  TipsTextSchema,
} from '../common/text.js';
import { BehaviorsSchema } from '../common/behavior.js';
import { ConfirmSchema } from '../common/confirm.js';

/**
 * 普通文本组件（div）。
 * 支持普通文本/lark_md 与前缀图标。
 */
export const DivSchema = z
  .object({
    tag: z.literal('div').describe('组件标签，固定为 div'),
    element_id: ElementIdSchema.optional().describe('组件唯一标识'),
    margin: SpacingValueSchema.optional().describe('组件外边距'),
    /** 宽度：fill / auto / [16,999]px，默认 fill */
    width: z
      .string()
      .optional()
      .describe('组件宽度：fill / auto / [16,999]px，默认 fill'),
    text: StyledTextObjectSchema.optional().describe('文本内容配置'),
    text_size: z.string().optional().describe('字号；优先写在 text.text_size'),
    icon: IconSchema.optional().describe('文本前缀图标'),
    ud_icon: UdIconSchema.optional().describe(
      '历史前缀图标（ud_icon）；与 icon 同时存在时以 icon 为准',
    ),
  })
  .describe('普通文本组件（div）');

export type Div = z.infer<typeof DivSchema>;

/**
 * 图片组件（img）。
 */
export const ImageSchema = z
  .object({
    tag: z.literal('img').describe('组件标签，固定为 img'),
    /** 图片 key（上传图片接口返回） */
    img_key: z
      .string()
      .describe(
        '图片 key（上传图片接口返回）；禁止臆造。无真实资源时改用 markdown/plain_text/standard_icon',
      ),
    /** 图片描述（无障碍/加载失败时展示） */
    alt: z
      .object({
        tag: z.literal('plain_text').describe('文本类型标签，固定为 plain_text'),
        content: z.string().describe('图片描述文案'),
      })
      .describe('图片描述（无障碍/加载失败时展示）'),
    element_id: ElementIdSchema.optional().describe('组件唯一标识'),
    margin: SpacingValueSchema.optional().describe(
      '组件外边距；通栏配图贴边可用负水平 margin（如 "4px -12px"）',
    ),
    title: z
      .object({
        tag: z.literal('plain_text').describe('文本类型标签，固定为 plain_text'),
        content: z.string().describe('图片标题文案'),
      })
      .optional()
      .describe('图片标题'),
    corner_radius: z.string().optional().describe('圆角半径，如 8px 或 50%'),
    scale_type: z
      .enum(['crop_center', 'crop_top', 'fit_horizontal'])
      .optional()
      .describe(
        '裁剪/缩放方式，默认 crop_center。内容图/截图/通栏配图用 fit_horizontal；crop_center/crop_top 仅用于缩略图/小头像式配图',
      ),
    /** stretch / large / medium / small / tiny / "Wpx Hpx" */
    size: z
      .string()
      .optional()
      .describe(
        '图片尺寸：stretch / large / medium / small / tiny，或自定义 "Wpx Hpx"。仅对 crop_center/crop_top 生效；fit_horizontal 时不要写 size',
      ),
    transparent: z
      .boolean()
      .optional()
      .describe('是否透明底色，默认 false'),
    preview: z
      .boolean()
      .optional()
      .describe('点击后是否支持大图预览，默认 true'),
    /** @deprecated 历史字段 */
    mode: z.string().optional().describe('历史字段，已废弃'),
    custom_width: z
      .number()
      .optional()
      .describe('历史字段：自定义宽度（px）'),
    compact_width: z
      .boolean()
      .optional()
      .describe('历史字段：是否紧凑宽度'),
    fallback_img_key: z
      .string()
      .optional()
      .describe('主图加载失败时的兜底图片 key'),
  })
  .describe(
    '图片组件（img）。内容图/截图用 scale_type=fit_horizontal 且不写 size；缩略图才用 crop_* + size',
  );

export type Image = z.infer<typeof ImageSchema>;

/**
 * 多图混排组件（img_combination）。
 */
export const ImgCombinationSchema = z
  .object({
    tag: z
      .literal('img_combination')
      .describe('组件标签，固定为 img_combination'),
    combination_mode: z
      .enum(['double', 'triple', 'bisect', 'trisect'])
      .describe(
        '混排模式：double（双图）/ triple（三图）/ bisect（等分两列）/ trisect（等分三列）',
      ),
    img_list: z
      .array(
        z
          .object({
            img_key: z.string().describe('图片 key（上传图片接口返回）'),
          })
          .describe('混排中的单张图片'),
      )
      .describe('混排图片列表'),
    element_id: ElementIdSchema.optional().describe('组件唯一标识'),
    margin: SpacingValueSchema.optional().describe('组件外边距'),
    combination_transparent: z
      .boolean()
      .optional()
      .describe('混排区域是否透明底色，默认 false'),
    corner_radius: z.string().optional().describe('图片圆角半径'),
    img_list_length: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('混排图片数量提示（平台字段；一般可不写）'),
  })
  .describe('多图混排组件（img_combination）');

export type ImgCombination = z.infer<typeof ImgCombinationSchema>;

/**
 * 头像组件（avatar）。仅展示用户头像，不展示姓名、不发通知。
 */
export const AvatarSchema = z
  .object({
    tag: z.literal('avatar').describe('组件标签，固定为 avatar'),
    user_id: z
      .string()
      .describe(
        '人员 ID：优先 open_id(ou_) 或 user_id；不要用 union_id(on_)。禁止臆造 ID',
      ),
    size: z
      .enum(['tiny', 'small', 'medium', 'large', 'huge', 'custom'])
      .optional()
      .describe('头像尺寸，默认 medium；custom 时配合 custom_size'),
    custom_size: z
      .number()
      .optional()
      .describe('自定义头像尺寸（px）；size=custom 时使用'),
    custom_size2: z
      .number()
      .optional()
      .describe('自定义头像尺寸备选值（px）'),
    element_id: ElementIdSchema.optional().describe('组件唯一标识'),
    margin: SpacingValueSchema.optional().describe('组件外边距'),
  })
  .describe('头像组件（avatar）：仅展示头像；要姓名用 person，要通知用 markdown <at>');

export type Avatar = z.infer<typeof AvatarSchema>;

/**
 * 折叠面板内部分割线（collapse_divider）。仅用于 collapsible_panel.elements。
 */
export const CollapseDividerSchema = z
  .object({
    tag: z
      .literal('collapse_divider')
      .describe('组件标签，固定为 collapse_divider'),
    element_id: ElementIdSchema.optional().describe('组件唯一标识'),
  })
  .describe(
    '折叠面板分割线（collapse_divider）；应放在 collapsible_panel.elements 内',
  );

export type CollapseDivider = z.infer<typeof CollapseDividerSchema>;

/**
 * 降级文本元素（fallback_text）。
 * 作为独立正文元素时展示兜底文案；也可带交互字段（较少见）。
 */
export const FallbackTextElementSchema = z
  .object({
    tag: z.literal('fallback_text').describe('组件标签，固定为 fallback_text'),
    text: TextObjectSchema.describe('兜底文案（plain_text / lark_md）'),
    element_id: ElementIdSchema.optional().describe('组件唯一标识'),
    name: z.string().optional().describe('表单项标识'),
    required: z.boolean().optional().describe('是否必填，默认 false'),
    disabled: z.boolean().optional().describe('是否禁用，默认 false'),
    disabled_tips: TipsTextSchema.optional().describe('禁用时的悬浮提示'),
    behaviors: BehaviorsSchema.optional().describe('交互行为列表'),
    confirm: ConfirmSchema.optional().describe('二次确认弹窗配置'),
    value: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('历史回传字段'),
  })
  .describe(
    '降级文本元素（fallback_text）。音视频组件的 fallback 配置见各组件内嵌字段，勿与本元素混淆',
  );

export type FallbackTextElement = z.infer<typeof FallbackTextElementSchema>;

/**
 * 人员组件（person）。
 * 仅展示头像/姓名，不会通知对方；要 @/通知请用 markdown `<at>`。
 */
export const PersonSchema = z
  .object({
    tag: z.literal('person').describe('组件标签，固定为 person'),
    /** open_id / user_id；优先 ou_，避免 on_ */
    user_id: z
      .string()
      .describe(
        '人员 ID：优先 open_id(ou_) 或 user_id；不要用 union_id(on_)。禁止臆造 ID',
      ),
    element_id: ElementIdSchema.optional().describe('组件唯一标识'),
    margin: SpacingValueSchema.optional().describe('组件外边距'),
    size: z
      .enum(['extra_small', 'small', 'medium', 'large'])
      .optional()
      .describe('人员组件尺寸，默认 medium'),
    show_avatar: z
      .boolean()
      .optional()
      .describe('是否展示头像，默认 true'),
    show_name: z.boolean().optional().describe('是否展示姓名，默认 true'),
    style: z
      .enum(['normal', 'capsule'])
      .optional()
      .describe('展示样式：normal / capsule，默认 normal'),
    notation: TipsTextSchema.optional().describe(
      '人员旁注说明文案（如职位/备注）',
    ),
  })
  .describe(
    '人员组件（person）：仅展示，不发通知。提示词说作者/负责人/名单时用；要 @/通知改用 markdown <at>',
  );

export type Person = z.infer<typeof PersonSchema>;

/**
 * 人员列表组件（person_list）。
 * 仅展示，不发通知；要 @/通知请用 markdown `<at>`。
 */
export const PersonListSchema = z
  .object({
    tag: z.literal('person_list').describe('组件标签，固定为 person_list'),
    persons: z
      .array(
        z
          .object({
            id: z
              .string()
              .describe(
                '人员 ID：优先 open_id(ou_) 或 user_id；不要用 union_id(on_)。禁止臆造 ID',
              ),
          })
          .describe('人员列表项'),
      )
      .describe('人员列表'),
    element_id: ElementIdSchema.optional().describe('组件唯一标识'),
    margin: SpacingValueSchema.optional().describe('组件外边距'),
    drop_invalid_user_id: z
      .boolean()
      .optional()
      .describe('是否丢弃无效的 user_id，默认 false'),
    lines: z
      .number()
      .int()
      .optional()
      .describe('最大显示行数，超出省略'),
    show_name: z.boolean().optional().describe('是否展示姓名，默认 true'),
    show_avatar: z
      .boolean()
      .optional()
      .describe('是否展示头像，默认 true'),
    size: z
      .enum(['extra_small', 'small', 'medium', 'large', 'extra_large'])
      .optional()
      .describe('人员尺寸，默认 medium'),
    mode: z
      .enum(['name', 'avatar', 'nameAvatar'])
      .optional()
      .describe(
        '展示模式：name（仅姓名）/ avatar（仅头像）/ nameAvatar（姓名+头像）',
      ),
    style: z
      .enum(['normal', 'notation'])
      .optional()
      .describe('列表样式：normal / notation'),
    count: z
      .number()
      .optional()
      .describe('额外计数展示（如 +N）；平台字段，按需使用'),
    icon: IconSchema.optional().describe('列表前缀图标'),
    ud_icon: UdIconSchema.optional().describe(
      '历史前缀图标（ud_icon）；与 icon 同时存在时以 icon 为准',
    ),
  })
  .describe(
    '人员列表组件（person_list）：仅展示多人，不发通知。多行多人名单也可用 table 的 persons 列',
  );

export type PersonList = z.infer<typeof PersonListSchema>;

/**
 * 图表组件（chart）。chart_spec 遵循 VChart 规范，此处宽松校验。
 */
export const ChartSchema = z
  .object({
    tag: z.literal('chart').describe('组件标签，固定为 chart'),
    chart_spec: z
      .record(z.string(), z.unknown())
      .describe('图表配置，遵循 VChart 规范'),
    element_id: ElementIdSchema.optional().describe('组件唯一标识'),
    margin: SpacingValueSchema.optional().describe('组件外边距'),
    aspect_ratio: z
      .enum(['1:1', '2:1', '4:3', '16:9'])
      .optional()
      .describe('图表宽高比，默认 16:9'),
    color_theme: z
      .enum(['brand', 'rainbow', 'complementary', 'converse', 'primary'])
      .optional()
      .describe('图表配色主题，默认 brand'),
    preview: z
      .boolean()
      .optional()
      .describe('点击后是否支持大图预览，默认 true'),
    /** auto 或 [1,999]px */
    height: z
      .string()
      .optional()
      .describe('图表高度：auto 或 [1,999]px'),
  })
  .describe(
    '图表组件（chart）。旁侧说明类 icon 可用 info_outlined；图表相关 icon 推荐 insert-chart_outlined / sheet-*_outlined / data-sheet_outlined 等枚举内 token',
  );

export type Chart = z.infer<typeof ChartSchema>;

const TableHeaderStyleSchema = z
  .object({
    text_align: HorizontalAlignSchema.optional().describe('表头文本对齐方式'),
    text_size: z
      .enum(['normal', 'heading'])
      .optional()
      .describe('表头字号：normal / heading'),
    background_style: z
      .enum(['none', 'grey'])
      .optional()
      .describe('表头背景样式：none / grey'),
    text_color: z
      .enum(['default', 'grey'])
      .optional()
      .describe('表头文字颜色：default / grey'),
    bold: z.boolean().optional().describe('表头文字是否加粗'),
    lines: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('表头最大显示行数'),
  })
  .describe('表格表头样式');

const TableColumnSchema = z
  .object({
    name: z.string().describe('列的唯一标识，对应 rows 中的字段名'),
    data_type: z
      .enum(['text', 'lark_md', 'options', 'number', 'persons', 'date', 'markdown'])
      .optional()
      .describe(
        '列数据类型：text / lark_md / options / number / persons / date / markdown。Owner/负责人/跟进人等人员列必须用 persons，行值为裸 ou_/user_id（或数组）；禁止用 text/lark_md 塞人员 ID，也禁止在单元格写 <person>/<at>',
      ),
    display_name: z.string().optional().describe('列展示名称'),
    /** auto / px / % */
    width: z
      .string()
      .optional()
      .describe('列宽：auto、固定 px 或百分比'),
    vertical_align: VerticalAlignSchema.optional().describe('单元格垂直对齐'),
    horizontal_align: HorizontalAlignSchema.optional().describe(
      '单元格水平对齐',
    ),
    /** number 列格式化 */
    format: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('number 列的格式化配置'),
    date_format: z
      .string()
      .optional()
      .describe('date 列的日期格式，如 yyyy/MM/dd'),
  })
  .describe('表格列定义');

/**
 * 表格组件（table）。必须在 body.elements 根级；不可嵌套在 column / form / interactive_container 等容器内。
 */
export const TableSchema = z
  .object({
    tag: z.literal('table').describe('组件标签，固定为 table'),
    columns: z.array(TableColumnSchema).describe('表格列定义列表'),
    rows: z
      .array(z.record(z.string(), z.unknown()))
      .describe(
        '表格行数据，对象 key 对应 columns.name。persons 列值为裸人员 ID 字符串或数组，勿写 <person>/<at>',
      ),
    element_id: ElementIdSchema.optional().describe('组件唯一标识'),
    margin: SpacingValueSchema.optional().describe('组件外边距'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .describe('每页显示行数，取值 1–10，默认 5'),
    row_height: z
      .string()
      .optional()
      .describe('行高，如 low / middle / high 或自定义 px'),
    row_max_height: z.string().optional().describe('行最大高度'),
    freeze_first_column: z
      .boolean()
      .optional()
      .describe('是否冻结首列，默认 false'),
    header_style: TableHeaderStyleSchema.optional().describe('表头样式'),
  })
  .describe(
    '表格组件（table）：必须放在 body.elements 根级，禁止包进 column / interactive_container 等容器',
  );

export type Table = z.infer<typeof TableSchema>;

/**
 * 分割线组件（hr）。
 */
export const HrSchema = z
  .object({
    tag: z.literal('hr').describe('组件标签，固定为 hr'),
    element_id: ElementIdSchema.optional().describe('组件唯一标识'),
    margin: SpacingValueSchema.optional().describe('组件外边距'),
  })
  .describe('分割线组件（hr）');

export type Hr = z.infer<typeof HrSchema>;

/**
 * 音频组件（audio）。
 */
export const AudioSchema = z
  .object({
    tag: z.literal('audio').describe('组件标签，固定为 audio'),
    file_key: z.string().describe('音频文件 key'),
    element_id: ElementIdSchema.optional().describe('组件唯一标识'),
    margin: SpacingValueSchema.optional().describe('组件外边距'),
    i18n_file_key: z
      .record(z.string(), z.string())
      .optional()
      .describe('多语言音频文件 key 映射'),
    audio_id: z.string().optional().describe('音频元素标识，用于区分多个音频'),
    disabled: z.boolean().optional().describe('是否禁用音频播放，默认 false'),
    disabled_tips: z
      .object({
        tag: z.literal('plain_text').describe('文本类型标签，固定为 plain_text'),
        content: z.string().describe('禁用提示文案'),
      })
      .optional()
      .describe('禁用时的悬浮提示'),
    show_progress_bar: z
      .boolean()
      .optional()
      .describe('是否展示进度条，默认 true'),
    show_time: z.boolean().optional().describe('是否展示时间，默认 true'),
    time_display: z
      .enum(['default', 'both'])
      .optional()
      .describe('时间展示方式：default / both'),
    time_position: z
      .enum(['end', 'start', 'both_sides'])
      .optional()
      .describe('时间位置：end / start / both_sides'),
    border: z
      .object({
        color: ColorSchema.optional().describe('边框颜色'),
        corner_radius: z.string().optional().describe('边框圆角'),
      })
      .optional()
      .describe('边框样式'),
    style: z
      .enum(['normal', 'flat', 'speak'])
      .optional()
      .describe('音频样式：normal / flat / speak，默认 normal'),
    padding: SpacingValueSchema.optional().describe('组件内边距'),
    background_style: z.string().optional().describe('背景样式'),
    fill_color: ColorSchema.optional().describe('填充颜色'),
    width: z.string().optional().describe('组件宽度'),
    fallback: z
      .union([
        z.literal('drop').describe('客户端不支持时丢弃该组件'),
        z
          .object({
            tag: z
              .literal('fallback_text')
              .describe('降级类型，固定为 fallback_text'),
            text: z
              .object({
                tag: z
                  .literal('plain_text')
                  .describe('文本类型标签，固定为 plain_text'),
                content: z.string().describe('降级文案内容'),
              })
              .describe('自定义降级文案'),
          })
          .describe('自定义降级文案对象'),
      ])
      .optional()
      .describe(
        '降级配置：drop 丢弃组件，或 fallback_text 自定义文案；省略则用系统默认文案',
      ),
  })
  .describe('音频组件（audio）');

export type Audio = z.infer<typeof AudioSchema>;

/**
 * 视频组件（video）。
 */
export const VideoSchema = z
  .object({
    tag: z.literal('video').describe('组件标签，固定为 video'),
    file_key: z.string().describe('视频文件 key'),
    element_id: ElementIdSchema.optional().describe('组件唯一标识'),
    margin: SpacingValueSchema.optional().describe('组件外边距'),
    i18n_file_key: z
      .record(z.string(), z.string())
      .optional()
      .describe('多语言视频文件 key 映射'),
    enable_download: z
      .boolean()
      .optional()
      .describe('是否允许下载视频，默认 false'),
    show_time: z.boolean().optional().describe('是否展示时长，默认 true'),
    cover: z
      .object({
        img_key: z.string().optional().describe('封面图片 key'),
        i18n_img_key: z
          .record(z.string(), z.string())
          .optional()
          .describe('多语言封面图片 key 映射'),
      })
      .optional()
      .describe('视频封面配置'),
    hover_tips: z
      .object({
        tag: z.literal('plain_text').describe('文本类型标签，固定为 plain_text'),
        content: z.string().describe('悬浮提示文案'),
      })
      .optional()
      .describe('悬浮提示'),
    fallback: z
      .union([
        z.literal('drop').describe('客户端不支持时丢弃该组件'),
        z
          .object({
            tag: z
              .literal('fallback_text')
              .describe('降级类型，固定为 fallback_text'),
            text: z
              .object({
                tag: z
                  .literal('plain_text')
                  .describe('文本类型标签，固定为 plain_text'),
                content: z.string().describe('降级文案内容'),
              })
              .describe('自定义降级文案'),
          })
          .describe('自定义降级文案对象'),
      ])
      .optional()
      .describe(
        '降级配置：drop 丢弃组件，或 fallback_text 自定义文案；省略则用系统默认文案',
      ),
  })
  .describe('视频组件（video）');

export type Video = z.infer<typeof VideoSchema>;
