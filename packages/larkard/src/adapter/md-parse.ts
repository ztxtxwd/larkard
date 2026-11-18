/**
 * DSL 的 markdown「内容字符串」→ RAW 的「子元素树」。
 *
 * 公开 DSL 里 markdown 是一段字符串（`{ tag:'markdown', content:'**x** `y`' }`），
 * 而本渲染器的 markdown 组件（components.ts）渲染的是 `property.elements`——
 * 一组 `{ tag, property }` 内联/块级子元素。本文件把字符串解析成那棵子元素树，
 * 正是 feishu-raw-card-to-dsl 里 rebuildMarkdown 的**逆运算**。
 *
 * 目标不是「飞书能接收的合法结构」，而是「本渲染器认得、能画出来的结构」——
 * 后者宽松得多，故这里只需覆盖飞书 markdown 的常用子集，手写一个小 tokenizer 即可，
 * 保持零依赖。支持：
 *   行内：加粗 ** **、斜体 * */ /* _、删除线 ~~、行内代码 ` `、链接 [t](u)、
 *         <font color='x'>、<at id=x>、<at id=all>、<text_tag color='x'>、
 *         <person id='x' show_name=true show_avatar=true style='normal'>、
 *         <audio file_key='…' audio_id='1' show_time=true …>、
 *         <number_tag>、<local_datetime>、<link>、<a href>、<br>、<hr>
 *   块级：# 标题、- / 1. 列表（含缩进层级）、> 引用、``` 代码块、--- / <hr> 分割线、软换行
 * 未覆盖的构造（如表格）按纯文本降级——渲染器无对应组件，literal 输出即可。
 */
import type { CardElement, LinkURL, TextStyle } from './types.js';
import { EMOJI_KEY_TO_NAME } from '../content/emoji/index.js';
import { decodeMarkdownEntities } from '../schema/markdown/escape.js';

/** 行内解析时的样式上下文 */
interface InlineStyle {
  bold: boolean;
  italic: boolean;
  strike: boolean;
  color?: string;
}

function styleAttrs(s: InlineStyle): TextStyle | undefined {
  const attributes: string[] = [];
  if (s.bold) attributes.push('bold');
  if (s.italic) attributes.push('italic');
  if (s.strike) attributes.push('strikethrough');
  const hasColor = s.color && s.color !== 'default';
  if (attributes.length === 0 && !hasColor) return undefined;
  const ts: TextStyle = {};
  if (attributes.length) ts.attributes = attributes as TextStyle['attributes'];
  if (hasColor) ts.color = s.color;
  return ts;
}

function makeText(content: string, s: InlineStyle): CardElement {
  // 飞书客户端渲染 lark_md 时会还原 HTML 实体（`&#45;` → `-`）；plain_text
  // 文本节点也必须还原，否则 `escapeMarkdown()` 写出的转义会原样显示。
  // 代码块 / 行内代码故意不经过这里：CommonMark 的 code span 不解码实体。
  const property: CardElement['property'] = { content: decodeMarkdownEntities(content) };
  const ts = styleAttrs(s);
  if (ts) property!.textStyle = ts;
  return { tag: 'plain_text', property };
}

/**
 * 把一段（可能含软换行 \n）行内文本解析成子元素数组。
 * 逐字符扫描，维护加粗/斜体/删除线/颜色状态；状态切换或遇到特殊构造时，
 * 把累积的纯文本冲刷为一个 plain_text 段（对称于 rebuildMarkdown 的分段模型）。
 */
