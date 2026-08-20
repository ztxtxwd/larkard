/**
 * RAW（飞书内部 envelope / 渲染器形态）→ 公开 DSL（JSON Schema 2.0）。
 *
 * dslToRaw 的逆向投影：
 *   1. { tag, property } 元素 → 扁平 snake_case 字段；
 *   2. markdown 子元素树无法完美还原字符串的地方，用元素拼接近似还原；
 *   3. 未知 / 私有组件降级为 { tag: 'unknown', raw_tag, fallback }，
 *      保证 Raw → DSL → Raw 的往返不丢数据（未知节点整体挂到 fallback 上）。
 */
import type { CardElement, JsonCard } from './types.js';

const CAMEL_RENAME: Record<string, string> = {
  textAlign: 'text_align',
  textStyle: 'text_style',
  backgroundStyle: 'background_style',
  backgroundColor: 'background_color',
  userID: 'user_id',
  showAvatar: 'show_avatar',
  showName: 'show_name',
  hasBorder: 'has_border',
  hoverTips: 'hover_tips',
  pillShaped: 'pill_shaped',
  tagStyle: 'tag_style',
  scaleType: 'scale_type',
  dropInvalidUserID: 'drop_invalid_user_id',
  udIcon: 'ud_icon',
  // video / audio
  fileID: 'file_key',
  coverImageID: 'image_key',
  showTime: 'show_time',
  enableDownload: 'enable_download',
  audioID: 'audio_id',
  showProgressBar: 'show_progress_bar',
  fillColor: 'fill_color',
};

/** 已知公开 DSL 组件 tag 集合；不在此列的视为私有/未知 */
const KNOWN_TAGS = new Set([
  'markdown', 'lark_md', 'div', 'column_set', 'column', 'hr', 'image', 'img',
  'button', 'overflow', 'select_static', 'select_multi', 'input', 'date_picker',
  'picker_time', 'picker_date', 'checker', 'chart', 'table', 'iframe', 'person',
  'person_list', 'interactive_container', 'tag', 'text_tag', 'multi_image',
  'plain_text', 'lark_md_inline', 'image_text', 'carousel', 'grid', 'speaking',
  'vote', 'lottery', 'calender', 'schedule', 'share_chat', 'share_user', 'add_on',
  'whole_text', 'cropper_image', 'highlight', 'local_file', 'file_preview',
  'input_select', 'picker_datetime', 'picker_multi', 'rule', 'statistic', 'task',
  'card_header', 'body', 'audio', 'video', 'markdown_audio', 'unknown',
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 未知/私有组件自动降级：包一层 unknown 节点，原始 RAW 保留在 fallback。 */
export function degradeUnknown(el: Record<string, unknown>): Record<string, unknown> {
  const rawTag = typeof el.tag === 'string' ? el.tag : 'undefined';
  return { tag: 'unknown', raw_tag: rawTag, fallback: el };
}

/** RAW envelope（可能是 {json_card:{card}} / {card} / 直接 card）→ DSL 卡片对象 */
export function rawToDsl(raw: unknown): Record<string, unknown> {
  let card: Record<string, unknown> = {};
  if (isRecord(raw)) {
    const env = isRecord(raw.json_card) ? raw.json_card : isRecord(raw.card) ? raw.card : raw;
    if (isRecord(env)) card = env;
  }
  const out: Record<string, unknown> = {
    schema: typeof card.schema === 'string' ? card.schema : '2.0',
  };
  if (isRecord(card.config)) out.config = card.config;
  if (isRecord(card.header)) out.header = convertHeaderToDsl(card.header);
  if (isRecord(card.body)) out.body = convertBodyToDsl(card.body);
  else if (Array.isArray(card.elements)) {
    // 兼容扁平 body 写法
    out.body = { elements: card.elements.map(convertElToDsl).filter(Boolean) };
  }
  return out;
}

function convertHeaderToDsl(header: Record<string, unknown>): Record<string, unknown> {
  const property = isRecord(header.property) ? header.property : header;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(property)) {
    if (k === 'ud_icon' || k === 'udIcon') {
      if (isRecord(v) && typeof v.tag === 'string') { out.ud_icon = convertElToDsl(v); continue; }
    }
    out[CAMEL_RENAME[k] ?? k] = unwrapTextLeaf(v);
  }
  return out;
}

function convertBodyToDsl(body: Record<string, unknown>): Record<string, unknown> {
  const property = isRecord(body.property) ? body.property : body;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(property)) {
    if (k === 'elements' && Array.isArray(v)) {
      out.elements = v.map(convertElToDsl).filter(Boolean);
      continue;
    }
    if (isRecord(v) && typeof v.tag === 'string') {
      out[CAMEL_RENAME[k] ?? k] = convertElToDsl(v);
      continue;
    }
    if (Array.isArray(v)) {
      out[CAMEL_RENAME[k] ?? k] = v.map((item) => (isRecord(item) && typeof item.tag === 'string' ? convertElToDsl(item) : item));
      continue;
    }
    out[CAMEL_RENAME[k] ?? k] = unwrapBox(v);
  }
  return out;
}

