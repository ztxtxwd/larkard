/**
 * 将文本中的 Markdown 特殊字符转义为 HTML 实体，便于按字面量展示。
 *
 * 注意：必须单遍替换。实体本身含 `&` 和 `#`，逐字符多遍替换会把已生成的实体再转一遍
 * （`*` → `&#42;` → `&&#35;42;`）。
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

const ENTITIES = new Map(ESCAPE_MAP);
const SPECIAL = new RegExp(
  `[${ESCAPE_MAP.map(([char]) => char.replace(/[\\\]\[\-^]/g, '\\$&')).join('')}]`,
  'g',
);

export function escapeMarkdown(text: string): string {
  return text.replace(SPECIAL, (char) => ENTITIES.get(char) ?? char);
}

/** 不换行空格 */
export const NBSP = '&nbsp;';
/** 半角空格 */
export const ENSP = '&ensp;';
/** 全角空格 */
export const EMSP = '&emsp;';