export function parseInline(text: string): CardElement[] {
  const out: CardElement[] = [];
  const style: InlineStyle = { bold: false, italic: false, strike: false };
  let buf = '';

  const flush = () => {
    if (buf) { out.push(makeText(buf, style)); buf = ''; }
  };

  let i = 0;
  const n = text.length;
  const startsWith = (s: string) => text.startsWith(s, i);

  while (i < n) {
    const c = text[i];

    // 软换行 → br。紧跟显式 <br> 的换行不再叠加一个空行
    // （CommonMark：行尾硬换行消耗该行结尾，不会再产生软换行）。
    if (c === '\n') {
      flush();
      if (out[out.length - 1]?.tag !== 'br') out.push({ tag: 'br', property: {} });
      i += 1; continue;
    }

    // 转义：\* \_ \` 等，原样取下一个字符
    if (c === '\\' && i + 1 < n) { buf += text[i + 1]; i += 2; continue; }

    // :Key: emoji 短码 —— 仅当 key 在表内才成 emoji，否则原样留字面
    // （未知 key 如 :NOTAREALKEY: 与正文裸冒号 时间:值 都保持文本）
    if (c === ':') {
      const mm = /^:([A-Za-z0-9_]+):/.exec(text.slice(i));
      if (mm && EMOJI_KEY_TO_NAME[mm[1]]) {
        flush();
        out.push({ tag: 'emoji', property: { key: mm[1] } });
        i += mm[0].length; continue;
      }
    }

    // 加粗 **（先于单星判定）
    if (startsWith('**')) { flush(); style.bold = !style.bold; i += 2; continue; }

    // 删除线 ~~
    if (startsWith('~~')) { flush(); style.strike = !style.strike; i += 2; continue; }

    // 斜体 * 或 _（单字符；避免把 ** 的第二个星、或单词内下划线误判）
    if ((c === '*' || c === '_')) {
      const prev = text[i - 1];
      const next = text[i + 1];
      // 下划线只有在词边界处才作斜体，避免 file_name 被拆开
      const boundaryOk = c === '*' || (!isWord(prev) || !isWord(next));
      if (boundaryOk) { flush(); style.italic = !style.italic; i += 1; continue; }
    }

    // 行内代码 `...`
    if (c === '`') {
      const end = text.indexOf('`', i + 1);
      if (end !== -1) {
        flush();
        out.push({ tag: 'code_span', property: { content: text.slice(i + 1, end) } });
        i = end + 1; continue;
      }
    }

    // 图片 ![alt](url)（full markdown：img_v3_… 走 img_key，http/data 走 src）
    if (c === '!' && text[i + 1] === '[') {
      const img = matchLink(text, i + 1);
      if (img) {
        flush();
        const property: Record<string, unknown> = { alt: img.text };
        if (/^(?:https?:)?\/\//i.test(img.url) || img.url.startsWith('data:')) {
          property.src = img.url;
        } else {
          property.img_key = img.url;
        }
        out.push({ tag: 'img', property: property as never });
        i = img.end; continue;
      }
    }

    // 链接 [text](url)
    if (c === '[') {
      const link = matchLink(text, i);
      if (link) {
        flush();
        const property: CardElement['property'] = { content: link.text, url: link.url };
        const ts = styleAttrs(style);
        if (ts) property!.textStyle = ts;
        out.push({ tag: 'link', property });
        i = link.end; continue;
      }
    }

    // <font color='x'>...</font>
    if (startsWith('<font')) {
      const m = /^<font\s+color=['"]?([^'">]+)['"]?\s*>/.exec(text.slice(i));
      if (m) { flush(); style.color = m[1]; i += m[0].length; continue; }
    }
    if (startsWith('</font>')) { flush(); style.color = undefined; i += '</font>'.length; continue; }

    // <at id=xxx></at> / <at id=all></at>
    if (startsWith('<at')) {
      const m = /^<at\s+id=['"]?([^'">\s]+)['"]?\s*>\s*<\/at>/.exec(text.slice(i));
      if (m) {
        flush();
        if (m[1] === 'all') out.push({ tag: 'at_all', property: {} });
        else out.push({ tag: 'at', property: { userID: m[1] } });
        i += m[0].length; continue;
      }
    }

    // <text_tag color='x'>inner</text_tag>
    if (startsWith('<text_tag')) {
      const m = /^<text_tag(?:\s+color=['"]?([^'">]+)['"]?)?\s*>([\s\S]*?)<\/text_tag>/.exec(text.slice(i));
      if (m) {
        flush();
        const property: CardElement['property'] = {
          text: { tag: 'plain_text', property: { content: m[2] } },
        };
        if (m[1]) property!.color = m[1];
        out.push({ tag: 'text_tag', property });
        i += m[0].length; continue;
      }
    }

    // <person id='ou_x' show_name=true show_avatar=true style='normal'></person>
    // 飞书 markdown 内联人员：转成 person_v1，无人员表时走 PERSON_FALLBACK_* 降级。
    if (startsWith('<person')) {
      const m = /^<person\b([^>]*?)(?:\/>|>\s*<\/person>)/.exec(text.slice(i));
      if (m) {
        flush();
        const attrs = parseHtmlAttrs(m[1]);
        const property: CardElement['property'] = {
          userID: attrs.id || attrs.user_id || '',
          // 标记为 markdown 内联：渲染时跟正文字号，而非独立 person 的 medium 默认
          avatarFollowFontSize: true,
        };
        if (attrs.show_name != null) property!.showName = attrs.show_name !== 'false';
        if (attrs.show_avatar != null) property!.showAvatar = attrs.show_avatar !== 'false';
        if (attrs.size) property!.size = attrs.size;
        // style=capsule → 胶囊外形：飞书客户端 person 由 property.style 枚举
        // （Normal/Capsule）派生胶囊外形，全客户端无 pillShaped 读取点。
        // 直接保留 style 字符串，不再合成客户端不识别的 pillShaped。
        if (attrs.style) property!.style = attrs.style;
        out.push({ tag: 'person_v1', property });
        i += m[0].length; continue;
      }
    }

    // <audio file_key='…' audio_id='1' show_time=true …>
    // 公开 DSL 富文本内嵌音频 → RAW markdown_audio（与真机一致）。
    // 官方示例多为未闭合开标签 `<audio …>`；同时兼容 `/>` 与 `></audio>`。
    if (startsWith('<audio')) {
      const m = /^<audio\b([^>]*?)(?:\/>|>\s*<\/audio>|>)/.exec(text.slice(i));
      if (m) {
        flush();
        out.push({ tag: 'markdown_audio', property: audioAttrsToProperty(parseHtmlAttrs(m[1])) });
        i += m[0].length; continue;
      }
    }

    // <br> / <br/>：硬换行
    if (startsWith('<br')) {
      const m = /^<br\s*\/?>/i.exec(text.slice(i));
      if (m) {
        flush();
        out.push({ tag: 'br', property: {} });
        i += m[0].length; continue;
      }
    }

    // <hr> / <hr/>：分割线（官方要求单独一行；行内出现也按块级元素处理）
    if (startsWith('<hr')) {
      const m = /^<hr\s*\/?>/i.exec(text.slice(i));
      if (m) {
        flush();
        out.push({ tag: 'hr', property: {} });
        i += m[0].length; continue;
      }
    }

    // <number_tag background_color='…' font_color='…' url='…'>1</number_tag>
    if (startsWith('<number_tag')) {
      const m = /^<number_tag\b([^>]*)>([\s\S]*?)<\/number_tag>/i.exec(text.slice(i));
      if (m) {
        flush();
        out.push({
          tag: 'number_tag',
          property: numberTagAttrsToProperty(parseHtmlAttrs(m[1]), m[2]),
        });
        i += m[0].length; continue;
      }
    }

    // <local_datetime millisecond='…' format_type='date_num' link='…'></local_datetime>
    if (startsWith('<local_datetime')) {
      const m = /^<local_datetime\b([^>]*?)(?:\/>|>\s*<\/local_datetime>)/i.exec(text.slice(i));
      if (m) {
        flush();
        out.push({
          tag: 'local_datetime',
          property: localDateTimeAttrsToProperty(parseHtmlAttrs(m[1])),
        });
        i += m[0].length; continue;
      }
    }

    // <link icon='…' url='…' pc_url='…' ios_url='…' android_url='…'>文案</link>
    if (startsWith('<link')) {
      const m = /^<link\b([^>]*)>([\s\S]*?)<\/link>/i.exec(text.slice(i));
      if (m) {
        flush();
        out.push({
          tag: 'link',
          property: linkAttrsToProperty(parseHtmlAttrs(m[1]), m[2]),
        });
        i += m[0].length; continue;
      }
    }

    // <a href='https://…'>文案</a>
    // RAW 没有 `a` 元素，统一投影为 link（渲染器只注册了 link）。
    if (startsWith('<a')) {
      const m = /^<a\b([^>]*)>([\s\S]*?)<\/a>/i.exec(text.slice(i));
      if (m) {
        flush();
        const attrs = parseHtmlAttrs(m[1]);
        const property: CardElement['property'] = {
          content: decodeMarkdownEntities(m[2]),
        };
        const ts = styleAttrs(style);
        if (ts) property!.textStyle = ts;
        const href = attrs.href || attrs.url;
        if (href) property!.url = href;
        out.push({ tag: 'link', property });
        i += m[0].length; continue;
      }
    }

    buf += c;
    i += 1;
  }
  flush();
  return out;
}