function convertElToDsl(el: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!isRecord(el)) return undefined;
  const tag = typeof el.tag === 'string' ? el.tag : '';
  if (!tag) return undefined;

  // 未知/私有组件：降级，保数据
  if (!KNOWN_TAGS.has(tag)) return degradeUnknown(el);

  // 有 fallback 的 RAW 节点（渲染器未知组件降级产物）原样透传
  if ('fallback' in el && isRecord(el.fallback)) return el as Record<string, unknown>;

  const property = isRecord(el.property) ? el.property : {};
  const out: Record<string, unknown> = {};
  if (tag !== 'plain_text') out.tag = tag === 'img' ? 'image' : tag;

  for (const [k, v] of Object.entries(property)) {
    const key = CAMEL_RENAME[k] ?? k;
    if (k === 'elements' && Array.isArray(v)) {
      if (tag === 'markdown') {
        // markdown 子元素树 → 尽力还原为 markdown 字符串
        out.content = elementsToMarkdown(v as CardElement[]);
        continue;
      }
      out.elements = v.map(convertElToDsl).filter(Boolean);
      continue;
    }
    if (k === 'columns' && Array.isArray(v)) {
      out.columns = v.map(convertElToDsl).filter(Boolean);
      continue;
    }
    if (isRecord(v) && typeof v.tag === 'string') {
      out[key] = convertElToDsl(v);
      continue;
    }
    if (Array.isArray(v)) {
      out[key] = v.map((item) => (isRecord(item) && typeof item.tag === 'string' ? convertElToDsl(item) : item));
      continue;
    }
    out[key] = unwrapBox(unwrapTextLeaf(v));
  }
  return out;
}

/** plain_text 叶子 → 字符串 */
function unwrapTextLeaf(v: unknown): unknown {
  if (isRecord(v) && v.tag === 'plain_text') {
    const p = isRecord(v.property) ? v.property : {};
    return typeof p.content === 'string' ? p.content : '';
  }
  return v;
}

/** {top/right/bottom/left:{type:'pixels',value}} 简写 → "t r b l" 字符串 */
function unwrapBox(v: unknown): unknown {
  if (!isRecord(v) || !isRecord(v.top) || !isRecord(v.right)) return v;
  const side = (s: unknown) => (isRecord(s) && typeof s.value === 'number' ? `${s.value}px` : '0px');
  return `${side(v.top)} ${side(v.right)} ${side(v.bottom ?? v.top)} ${side(v.left ?? v.right)}`;
}

/** markdown 子元素树 → 近似 markdown 字符串（逐叶子提取文本） */
function elementsToMarkdown(els: CardElement[]): string {
  const parts: string[] = [];
  for (const el of els) {
    const p = (isRecord(el?.property) ? el.property : {}) as Record<string, unknown>;
    if (typeof p.content === 'string') parts.push(p.content);
    else if (Array.isArray(p.elements)) parts.push(elementsToMarkdown(p.elements as CardElement[]));
  }
  return parts.join('');
}

/** DSL → RAW（重导出，统一入口） */
export { dslToRaw } from './dsl-to-raw.js';
export type { CardElement, ElementProperty, JsonCard } from './types.js';
