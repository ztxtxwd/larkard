import { z } from 'zod';

/**
 * 富文本 `<text_tag>` 颜色枚举。
 */
export const MarkdownTextTagColorSchema = z
  .enum([
    'neutral',
    'blue',
    'turquoise',
    'lime',
    'orange',
    'violet',
    'indigo',
    'wathet',
    'green',
    'yellow',
    'red',
    'purple',
    'carmine',
  ])
  .describe('富文本 text_tag 颜色枚举');

export type MarkdownTextTagColor = z.infer<typeof MarkdownTextTagColorSchema>;

/**
 * 富文本 `<local_datetime>` 的 format_type。
 */
export const MarkdownDateTimeFormatSchema = z
  .enum([
    'date_num',
    'date_short',
    'date',
    'week',
    'week_short',
    'time',
    'time_sec',
    'timezone',
  ])
  .describe(
    '国际化时间展示格式：date_num / date_short / date / week / week_short / time / time_sec / timezone',
  );

export type MarkdownDateTimeFormat = z.infer<typeof MarkdownDateTimeFormatSchema>;

/**
 * 富文本内嵌 `<person>` 的展示样式。
 */
export const MarkdownPersonStyleSchema = z
  .enum(['normal', 'capsule'])
  .describe('人员标签样式：normal（普通）/ capsule（胶囊）');

export type MarkdownPersonStyle = z.infer<typeof MarkdownPersonStyleSchema>;

/**
 * 富文本内嵌 `<audio>` 的样式。
 */
export const MarkdownInlineAudioStyleSchema = z
  .enum(['normal', 'speak'])
  .describe('内嵌音频样式：normal（三角播放）/ speak（语音气泡）');

export type MarkdownInlineAudioStyle = z.infer<
  typeof MarkdownInlineAudioStyleSchema
>;
