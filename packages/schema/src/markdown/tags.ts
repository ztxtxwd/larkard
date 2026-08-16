import { z } from 'zod';

import { IconTokenSchema } from '../common/icon-tokens.js';
import { ColorSchema } from '../common/enums.js';
import {
  MarkdownDateTimeFormatSchema,
  MarkdownInlineAudioStyleSchema,
  MarkdownPersonStyleSchema,
  MarkdownTextTagColorSchema,
} from './enums.js';

function boolAttr(value: boolean | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value ? 'true' : 'false';
}

function renderAttrs(
  attrs: Record<string, string | number | boolean | undefined>,
): string {
  return Object.entries(attrs)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => ` ${k}='${String(v)}'`)
    .join('');
}

/**
 * `@` 提及标签参数（会通知对方）。
 * 渲染为 `<at id=...></at>` / `<at ids=...></at>` / `<at email=...></at>`。
 * 仅展示不通知请用 `<person>` / person / person_list。
 */
export const MarkdownAtTagSchema = z
  .object({
    id: z
      .string()
      .optional()
      .describe(
        '单个用户 ID：优先 open_id(ou_) 或 user_id，或 all（@所有人）；不要用 union_id(on_)',
      ),
    ids: z
      .array(z.string())
      .optional()
      .describe('多个用户 ID，渲染为 ids=id1,id2；优先 ou_/user_id'),
    email: z.string().optional().describe('通过邮箱 @ 指定人'),
  })
  .superRefine((data, ctx) => {
    const count = [data.id, data.ids?.length, data.email].filter(Boolean).length;
    if (count !== 1) {
      ctx.addIssue({
        code: 'custom',
        message: 'at 标签需且仅需提供 id、ids、email 其中之一',
      });
    }
  })
  .describe(
    '@ 提及标签 <at>：会通知对方。提示词明确要 @/艾特/通知时用；禁止用 person/<person> 冒充。勿把 <at> 包进 <font>',
  );

export type MarkdownAtTag = z.infer<typeof MarkdownAtTagSchema>;

/** 渲染 `<at ...></at>` */
export function renderAtTag(input: MarkdownAtTag): string {
  const data = MarkdownAtTagSchema.parse(input);
  if (data.id !== undefined) return `<at id=${data.id}></at>`;
  if (data.ids) return `<at ids=${data.ids.join(',')}></at>`;
  return `<at email=${data.email}></at>`;
}

/**
 * 人员展示标签参数（仅展示，不发提及通知）。
 */
export const MarkdownPersonTagSchema = z
  .object({
    id: z
      .string()
      .describe(
        '用户 ID：优先 open_id(ou_) 或 user_id；不要用 union_id(on_)。禁止臆造',
      ),
    show_name: z.boolean().optional().describe('是否展示用户名，默认 true'),
    show_avatar: z.boolean().optional().describe('是否展示头像，默认 true'),
    style: MarkdownPersonStyleSchema.optional().describe('展示样式，默认 normal'),
  })
  .describe(
    '人员展示标签 <person>：仅渲染头像/姓名，不通知。行内展示优先用此标签；要通知改用 <at>。勿包进 <font>',
  );

export type MarkdownPersonTag = z.infer<typeof MarkdownPersonTagSchema>;

export function renderPersonTag(input: MarkdownPersonTag): string {
  const data = MarkdownPersonTagSchema.parse(input);
  return `<person${renderAttrs({
    id: data.id,
    show_name: boolAttr(data.show_name),
    show_avatar: boolAttr(data.show_avatar),
    style: data.style,
  })}></person>`;
}

/**
 * 含图标的多端链接标签。
 */
export const MarkdownLinkTagSchema = z
  .object({
    text: z.string().describe('链接展示文案'),
    url: z.string().describe('默认跳转地址（必填）'),
    icon: IconTokenSchema.optional().describe('前缀图标 token，颜色固定蓝色'),
    pc_url: z.string().optional().describe('PC 端链接，优先级高于 url'),
    ios_url: z.string().optional().describe('iOS 端链接，优先级高于 url'),
    android_url: z.string().optional().describe('Android 端链接，优先级高于 url'),
  })
  .describe('含图标的多端链接标签 <link> 参数');

export type MarkdownLinkTag = z.infer<typeof MarkdownLinkTagSchema>;

export function renderLinkTag(input: MarkdownLinkTag): string {
  const data = MarkdownLinkTagSchema.parse(input);
  return `<link${renderAttrs({
    icon: data.icon,
    url: data.url,
    pc_url: data.pc_url,
    ios_url: data.ios_url,
    android_url: data.android_url,
  })}>${data.text}</link>`;
}

/**
 * 文本标签。状态、优先级、序号等短标识优先用此标签。
 */
export const MarkdownTextTagSchema = z
  .object({
    text: z.string().describe('标签文案（短标识）'),
    color: MarkdownTextTagColorSchema.optional().describe('标签颜色'),
  })
  .describe(
    '文本标签 <text_tag>：用于状态/优先级/序号等短标识。写法示例：`<text_tag color=\'blue\'>标签</text_tag>` + 两个空格 + 正文',
  );

export type MarkdownTextTag = z.infer<typeof MarkdownTextTagSchema>;

export function renderTextTag(input: MarkdownTextTag): string {
  const data = MarkdownTextTagSchema.parse(input);
  return `<text_tag${renderAttrs({ color: data.color })}>${data.text}</text_tag>`;
}

/**
 * 数字角标（0–99）。
 */