/** 解析 HTML 属性串：`id='x' show_name=true style="normal"` → { id, show_name, style } */
function parseHtmlAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([A-Za-z_][\w-]*)\s*=\s*(?:'([^']*)'|"([^"]*)"|([^\s'">=]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    out[m[1]] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return out;
}

/** HTML 布尔属性：缺省/非 false → true；显式 false/0 → false */
function attrBool(v: string | undefined): boolean | undefined {
  if (v == null) return undefined;
  return v !== 'false' && v !== '0';
}

/**
 * DSL `<audio …>` 属性 → RAW markdown_audio.property。
 * 对齐公开文档：file_key / audio_id / show_time / background_color / fill_color /
 * fallback_url（→ url）等；渲染器读 camelCase。
 */
function audioAttrsToProperty(attrs: Record<string, string>): CardElement['property'] {
  const property: CardElement['property'] = {};
  const fileID = attrs.file_key || attrs.fileID || attrs.file_id;
  if (fileID) property!.fileID = fileID;
  const audioID = attrs.audio_id || attrs.audioID;
  if (audioID) property!.audioID = audioID;
  const showTime = attrBool(attrs.show_time ?? attrs.showTime);
  if (showTime != null) property!.showTime = showTime;
  const showProgress = attrBool(attrs.show_progress_bar ?? attrs.showProgressBar);
  if (showProgress != null) property!.showProgressBar = showProgress;
  const disabled = attrBool(attrs.disabled);
  if (disabled != null) property!.disabled = disabled;
  const bg = attrs.background_color || attrs.backgroundColor;
  if (bg) property!.backgroundColor = bg;
  const fill = attrs.fill_color || attrs.fillColor;
  if (fill) property!.fillColor = fill;
  // 旧客户端降级链：真机 RAW 常挂 { url }；无 fileID 时 resolveMediaSrc 才可能用到
  const fallback = attrs.fallback_url || attrs.fallbackUrl;
  if (fallback) property!.url = { url: fallback };
  // style=speak|normal：预留给后续 speak 样式；不覆盖图标 style 对象字段名冲突时用 audioStyle
  if (attrs.style === 'speak' || attrs.style === 'normal') {
    property!.audioStyle = attrs.style;
  }
  return property;
}

