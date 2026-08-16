/**
 * 公开 DSL（JSON Schema 2.0 卡片）→ 本渲染器认得的 RAW 形态。
 *
 * 这是 feishu-raw-card-to-dsl 的**逆向**：那个库把飞书下发的 raw envelope 投影回公开
 * DSL；本文件把开发者手写的公开 DSL 反投影成 RAW，喂给 renderCard* 直接渲染，
 * 从而免去「真发一遍卡片再拉回来」的服务端回环。
 *
 * 关键前提：目标不是「飞书能接收的合法 raw envelope」，而是「本渲染器能画出来的形态」。
 * 后者宽松得多——components.ts 里很多字段本就同时接受 camelCase / snake_case
 * （如 column_set 的 flex_mode/flexMode、img 的 scale_type/scaleType）。因此这里只需处理
 * 三类真实差异：
 *   1. markdown 内容字符串 → 子元素树（交给 md-parse.ts）；
 *   2. 元素扁平字段 → 包进 property，文本叶子归一为 { tag:'plain_text', property:{content} }；
 *   3. 少数「渲染器只认 camelCase」的字段做 snake→camel 重命名，box 简写字符串 → 对象。
 * 其余字段一律透传（与渲染器 warnOnUnknownTag、以及反向库 convertGeneric 同哲学）。
 */
import type { CardElement, ElementProperty, JsonCard } from './types.js';
import { parseMarkdown } from './md-parse.js';

/**
 * 渲染器「只读 camelCase」的字段：DSL 用 snake_case 写，必须改名才能渲染出来。
 * 依据 components.ts / registry.ts 逐字段核对（dual-read 的字段不在此列，透传即可）。
 */
const KEY_RENAME: Record<string, string> = {
  text_align: 'textAlign',
  text_style: 'textStyle',
  background_style: 'backgroundStyle',
  background_color: 'backgroundColor',
  user_id: 'userID',
  show_avatar: 'showAvatar',
  show_name: 'showName',
  has_border: 'hasBorder',
  hover_tips: 'hoverTips',
  pill_shaped: 'pillShaped',
  tag_style: 'tagStyle',
  scale_type: 'scaleType',
  drop_invalid_user_id: 'dropInvalidUserID',
};

/** 需要把「文本叶子」归一成 { tag:'plain_text', property:{content} } 的字段名 */
const TEXT_LEAF_KEYS = new Set(['title', 'subtitle', 'alt', 'hover_tips', 'placeholder']);

/** DSL 顶层 → JsonCard（渲染器输入）。 */
export function dslToRaw(dsl: unknown): JsonCard {
  const root = isRecord(dsl) ? dsl : {};
  // 允许调用方直接传 { card: {...} } 或 { json_card: {...} } 外层包装
  const card = isRecord(root.card) ? root.card : isRecord(root.json_card) ? root.json_card : root;
  const out: JsonCard = { schema: typeof card.schema === 'string' ? card.schema : '2.0' };

  if (isRecord(card.header)) out.header = convertHeader(card.header);
  if (isRecord(card.body)) out.body = convertBody(card.body);
  return out;
}

function convertHeader(header: Record<string, unknown>): CardElement {
  const property: ElementProperty = {};
  for (const [k, v] of Object.entries(header)) {
    if (k === 'tag') continue;
    if (TEXT_LEAF_KEYS.has(k)) { property[k] = wrapTextLeaf(v); continue; }
    // 前置图标：icon / ud_icon（与 body 元素同规则）
    if ((k === 'icon' || k === 'ud_icon') && isRecord(v)) {
      property[k === 'ud_icon' ? 'udIcon' : 'icon'] = convertEl(v);
      continue;
    }
    // text_tag_list 里的 text_tag 需递归 convertEl（否则 text 叶子仍是扁平 DSL）
    if (k === 'text_tag_list' && Array.isArray(v)) {
      property.text_tag_list = v.map(convertNode) as CardElement[];
      continue;
    }
    property[renameKey(k)] = coerceValue(k, v);
  }
  return { tag: 'card_header', property };
}

function convertBody(body: Record<string, unknown>): CardElement {
  // 除 elements 外，body 还可带 padding / vertical_spacing 等容器级字段——一并搬进 property
  // （buildProperty 会做 box 简写→对象、snake→camel 等转换），否则 body 组件读不到、间距/内边距回退默认。
  const property = buildProperty(body, 'body');
  const elements = Array.isArray(body.elements) ? body.elements.map(convertNode) : [];
  property.elements = elements.filter(Boolean) as CardElement[];
  return { tag: 'body', property };
}

/** 数组项 / 子元素统一入口：元素对象走 convertEl，其它原样递归 */
function convertNode(node: unknown): CardElement | unknown {
  if (isRecord(node) && typeof node.tag === 'string') return convertEl(node);
  return node;
}

