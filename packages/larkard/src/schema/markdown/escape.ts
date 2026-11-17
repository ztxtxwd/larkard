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

/**
 * 具名实体的还原表；数值实体单独处理。
 *
 * 与 `ESCAPE_MAP` 反向对应（`&amp;` / `&sim;`），另补上 markdown 内容里常见的
 * 空格与尖括号写法。飞书客户端渲染 lark_md 时会还原这些实体，渲染器必须
 * 保持一致，否则 `escapeMarkdown()` 写出的 `&#45;` 会原样显示。
 */
const NAMED_UNESCAPE: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  ensp: '\u2002',
  emsp: '\u2003',
  sim: '~',
};

const ENTITY = /&(?:#(\d+)|#x([0-9a-fA-F]+)|([a-zA-Z][a-zA-Z0-9]*));/g;

/**
 * 还原 `escapeMarkdown()` 写入的 HTML 实体（`&#45;` → `-`、`&amp;` → `&`）。
 *
 * 必须单遍替换：`&amp;#45;` 只会还原成 `&#45;`，不会继续把 `#45;` 当成实体。
 */
export function decodeMarkdownEntities(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(ENTITY, (match, decimal?: string, hex?: string, name?: string) => {
    if (decimal !== undefined) {
      const code = Number(decimal);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    if (hex !== undefined) {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    return NAMED_UNESCAPE[String(name).toLowerCase()] ?? match;
  });
}

/** 不换行空格 */
export const NBSP = '&nbsp;';
/** 半角空格 */
export const ENSP = '&ensp;';
/** 全角空格 */
export const EMSP = '&emsp;';
