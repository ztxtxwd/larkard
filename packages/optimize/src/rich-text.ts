/**
 * 文本富文本化：plain_text → lark_md，div → markdown。
 *
 * 公开 DSL 里有两类「纯文本」载体：
 * - 文本对象 `{ tag: 'plain_text', content }`：schema 允许它出现的位置，大多也
 *   允许 `lark_md`。纯文本是 Markdown 的子集，但 `*` / `<` / `:OK:` 这类字符会
 *   被 Markdown 引擎当成语法，所以默认先用官方推荐的 HTML 实体转义，再改 tag。
 * - 普通文本组件 `{ tag: 'div', text: {...} }`：富文本组件 `markdown` 是它的
 *   超集（多了完整 Markdown 语法），把 text 对象摊平成 `content` 即可。
 *
 * 只处理公开 DSL。按钮 / 下拉 / 确认弹窗 / tips / img.alt 等字段 schema 固定为
 * `plain_text`，不能升级；`img.title` 官方也固定为 plain_text。
 *
 * 可逆性与安全性：
 * - 入参不会被修改；
 * - 每次改写都会记录到 `changes`，无法无损映射的 div 会进入 `skipped`；
 * - `div.width` 不是 `fill` 时不动（markdown 没有 width 字段）。
 */
import { isRecord } from './box.js';
import type {
  JsonObject,
  Path,
  TextUpgradeChange,
  TextUpgradeSkip,
  UpgradeTextOptions,
  UpgradeTextResult,
} from './types.js';

/**
 * 官方富文本文档给出的特殊字符 HTML 实体转义表。
 * 与 `@open-feishu-card/schema` 的 `escapeMarkdown()` 保持一致（本包保持零依赖，
 * 不直接 import schema）。
 *
 * 必须单遍替换：实体本身含 `&` / `#`，多遍会把已生成的实体再转一次。
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

/** plain_text 字面量 → Markdown 安全的 HTML 实体文本。 */
function escapePlainText(text: string): string {
  return text.replace(SPECIAL, (char) => ENTITIES.get(char) ?? char);
}

function cloneCard<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function pathOf(base: Path, ...segments: Array<string | number>): Path {
  return [...base, ...segments];
}

/** div 组件允许的字段（公开 DSL）；出现其它字段时跳过，避免静默丢字段。 */
const DIV_KEYS = new Set([
  'tag', 'element_id', 'margin', 'width', 'text', 'icon', 'ud_icon', 'text_size',
]);
/** div.text（StyledTextObject）允许的字段。 */
const DIV_TEXT_KEYS = new Set([
  'tag', 'content', 'element_id', 'text_size', 'text_color', 'text_align', 'lines',
]);

interface UpgradeContext {
  escape: boolean;
  convertPlainText: boolean;
  convertDiv: boolean;
  changes: TextUpgradeChange[];
  skipped: TextUpgradeSkip[];
}

function upgradeTextFields(node: JsonObject, path: Path, ctx: UpgradeContext): void {
  let escaped = false;
  if (ctx.escape) {
    if (typeof node.content === 'string') {
      const next = escapePlainText(node.content);
      if (next !== node.content) {
        node.content = next;
        escaped = true;
      }
    }
    if (isRecord(node.i18n)) {
      for (const [locale, value] of Object.entries(node.i18n)) {
        if (typeof value !== 'string') continue;
        const next = escapePlainText(value);
        if (next !== value) {
          node.i18n[locale] = next;
          escaped = true;
        }
      }
    }
  }

  // lark_md 不消费 text_color；原 plain_text 上生效的颜色升级后会失效。
  const lost = typeof node.text_color === 'string'
    && node.text_color !== 'default'
    ? ['text_color']
    : undefined;

  node.tag = 'lark_md';
  ctx.changes.push({
    path,
    kind: 'plain-text-to-lark-md',
    from: 'plain_text',
    to: 'lark_md',
    escaped,
    ...(lost ? { lost } : {}),
  });
}

/**
 * plain_text 文本对象 → lark_md。非 plain_text 对象原样保留。
 */
function upgradePlainTextObject(
  node: unknown,
  path: Path,
  ctx: UpgradeContext,
): void {
  if (!ctx.convertPlainText) return;
  if (!isRecord(node) || node.tag !== 'plain_text') return;
  upgradeTextFields(node, path, ctx);
}

/**
 * 普通文本组件 div → 富文本组件 markdown。
 * 无法无损转换时写入 `skipped`，元素保持原样。
 */