/**
 * `url` / `pc_url` / `ios_url` / `android_url` 属性 → RAW 的 link URL 形态。
 * 只有默认地址时返回字符串；带多端地址时返回 `{ url, pcURL, iosURL, androidURL }`
 * （与 raw-to-dsl 的 link / open_url 投影一致）。
 */
function urlAttrs(attrs: Record<string, string>): string | LinkURL | undefined {
  const url = attrs.url || attrs.href;
  const pc = attrs.pc_url || attrs.pcURL;
  const ios = attrs.ios_url || attrs.iosURL;
  const android = attrs.android_url || attrs.androidURL;
  if (!pc && !ios && !android) return url || undefined;
  const bag: LinkURL = {};
  if (url) bag.url = url;
  if (pc) bag.pcURL = pc;
  if (ios) bag.iosURL = ios;
  if (android) bag.androidURL = android;
  return bag;
}

/** 数字角标属性 → RAW number_tag.property（渲染器读 text 叶子 + camelCase 颜色）。 */
function numberTagAttrsToProperty(
  attrs: Record<string, string>,
  inner: string,
): CardElement['property'] {
  const property: CardElement['property'] = {
    text: { tag: 'plain_text', property: { content: decodeMarkdownEntities(inner) } },
  };
  const bg = attrs.background_color || attrs.backgroundColor;
  if (bg) property!.backgroundColor = bg;
  const fg = attrs.font_color || attrs.fontColor;
  if (fg) property!.fontColor = fg;
  const url = urlAttrs(attrs);
  if (url !== undefined) property!.url = url;
  return property;
}

/** 国际化时间属性 → RAW local_datetime.property（毫秒优先存 number）。 */
function localDateTimeAttrsToProperty(
  attrs: Record<string, string>,
): CardElement['property'] {
  const property: CardElement['property'] = {};
  const ms = attrs.millisecond || attrs.milliseconds;
  if (ms) {
    property!.milliseconds =
      /^-?\d+(?:\.\d+)?$/.test(ms) ? Number(ms) : ms;
  }
  const formatType = attrs.format_type || attrs.formatType;
  if (formatType) property!.formatType = formatType;
  if (attrs.link) property!.link = attrs.link;
  return property;
}

/** 含图标的多端链接属性 → RAW link.property。 */
function linkAttrsToProperty(
  attrs: Record<string, string>,
  inner: string,
): CardElement['property'] {
  const property: CardElement['property'] = {
    content: decodeMarkdownEntities(inner),
  };
  const url = urlAttrs(attrs);
  if (url !== undefined) property!.url = url;
  if (attrs.icon) property!.icon = attrs.icon;
  return property;
}

function isWord(ch: string | undefined): boolean {
  return !!ch && /[\w一-龥]/.test(ch);
}