export const MarkdownNumberTagSchema = z
  .object({
    number: z
      .number()
      .int()
      .min(0)
      .max(99)
      .describe('角标数字，0–99'),
    background_color: ColorSchema.optional().describe('圆圈背景色'),
    font_color: ColorSchema.optional().describe('数字颜色'),
    url: z.string().optional().describe('点击跳转默认链接'),
    pc_url: z.string().optional().describe('PC 端跳转链接'),
    ios_url: z.string().optional().describe('iOS 端跳转链接'),
    android_url: z.string().optional().describe('Android 端跳转链接'),
  })
  .describe('数字角标 <number_tag> 参数');

export type MarkdownNumberTag = z.infer<typeof MarkdownNumberTagSchema>;

export function renderNumberTag(input: MarkdownNumberTag): string {
  const data = MarkdownNumberTagSchema.parse(input);
  return `<number_tag${renderAttrs({
    background_color: data.background_color,
    font_color: data.font_color,
    url: data.url,
    pc_url: data.pc_url,
    ios_url: data.ios_url,
    android_url: data.android_url,
  })}>${data.number}</number_tag>`;
}

/**
 * 国际化时间标签。
 */
export const MarkdownLocalDateTimeTagSchema = z
  .object({
    millisecond: z
      .union([z.string(), z.number()])
      .optional()
      .describe('Unix 毫秒时间戳；省略则用发送/发布时间'),
    format_type: MarkdownDateTimeFormatSchema.optional().describe(
      '时间展示格式，默认 date_num',
    ),
    link: z.string().optional().describe('点击时间跳转的链接'),
  })
  .describe('国际化时间标签 <local_datetime> 参数');

export type MarkdownLocalDateTimeTag = z.infer<
  typeof MarkdownLocalDateTimeTagSchema
>;

export function renderLocalDateTimeTag(input: MarkdownLocalDateTimeTag): string {
  const data = MarkdownLocalDateTimeTagSchema.parse(input);
  return `<local_datetime${renderAttrs({
    millisecond: data.millisecond,
    format_type: data.format_type,
    link: data.link,
  })}></local_datetime>`;
}

/**
 * 彩色文本（font）标签。
 * 字段标签常用 grey；禁止把 `<at>` / `<person>` 包进 `<font>`（会显示标签原文）。
 */
export const MarkdownFontTagSchema = z
  .object({
    text: z
      .string()
      .describe(
        '文本内容；不要在其中嵌套 <at>/<person>（嵌套后常显示标签原文）',
      ),
    color: ColorSchema.describe(
      '文本颜色：default、颜色枚举或 rgba；不对链接文本生效。字段标签常用 grey',
    ),
  })
  .describe(
    "彩色文本 <font>。正例：`<font color='grey'>作者：</font><person id='ou_xxx' show_name=true show_avatar=true style='normal'></person>`",
  );

export type MarkdownFontTag = z.infer<typeof MarkdownFontTagSchema>;

export function renderFontTag(input: MarkdownFontTag): string {
  const data = MarkdownFontTagSchema.parse(input);
  return `<font color='${data.color}'>${data.text}</font>`;
}

/**
 * 普通超链接（a）标签。
 */
export const MarkdownAnchorTagSchema = z
  .object({
    href: z.string().describe('跳转地址，仅支持 HTTP/HTTPS'),
    text: z.string().optional().describe('展示文案；省略时通常展示 URL'),
  })
  .describe('超链接 <a> 参数');

export type MarkdownAnchorTag = z.infer<typeof MarkdownAnchorTagSchema>;

export function renderAnchorTag(input: MarkdownAnchorTag): string {
  const data = MarkdownAnchorTagSchema.parse(input);
  return `<a href='${data.href}'>${data.text ?? ''}</a>`;
}

/**
 * 富文本内嵌音频标签。
 */
export const MarkdownInlineAudioTagSchema = z
  .object({
    file_key: z.string().describe('音频文件 key（上传文件接口返回）'),
    audio_id: z.string().optional().describe('音频实例唯一标识'),
    show_time: z.boolean().optional().describe('是否显示时长，默认 false'),
    style: MarkdownInlineAudioStyleSchema.optional().describe(
      '音频样式，默认 normal',
    ),
    background_color: ColorSchema.optional().describe('组件背景色'),
    fill_color: ColorSchema.optional().describe('图标与时间颜色'),
    fallback_text: z
      .string()
      .optional()
      .describe('低版本客户端降级文案；指定时必须同时提供 fallback_url'),
    fallback_url: z.string().optional().describe('低版本客户端兜底 URL'),
    fallback_pc_url: z.string().optional().describe('PC 端兜底 URL'),
    fallback_ios_url: z.string().optional().describe('iOS 端兜底 URL'),
    fallback_android_url: z.string().optional().describe('Android 端兜底 URL'),
    fallback_harmony_url: z.string().optional().describe('鸿蒙端兜底 URL'),
  })
  .superRefine((data, ctx) => {
    if (data.fallback_text && !data.fallback_url) {
      ctx.addIssue({
        code: 'custom',
        message: '指定 fallback_text 时必须同时提供 fallback_url',
        path: ['fallback_url'],
      });
    }
  })
  .describe('富文本内嵌音频 <audio> 参数');

export type MarkdownInlineAudioTag = z.infer<typeof MarkdownInlineAudioTagSchema>;

export function renderInlineAudioTag(input: MarkdownInlineAudioTag): string {
  const data = MarkdownInlineAudioTagSchema.parse(input);
  return `<audio${renderAttrs({
    file_key: data.file_key,
    audio_id: data.audio_id,
    show_time: boolAttr(data.show_time),
    style: data.style,
    background_color: data.background_color,
    fill_color: data.fill_color,
    fallback_text: data.fallback_text,
    fallback_url: data.fallback_url,
    fallback_pc_url: data.fallback_pc_url,
    fallback_ios_url: data.fallback_ios_url,
    fallback_android_url: data.fallback_android_url,
    fallback_harmony_url: data.fallback_harmony_url,
  })}></audio>`;
}