function upgradeDiv(el: JsonObject, path: Path, ctx: UpgradeContext): void {
  const text = el.text;
  if (!isRecord(text)) {
    ctx.skipped.push({ path, reason: 'div-no-text' });
    return;
  }
  if (text.tag !== 'plain_text' && text.tag !== 'lark_md') {
    ctx.skipped.push({
      path,
      reason: 'div-text-tag',
      detail: typeof text.tag === 'string' ? text.tag : 'missing',
    });
    return;
  }
  if (typeof text.content !== 'string') {
    ctx.skipped.push({ path, reason: 'div-content' });
    return;
  }
  if (el.width != null && el.width !== 'fill') {
    ctx.skipped.push({
      path,
      reason: 'div-width',
      detail: String(el.width),
    });
    return;
  }

  const unknown = Object.keys(el).filter((key) => !DIV_KEYS.has(key));
  const unknownText = Object.keys(text).filter((key) => !DIV_TEXT_KEYS.has(key));
  if (unknown.length > 0 || unknownText.length > 0) {
    ctx.skipped.push({
      path,
      reason: 'div-unknown-field',
      detail: [
        ...unknown,
        ...unknownText.map((key) => `text.${key}`),
      ].join(', '),
    });
    return;
  }

  const wasPlainText = text.tag === 'plain_text';
  const escaped = ctx.escape && wasPlainText;
  const content = escaped ? escapePlainText(text.content) : text.content;
  const out: JsonObject = { tag: 'markdown', content };
  const mapped: Record<string, string> = {};
  const lost: string[] = [];

  const divId = typeof el.element_id === 'string' ? el.element_id : undefined;
  const textId = typeof text.element_id === 'string' ? text.element_id : undefined;
  if (divId != null) out.element_id = divId;
  else if (textId != null) {
    out.element_id = textId;
    mapped['text.element_id'] = 'element_id';
  }
  if (divId != null && textId != null && divId !== textId) {
    // markdown 只有一个 element_id，组件级标识优先保留。
    lost.push('text.element_id');
  }

  if (el.margin != null) out.margin = el.margin;

  const textSize = text.text_size ?? el.text_size;
  if (textSize != null) {
    out.text_size = textSize;
    if (text.text_size == null) mapped['div.text_size'] = 'text_size';
  }

  if (text.text_align != null) out.text_align = text.text_align;
  if (text.lines != null) {
    out.text_lines = text.lines;
    mapped['text.lines'] = 'text_lines';
  }

  if (text.text_color != null) {
    if (wasPlainText && text.text_color !== 'default') {
      // div.text_color 只在 plain_text 生效；富文本用 font_color 承载同色。
      out.font_color = text.text_color;
      mapped['text.text_color'] = 'font_color';
    } else if (!wasPlainText && text.text_color !== 'default') {
      // lark_md 下 text_color 本来就不生效，保持“不生效”。
      lost.push('text.text_color');
    }
  }

  if (el.icon != null) out.icon = el.icon;
  if (el.ud_icon != null) out.ud_icon = el.ud_icon;

  // 原地替换元素对象，保持父数组 / 父对象上的引用不变。
  for (const key of Object.keys(el)) delete el[key];
  Object.assign(el, out);

  ctx.changes.push({
    path,
    kind: 'div-to-markdown',
    from: 'div',
    to: 'markdown',
    escaped,
    ...(Object.keys(mapped).length > 0 ? { mapped } : {}),
    ...(lost.length > 0 ? { lost } : {}),
  });
}

function walkElements(
  rawElements: unknown,
  basePath: Path,
  ctx: UpgradeContext,
): void {
  if (!Array.isArray(rawElements)) return;
  rawElements.forEach((raw, index) => {
    if (!isRecord(raw) || typeof raw.tag !== 'string') return;
    const path = pathOf(basePath, index);

    switch (raw.tag) {
      case 'div':
        if (ctx.convertDiv) upgradeDiv(raw, path, ctx);
        else upgradePlainTextObject(raw.text, pathOf(path, 'text'), ctx);
        return;

      case 'markdown':
        return;

      case 'checker':
      case 'fallback_text':
        upgradePlainTextObject(raw.text, pathOf(path, 'text'), ctx);
        return;

      case 'collapsible_panel': {
        const header = raw.header;
        if (isRecord(header)) {
          upgradePlainTextObject(
            header.title,
            pathOf(path, 'header', 'title'),
            ctx,
          );
          upgradePlainTextObject(
            header.expanded_title,
            pathOf(path, 'header', 'expanded_title'),
            ctx,
          );
        }
        walkElements(raw.elements, pathOf(path, 'elements'), ctx);
        return;
      }

      case 'column_set': {
        const columns = raw.columns;
        if (!Array.isArray(columns)) return;
        columns.forEach((column, columnIndex) => {
          if (!isRecord(column)) return;
          walkElements(
            column.elements,
            pathOf(path, 'columns', columnIndex, 'elements'),
            ctx,
          );
        });
        return;
      }

      case 'column':
      case 'interactive_container':
      case 'form':
        walkElements(raw.elements, pathOf(path, 'elements'), ctx);
        return;

      default:
        // 其它组件的文本字段 schema 固定为 plain_text，或者不是文本对象。
        return;
    }
  });
}

/**
 * 把卡片里的 plain_text 升级成 lark_md，把普通文本组件 div 升级成 markdown。
 *
 * 默认会转义 plain_text 内容里的 Markdown 特殊字符，保证按字面量展示；传入
 * `{ escape: false }` 可保留 Markdown 语法效果。
 *
 * @example
 * ```ts
 * const { card, changes, skipped } = upgradeTextToRichText(dsl);
 * ```
 */
export function upgradeTextToRichText(
  input: JsonObject,
  options: UpgradeTextOptions = {},
): UpgradeTextResult {
  const card = cloneCard(input);
  const ctx: UpgradeContext = {
    escape: options.escape !== false,
    convertPlainText: options.convertPlainText !== false,
    convertDiv: options.convertDiv !== false,
    changes: [],
    skipped: [],
  };

  if (isRecord(card.header)) {
    upgradePlainTextObject(card.header.title, ['header', 'title'], ctx);
    upgradePlainTextObject(card.header.subtitle, ['header', 'subtitle'], ctx);
  }

  if (isRecord(card.body)) {
    walkElements(card.body.elements, ['body', 'elements'], ctx);
  }

  return { card, changes: ctx.changes, skipped: ctx.skipped };
}