/**
 * 单个 DSL 元素（扁平、snake_case）→ RAW 元素（{ tag, property }）。
 */
function convertEl(el: Record<string, unknown>): CardElement {
  const tag = String(el.tag);

  // person → person_v1（渲染器注册的是 person_v1 / person_list）
  // DSL style:"capsule" → pillShaped（与 markdown <person style=capsule> 一致）
  if (tag === 'person') {
    const property = buildProperty(el, 'person_v1');
    // ElementProperty.style 类型偏图标对象；DSL person 的 style 是 "capsule"|"normal" 字符串
    if ((property as { style?: unknown }).style === 'capsule') {
      property.pillShaped = true;
      delete (property as Record<string, unknown>).style;
    }
    return { tag: 'person_v1', property };
  }

  // markdown / lark_md：content 字符串 → 子元素树。
  // lark_md 是飞书旧名（checker.text / div.text 仍常用），统一归一为 markdown 再解析。
  if (tag === 'markdown' || tag === 'lark_md') {
    const property = buildProperty(el, 'markdown');
    if (typeof el.content === 'string') property.elements = parseMarkdown(el.content);
    delete (property as Record<string, unknown>).content;
    return { tag: 'markdown', property };
  }

  // table：lark_md / markdown 列的单元格字符串 → 与真机 RAW 一致的 markdown 元素树。
  // 否则渲染期只能当纯文本，"<font color='green'>**▲**</font>" 会原样漏到 HTML。
  if (tag === 'table') {
    return { tag, property: convertTableProperty(el) };
  }

  return { tag, property: buildProperty(el, tag) };
}

/**
 * table 专用：在通用 buildProperty 之后，把 markdown 列的字符串单元格
 * 转成 { data: { tag:'markdown', property:{ elements } } }（对齐真机 RAW 形态）。
 */
function convertTableProperty(el: Record<string, unknown>): ElementProperty {
  const property = buildProperty(el, 'table');
  const columns = Array.isArray(property.columns) ? property.columns : [];
  const mdColNames = new Set<string>();
  for (const col of columns) {
    if (!isRecord(col)) continue;
    const dt = col.data_type ?? col.dataType;
    if (dt === 'lark_md' || dt === 'markdown') {
      const name = typeof col.name === 'string' ? col.name : '';
      if (name) mdColNames.add(name);
    }
  }
  if (!mdColNames.size || !Array.isArray(property.rows)) return property;

  property.rows = property.rows.map((row) => {
    if (!isRecord(row)) return row;
    const out: Record<string, unknown> = { ...row };
    for (const name of mdColNames) {
      const cell = out[name];
      // 已是 { data: … } / markdown 元素则不动（幂等）；只转裸字符串。
      if (typeof cell === 'string') {
        out[name] = {
          data: {
            tag: 'markdown',
            property: { elements: parseMarkdown(cell), originTag: 'lark_md' },
          },
        };
      }
    }
    return out;
  }) as ElementProperty['rows'];
  return property;
}

/** 把 DSL 元素的扁平字段（除 tag/id）搬进 property，逐字段做必要转换。 */
function buildProperty(el: Record<string, unknown>, tag: string): ElementProperty {
  const property: ElementProperty = {};
  for (const [k, v] of Object.entries(el)) {
    if (k === 'tag' || k === 'id') continue; // 渲染器不读 id

    // column 定宽 "Npx" → widthValue（渲染器 column 靠 widthValue.value 判定定宽；
    // 直接留 width:"100px" 字符串会被当成权重列，图片按列宽渲染会错位）
    if (tag === 'column' && k === 'width' && typeof v === 'string') {
      const px = pxValue(v);
      if (px != null) { property.widthValue = { type: 'pixels', value: px }; continue; }
    }

    // 文本叶子：title/subtitle/alt/hover_tips/placeholder → {tag:plain_text,property:{content}}
    if (TEXT_LEAF_KEYS.has(k)) { property[renameKey(k)] = wrapTextLeaf(v); continue; }

    // button.text / text_tag.text：归一为 plain_text 叶子（渲染器 extractPlainText / extractText）
    // checker.text 若为 markdown / lark_md：必须走 convertEl（content → parseMarkdown），
    // 否则 <text_tag>/<font> 会作为字面量漏到 HTML。其它父级的 text 仍走 wrapTextLeaf，
    // 避免 header.title / text_tag.text 误走 markdown 后 content 被删、读不到字。
    if (k === 'text') {
      if (tag === 'checker' && isRecord(v) && (v.tag === 'markdown' || v.tag === 'lark_md')) {
        property.text = convertEl(v);
      } else {
        property.text = wrapTextLeaf(v);
      }
      continue;
    }

    // 前置图标
    if ((k === 'icon' || k === 'ud_icon') && isRecord(v)) {
      property[k === 'ud_icon' ? 'udIcon' : 'icon'] = convertEl(v);
      continue;
    }

    // 点击行为：button / interactive_container / checker 的 behaviors|multi_url → 渲染器读的 actions|url
    if (k === 'behaviors' && Array.isArray(v)) { property.actions = behaviorsToActions(v) as never; continue; }
    if (k === 'multi_url') { property.url = normalizeUrl(v) as never; continue; }

    // checker.button_area：嵌套 buttons 需递归 convertEl（否则仍是扁平 DSL，渲不出）
    if (k === 'button_area' && isRecord(v)) {
      const area: Record<string, unknown> = { ...v };
      if (Array.isArray(v.buttons)) area.buttons = v.buttons.map(convertNode);
      property.button_area = area as never;
      continue;
    }

    property[renameKey(k)] = coerceValue(k, v);
  }
  return property;
}