/** 从 `[` 起匹配 [text](url)，返回文本、url 与结束下标；不成立返回 null */
function matchLink(text: string, start: number): { text: string; url: string; end: number } | null {
  // 找 ] 且紧跟 (
  let depth = 0;
  let j = start;
  for (; j < text.length; j++) {
    if (text[j] === '[') depth++;
    else if (text[j] === ']') { depth--; if (depth === 0) break; }
  }
  if (j >= text.length || text[j + 1] !== '(') return null;
  const label = text.slice(start + 1, j);
  const close = text.indexOf(')', j + 2);
  if (close === -1) return null;
  const url = text.slice(j + 2, close);
  return { text: label, url, end: close + 1 };
}

/* ------------------------------------------------------------------ *
 * 块级解析
 * ------------------------------------------------------------------ */

const RE_HEADING = /^(#{1,6})\s+(.*)$/;
const RE_HR = /^\s*([-*_])\1{2,}\s*$/;
const RE_HTML_HR = /^\s*<hr\s*\/?>\s*$/i;
const RE_LIST = /^(\s*)([-*+]|\d+\.)\s+(.*)$/;
const RE_FENCE = /^\s*```(.*)$/;

/**
 * markdown 字符串 → 子元素数组（块级 + 行内）。
 * 逐行扫描识别块构造；连续的普通文本行合并为一段，用 br 承载软换行。
 */
export function parseMarkdown(content: string | undefined | null): CardElement[] {
  if (!content) return [];
  const lines = String(content).replace(/\r\n?/g, '\n').split('\n');
  const out: CardElement[] = [];
  let para: string[] = [];

  const flushPara = () => {
    if (para.length === 0) return;
    // 段内软换行用 \n 交给 parseInline 转成 br
    const seg = parseInline(para.join('\n'));
    out.push(...seg);
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 空行：结束当前段落，并补一个 br 以还原段间距（渲染器 markdown 是单 div，靠 br 断行）
    if (line.trim() === '') {
      if (para.length) { flushPara(); out.push({ tag: 'br', property: {} }); }
      continue;
    }

    // 围栏代码块 ```lang ... ```
    const fence = RE_FENCE.exec(line);
    if (fence) {
      flushPara();
      const language = fence[1].trim();
      const body: string[] = [];
      i++;
      for (; i < lines.length; i++) {
        if (/^\s*```/.test(lines[i])) break;
        body.push(lines[i]);
      }
      out.push({
        tag: 'code_block',
        property: {
          language,
          contents: body.map((l) => ({ contents: [{ content: l }] })),
        },
      });
      continue;
    }

    // 标题
    const heading = RE_HEADING.exec(line);
    if (heading) {
      flushPara();
      out.push({
        tag: 'heading',
        property: { level: heading[1].length, elements: parseInline(heading[2]) },
      });
      continue;
    }

    // 分割线（`---` 或官方推荐的 `<hr>` / `<hr/>`，须单独一行）
    if (RE_HR.test(line) || RE_HTML_HR.test(line)) {
      flushPara(); out.push({ tag: 'hr', property: {} }); continue;
    }

    // 引用块（连续 > 行合并）
    if (/^\s*>\s?/.test(line)) {
      flushPara();
      const quote: string[] = [];
      for (; i < lines.length; i++) {
        if (!/^\s*>\s?/.test(lines[i])) { i--; break; }
        quote.push(lines[i].replace(/^\s*>\s?/, ''));
      }
      out.push({ tag: 'blockquote', property: { elements: parseInline(quote.join('\n')) } });
      continue;
    }

    // 列表（连续列表项合并；含缩进层级与有序/无序）
    if (RE_LIST.test(line)) {
      flushPara();
      const items: NonNullable<CardElement['property']>['items'] = [];
      let counter = 0;
      let lastOrdered: boolean | undefined;
      for (; i < lines.length; i++) {
        const m = RE_LIST.exec(lines[i]);
        if (!m) { i--; break; }
        const indent = m[1].replace(/\t/g, '  ').length;
        const level = Math.floor(indent / 2);
        const ordered = /\d+\./.test(m[2]);
        if (ordered !== lastOrdered) counter = 0;
        lastOrdered = ordered;
        const item: NonNullable<NonNullable<CardElement['property']>['items']>[number] = {
          type: ordered ? 'ol' : 'ul',
          level,
          elements: parseInline(m[3]),
        };
        if (ordered) { counter += 1; item.order = counter; }
        items!.push(item);
      }
      out.push({ tag: 'list', property: { items } });
      continue;
    }

    // 普通文本行 → 累积到当前段落
    para.push(line);
  }
  flushPara();
  return out;
}
