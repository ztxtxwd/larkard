/**
 * 将文本中的 Markdown 特殊字符转义为 HTML 实体，便于按字面量展示。
 *
 * 注意：`&` 必须最先转义，避免二次污染。
 */
const ESCAPE_MAP: ReadonlyArray<readonly [string, string]> = [
  ['&', '&amp;'],
  ['<', '&#60;'],
  ['>', '&#62;'],
  ['*', '&#42;'],
  ['~', '&sim;'],
  ['-', '&#45;'],
  ['!', '&#33;'],
  ['/', '&#47;'],
  ['\\', '&#92;'],
  ['[', '&#91;'],
  [']', '&#93;'],
  ['(', '&#40;'],
  [')', '&#41;'],
  ['#', '&#35;'],
  [':', '&#58;'],
  ['+', '&#43;'],
  ['"', '&#34;'],
  ["'", '&#39;'],
  ['`', '&#96;'],
  ['$', '&#36;'],
  ['_', '&#95;'],
];

export function escapeMarkdown(text: string): string {
  let result = text;
  for (const [char, entity] of ESCAPE_MAP) {
    result = result.split(char).join(entity);
  }
  return result;
}

/** 不换行空格 */
export const NBSP = '&nbsp;';
/** 半角空格 */
export const ENSP = '&ensp;';
/** 全角空格 */
export const EMSP = '&emsp;';