/**
 * 字段值转换：box 简写字符串→对象、子元素数组递归、url 归一，其余透传。
 * （column 定宽 width→widthValue 在 buildProperty 里就地处理，不走这里。）
 */
function coerceValue(key: string, value: unknown): unknown {
  // padding / margin：CSS 简写字符串 → { top/right/bottom/left:{type:'pixels',value} }
  if ((key === 'padding' || key === 'margin') && typeof value === 'string') {
    return parseBox(value);
  }

  // 子元素容器：elements / columns / actions / persons / items 里的元素递归转换
  if (Array.isArray(value)) return value.map(convertNode);

  // url 对象/字符串：保持渲染器 resolveURL 认得的形态
  if (key === 'url') return normalizeUrl(value);

  return value;
}

/* ------------------------------------------------------------------ *
 * 小工具
 * ------------------------------------------------------------------ */

function renameKey(k: string): string {
  return KEY_RENAME[k] || k;
}

/** 文本叶子 → { tag:'plain_text', property:{content, textAlign?, text_size?, text_color?} } */
function wrapTextLeaf(v: unknown): CardElement {
  if (typeof v === 'string') return { tag: 'plain_text', property: { content: v } };
  if (isRecord(v)) {
    const property: ElementProperty = { content: typeof v.content === 'string' ? v.content : '' };
    if (typeof v.text_align === 'string') property.textAlign = v.text_align as never;
    // checker 等组件的 text 叶子会带 text_size / text_color（DSL snake_case）
    if (typeof v.text_size === 'string') property.text_size = v.text_size;
    if (typeof v.text_color === 'string') property.text_color = v.text_color;
    return { tag: typeof v.tag === 'string' ? v.tag : 'plain_text', property };
  }
  return { tag: 'plain_text', property: { content: '' } };
}

/** behaviors:[{type,default_url}] → actions:[{type,action:{url}}]（渲染器读 actions[].action.url） */
function behaviorsToActions(behaviors: unknown[]): Array<{ type: string; action: { url: unknown } }> {
  const out: Array<{ type: string; action: { url: unknown } }> = [];
  for (const b of behaviors) {
    if (!isRecord(b)) continue;
    const type = typeof b.type === 'string' ? b.type : 'open_url';
    out.push({ type, action: { url: normalizeUrl(b.default_url) } });
  }
  return out;
}

/** url 归一：字符串直返；对象取 .url（多端字段交给渲染器 resolveURL 处理） */
function normalizeUrl(v: unknown): unknown {
  if (typeof v === 'string') return v;
  if (isRecord(v)) return v; // {url, pc_url,...} —— resolveURL 认 url/pcURL 等
  return v;
}

/** "12px" / "12px 8px" / "1px 2px 3px 4px" → { top/right/bottom/left:{type:'pixels',value} } */
function parseBox(s: string): ElementProperty['padding'] {
  const nums = s.trim().split(/\s+/).map((t) => pxValue(t) ?? 0);
  let t = 0, r = 0, b = 0, l = 0;
  if (nums.length === 1) { t = r = b = l = nums[0]; }
  else if (nums.length === 2) { t = b = nums[0]; r = l = nums[1]; }
  else if (nums.length === 3) { t = nums[0]; r = l = nums[1]; b = nums[2]; }
  else if (nums.length >= 4) { [t, r, b, l] = nums; }
  const px = (value: number) => ({ type: 'pixels', value });
  return { top: px(t), right: px(r), bottom: px(b), left: px(l) };
}

/** "12px" → 12；"12" → 12；非像素返回 null */
function pxValue(s: string): number | null {
  const m = /^(-?\d+(?:\.\d+)?)px?$/.exec(s.trim());
  if (m) return Number(m[1]);
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
